import { createPublicClient, http, getAddress, parseAbiItem, type Hex } from 'viem';
import { shape, mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getRedis } from '@/lib/server/redis';
import {
  claimDigest,
  getBooaEthAddress,
  getBurnHelperAddress,
  getShapeBooaAddress,
  ETH_MAINNET_CHAIN_ID,
  MIGRATION_MAX_SUPPLY,
} from '@/lib/contracts/booa-eth';

/**
 * Migration backend — burn-to-claim Shape → Ethereum.
 *
 * A holder burns a BOOA on Shape; this module verifies the burn ON-CHAIN and
 * only then signs a claim ticket the holder submits to BOOAEth on Ethereum.
 * The operator key never signs a ticket for a token that was not actually
 * burned by the requesting address — verification is the trust anchor, not
 * any cached state.
 */

const ZERO = '0x0000000000000000000000000000000000000000';

const SHAPE_RPC =
  process.env.SHAPE_RPC_URL ||
  process.env.NEXT_PUBLIC_SHAPE_RPC_URL ||
  'https://mainnet.shape.network';

/** Shape confirmations required before a burn is considered final (reorg guard). */
export const MIGRATION_CONFIRMATIONS = BigInt(process.env.MIGRATION_CONFIRMATIONS || '10');

/**
 * Hard floor for burn-event scans: the block BOOABurnHelper was deployed on Shape.
 * No migration burn can exist before it, so scanning down to this block gives
 * complete coverage for the entire life of the migration. A rolling
 * `latest - N` window instead makes older burns silently unprovable, which for an
 * already-burned token means permanent loss.
 */
const BURN_FLOOR_BLOCK = BigInt(process.env.MIGRATION_BURN_FLOOR_BLOCK || '31303050');
const LOG_PAGE = BigInt(9_999);

/** Confirmed burns are memoised forever so a token is scanned deeply only once. */
const BURN_MEMO_PREFIX = 'migration:burn:v1:';

function makeShapeClient() {
  return createPublicClient({ chain: shape, transport: http(SHAPE_RPC) });
}
let _shape: ReturnType<typeof makeShapeClient> | null = null;
function shapeClient() {
  if (!_shape) _shape = makeShapeClient();
  return _shape;
}

/**
 * True when the migration operator key derives to the SAME address as the Shape mint
 * signer (SIGNER_PRIVATE_KEY) — whether via the fallback below or because both env
 * vars hold the same key. BOOAEth.claim() trusts this signature alone (no on-chain
 * burn proof), so a shared key means one leak compromises both minting and migration.
 * This detects the shared state by comparing derived addresses, not env presence, so
 * it cannot be fooled by pasting the same key into MIGRATION_OPERATOR_PRIVATE_KEY.
 */
export function isSharedSigner(): boolean {
  const opKey = process.env.MIGRATION_OPERATOR_PRIVATE_KEY || process.env.SIGNER_PRIVATE_KEY;
  const mintKey = process.env.SIGNER_PRIVATE_KEY;
  if (!opKey || !mintKey) return false;
  try {
    return (
      privateKeyToAccount(opKey as Hex).address.toLowerCase() ===
      privateKeyToAccount(mintKey as Hex).address.toLowerCase()
    );
  } catch {
    return false;
  }
}

let _operator: ReturnType<typeof privateKeyToAccount> | null = null;
function operator() {
  if (!_operator) {
    // Fallback kept so the live migration keeps working; rotating to a dedicated
    // KMS key + BOOAEth.setOperatorSigner() is an operator action, not a code one.
    // The shared state is surfaced loudly (warn below + `sharedSigner` in the status
    // API) rather than silently, and can no longer re-merge unnoticed.
    const key = process.env.MIGRATION_OPERATOR_PRIVATE_KEY || process.env.SIGNER_PRIVATE_KEY;
    if (!key) {
      throw new Error('No operator key configured (MIGRATION_OPERATOR_PRIVATE_KEY or SIGNER_PRIVATE_KEY)');
    }
    if (isSharedSigner()) {
      console.warn(
        '[migration] operator key equals the Shape mint signer (SIGNER_PRIVATE_KEY). ' +
          'Rotate to a dedicated KMS key and call BOOAEth.setOperatorSigner — a single ' +
          'leak currently compromises both minting and L1 migration claims.',
      );
    }
    _operator = privateKeyToAccount(key as Hex);
  }
  return _operator;
}

/** The operator address holders can independently verify against `operatorSigner`. */
export function getOperatorAddress(): `0x${string}` | null {
  try {
    return operator().address;
  } catch {
    return null;
  }
}

export interface MigrationConfig {
  enabled: boolean;
  reason?: 'not_deployed' | 'no_signer';
  booaEth: `0x${string}` | null;
  burnHelper: `0x${string}` | null;
  shapeBooa: `0x${string}` | null;
  operator: `0x${string}` | null;
  sharedSigner: boolean;
  ethChainId: number;
  confirmations: number;
}

export function migrationConfig(): MigrationConfig {
  const booaEth = getBooaEthAddress();
  const op = getOperatorAddress();
  const enabled = Boolean(booaEth && op);
  return {
    enabled,
    reason: !booaEth ? 'not_deployed' : !op ? 'no_signer' : undefined,
    booaEth,
    burnHelper: getBurnHelperAddress(),
    shapeBooa: getShapeBooaAddress(),
    operator: op,
    sharedSigner: isSharedSigner(),
    ethChainId: ETH_MAINNET_CHAIN_ID,
    confirmations: Number(MIGRATION_CONFIRMATIONS),
  };
}

/**
 * Read `BOOAEth.claimsPaused()` on Ethereum. Returns true when claims are OPEN.
 * Null when the contract isn't configured/reachable. Used so the UI blocks
 * burning until launch day even if the env addresses are already set.
 */
export async function readClaimsOpen(): Promise<boolean | null> {
  const booaEth = getBooaEthAddress();
  if (!booaEth) return null;
  try {
    const eth = createPublicClient({
      chain: mainnet,
      transport: http(process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com'),
    });
    const paused = await eth.readContract({
      address: booaEth,
      abi: [
        {
          type: 'function',
          name: 'claimsPaused',
          stateMutability: 'view',
          inputs: [],
          outputs: [{ name: '', type: 'bool' }],
        },
      ] as const,
      functionName: 'claimsPaused',
    });
    return !paused;
  } catch {
    return null;
  }
}

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
);
const MIGRATION_BURN_EVENT = parseAbiItem(
  'event MigrationBurn(address indexed holder, uint256 indexed tokenId)',
);

export type BurnCheck =
  | { ok: true }
  | { ok: false; reason: 'bad_token' | 'not_burned' | 'no_event' | 'unconfirmed' | 'wrong_holder' };

/**
 * Verify on-chain that `holder` burned `tokenId` on Shape.
 *
 * Three independent checks, all must pass before we sign:
 *  1. The token is actually gone — `ownerOf` reverts (real burn, not just a transfer).
 *  2. A burn event exists that credits THIS holder:
 *       - direct burn:   Transfer(holder, 0x0, tokenId)
 *       - helper burn:    MigrationBurn(holder, tokenId)   (Transfer.from is the helper)
 *  3. That event is at least MIGRATION_CONFIRMATIONS deep (reorg guard).
 */
export async function verifyBurn(holder: `0x${string}`, tokenId: number): Promise<BurnCheck> {
  if (!Number.isInteger(tokenId) || tokenId < 0 || tokenId >= MIGRATION_MAX_SUPPLY) {
    return { ok: false, reason: 'bad_token' };
  }
  const shapeBooa = getShapeBooaAddress();
  if (!shapeBooa) return { ok: false, reason: 'no_event' };

  const client = shapeClient();

  // (1) Token must no longer exist — a burned ERC721 reverts on ownerOf.
  let stillExists = false;
  try {
    await client.readContract({
      address: shapeBooa,
      abi: [
        {
          type: 'function',
          name: 'ownerOf',
          stateMutability: 'view',
          inputs: [{ name: 'tokenId', type: 'uint256' }],
          outputs: [{ name: '', type: 'address' }],
        },
      ] as const,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)],
    });
    stillExists = true;
  } catch {
    stillExists = false;
  }
  if (stillExists) return { ok: false, reason: 'not_burned' };

  // A burn already proven for this holder never needs re-scanning.
  const memoKey = `${BURN_MEMO_PREFIX}${tokenId}`;
  try {
    const memo = await getRedis().get<{ holder: string }>(memoKey);
    if (memo?.holder && memo.holder === holder.toLowerCase()) return { ok: true };
  } catch { /* cache unavailable — fall through to the scan */ }

  // (2) + (3) Find a burn event crediting this holder, confirmed deep enough.
  const latest = await client.getBlockNumber();
  const floor = latest > BURN_FLOOR_BLOCK ? BURN_FLOOR_BLOCK : BigInt(0);
  const helper = getBurnHelperAddress();

  let cursor = latest;
  while (cursor >= floor) {
    const from = cursor > LOG_PAGE ? cursor - LOG_PAGE : BigInt(0);

    const directBurns = await client.getLogs({
      address: shapeBooa,
      event: TRANSFER_EVENT,
      args: { from: holder, to: ZERO as `0x${string}`, tokenId: BigInt(tokenId) },
      fromBlock: from,
      toBlock: cursor,
    });
    const helperBurns = helper
      ? await client.getLogs({
          address: helper,
          event: MIGRATION_BURN_EVENT,
          args: { holder, tokenId: BigInt(tokenId) },
          fromBlock: from,
          toBlock: cursor,
        })
      : [];

    const hit = [...directBurns, ...helperBurns].sort((a, b) =>
      Number((b.blockNumber ?? BigInt(0)) - (a.blockNumber ?? BigInt(0))),
    )[0];

    if (hit) {
      const confirmations = latest - (hit.blockNumber ?? latest);
      if (confirmations < MIGRATION_CONFIRMATIONS) return { ok: false, reason: 'unconfirmed' };
      try {
        await getRedis().set(memoKey, {
          holder: holder.toLowerCase(),
          block: Number(hit.blockNumber ?? 0),
        });
      } catch { /* cache write is best-effort */ }
      return { ok: true };
    }

    if (from === BigInt(0)) break;
    cursor = from - BigInt(1);
  }

  return { ok: false, reason: 'no_event' };
}

const BURN_INDEX_KEY = 'migration:burns:index:v1';
const BURN_SCAN_BUDGET_MS = 40_000;

interface BurnRecord { tokenId: number; holder: string; block: number }
interface BurnIndex { cursor: number; burns: BurnRecord[] }

async function scanBurns(): Promise<{ burns: BurnRecord[]; complete: boolean }> {
  const helper = getBurnHelperAddress();
  const shapeBooa = getShapeBooaAddress();
  const client = shapeClient();

  let index: BurnIndex | null = null;
  try {
    index = await getRedis().get<BurnIndex>(BURN_INDEX_KEY);
  } catch { /* rebuild from the floor */ }

  const latest = await client.getBlockNumber();
  const byKey = new Map((index?.burns ?? []).map((b) => [`${b.tokenId}:${b.holder}`, b]));
  const add = (tokenId: bigint | undefined, holder: string | undefined, block: bigint | null) => {
    if (tokenId === undefined || !holder) return;
    const rec = { tokenId: Number(tokenId), holder: holder.toLowerCase(), block: Number(block ?? 0) };
    byKey.set(`${rec.tokenId}:${rec.holder}`, rec);
  };

  // Some Shape RPCs reject partial indexed-topic filters, so match in JS.
  let scannedTo = index ? BigInt(index.cursor) : BURN_FLOOR_BLOCK - BigInt(1);
  let failed = false;
  const started = Date.now();
  while (scannedTo < latest && Date.now() - started < BURN_SCAN_BUDGET_MS) {
    const from = scannedTo + BigInt(1);
    const to = from + LOG_PAGE > latest ? latest : from + LOG_PAGE;
    try {
      const [direct, viaHelper] = await Promise.all([
        shapeBooa
          ? client.getLogs({ address: shapeBooa, event: TRANSFER_EVENT, fromBlock: from, toBlock: to })
          : Promise.resolve([]),
        helper
          ? client.getLogs({ address: helper, event: MIGRATION_BURN_EVENT, fromBlock: from, toBlock: to })
          : Promise.resolve([]),
      ]);
      for (const l of direct) {
        const a = l.args as { from?: string; to?: string; tokenId?: bigint };
        if (a.to?.toLowerCase() === ZERO) add(a.tokenId, a.from, l.blockNumber);
      }
      for (const l of viaHelper) {
        const a = l.args as { holder?: string; tokenId?: bigint };
        add(a.tokenId, a.holder, l.blockNumber);
      }
      scannedTo = to;
    } catch {
      failed = true;
      break;
    }
  }

  const burns = Array.from(byKey.values());
  if (!index || BigInt(index.cursor) !== scannedTo) {
    try {
      await getRedis().set(BURN_INDEX_KEY, { cursor: Number(scannedTo), burns });
    } catch { /* rescanned next call */ }
  }
  return { burns, complete: !failed && scannedTo >= latest };
}

/**
 * Recovery: find tokens this holder already burned on Shape but has NOT yet
 * claimed on Ethereum. Covers the case where the claim tx failed after the burn
 * succeeded (wallet timeout, page reload) — the burn is permanent, so the holder
 * must be able to claim later without re-burning. Reads purely on-chain.
 */
export async function findBurnedUnclaimed(
  holder: `0x${string}`,
): Promise<{ tokenIds: number[]; complete: boolean }> {
  const booaEth = getBooaEthAddress();
  const helper = getBurnHelperAddress();
  const shapeBooa = getShapeBooaAddress();
  if (!booaEth || (!helper && !shapeBooa)) return { tokenIds: [], complete: true };

  const { burns, complete } = await scanBurns();
  const holderLc = holder.toLowerCase();
  const burned = new Set(burns.filter((b) => b.holder === holderLc).map((b) => b.tokenId));
  if (burned.size === 0) return { tokenIds: [], complete };

  // Keep only tokens NOT yet claimed on Ethereum.
  const eth = createPublicClient({
    chain: mainnet,
    transport: http(process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com'),
  });
  const claimedAbi = [
    { type: 'function', name: 'claimed', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  ] as const;
  const pending: number[] = [];
  for (const id of Array.from(burned).sort((a, b) => a - b)) {
    const claimed = await eth
      .readContract({ address: booaEth, abi: claimedAbi, functionName: 'claimed', args: [BigInt(id)] })
      .catch(() => false);
    if (!claimed) pending.push(id);
  }
  return { tokenIds: pending, complete };
}

/**
 * Sign a claim ticket for (claimer, tokenId) — ONLY after the burn is verified.
 * Isolated behind this function so a KMS/HSM signer can replace the raw-key path
 * without touching callers.
 */
export async function signClaimTicket(
  claimer: `0x${string}`,
  tokenId: number,
): Promise<Hex> {
  const booaEth = getBooaEthAddress();
  if (!booaEth) throw new Error('BOOAEth address not configured');
  const digest = claimDigest(booaEth, getAddress(claimer), tokenId, ETH_MAINNET_CHAIN_ID);
  return operator().signMessage({ message: { raw: digest } });
}

export interface TicketResult {
  tokenId: number;
  signature: Hex | null;
  status: 'ready' | 'not_burned' | 'unconfirmed' | 'already_claimed' | 'error';
}

/** Verify each requested tokenId and sign a ticket for the ones that pass. */
export async function buildTickets(
  claimer: `0x${string}`,
  tokenIds: number[],
): Promise<TicketResult[]> {
  const booaEth = getBooaEthAddress();
  if (!booaEth) throw new Error('BOOAEth address not configured');
  const eth = createPublicClient({
    chain: mainnet,
    transport: http(process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com'),
  });

  const out: TicketResult[] = [];
  for (const tokenId of tokenIds) {
    try {
      // Skip anything already claimed on Ethereum — no point signing.
      const alreadyClaimed = await eth
        .readContract({
          address: booaEth,
          abi: [
            {
              type: 'function',
              name: 'claimed',
              stateMutability: 'view',
              inputs: [{ name: 'tokenId', type: 'uint256' }],
              outputs: [{ name: '', type: 'bool' }],
            },
          ] as const,
          functionName: 'claimed',
          args: [BigInt(tokenId)],
        })
        .catch(() => false);
      if (alreadyClaimed) {
        out.push({ tokenId, signature: null, status: 'already_claimed' });
        continue;
      }

      const check = await verifyBurn(claimer, tokenId);
      if (!check.ok) {
        out.push({
          tokenId,
          signature: null,
          status:
            check.reason === 'unconfirmed'
              ? 'unconfirmed'
              : check.reason === 'not_burned' || check.reason === 'no_event'
                ? 'not_burned'
                : 'error',
        });
        continue;
      }

      const signature = await signClaimTicket(claimer, tokenId);
      out.push({ tokenId, signature, status: 'ready' });
    } catch {
      out.push({ tokenId, signature: null, status: 'error' });
    }
  }
  return out;
}
