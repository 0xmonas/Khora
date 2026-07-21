import { describe, it, expect } from 'vitest';
import {
  keccak256, concatHex, toHex, padHex, encodeAbiParameters, stringToHex,
  hashTypedData, recoverTypedDataAddress, verifyTypedData, getAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  buildAgentWalletTypedData,
  encodeAgentWalletBlob,
  decodeAgentWalletBlob,
  AGENT_WALLET_DOMAIN_NAME,
  AGENT_WALLET_DOMAIN_VERSION,
} from '@/lib/contracts/agent-wallet';

// Deterministic throwaway key — NOT a real wallet.
const AGENT_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const REGISTRY = getAddress('0x8004A169FB4a3325136EB29fA0ceB6D2e539a432');
const ADAPTER = getAddress('0xde152AfB7db5373F34876E1499fbD893A82dD336'); // owner (adapter) for bound agents
const CHAIN_ID = 1;
const AGENT_ID = BigInt(36637);
const DEADLINE = BigInt(1_800_000_000);

/**
 * Independently reproduce the EIP-712 digest so we test the scheme, not just
 * re-call viem's hashTypedData:
 *   domainSeparator = keccak256(abi.encode(
 *     keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
 *     keccak256(name), keccak256(version), chainId, verifyingContract))
 *   structHash = keccak256(abi.encode(
 *     keccak256("AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)"),
 *     agentId, newWallet, owner, deadline))
 *   digest = keccak256(0x1901 || domainSeparator || structHash)
 */
function manualDigest(newWallet: `0x${string}`) {
  const domainTypeHash = keccak256(
    stringToHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
  );
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
      [
        domainTypeHash,
        keccak256(stringToHex(AGENT_WALLET_DOMAIN_NAME)),
        keccak256(stringToHex(AGENT_WALLET_DOMAIN_VERSION)),
        BigInt(CHAIN_ID),
        REGISTRY,
      ],
    ),
  );
  const structTypeHash = keccak256(
    stringToHex('AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)'),
  );
  const structHash = keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }],
      [structTypeHash, AGENT_ID, newWallet, ADAPTER, DEADLINE],
    ),
  );
  return keccak256(concatHex(['0x1901', domainSeparator, structHash]));
}

describe('agent wallet EIP-712 typed data', () => {
  const account = privateKeyToAccount(AGENT_KEY);
  const typed = buildAgentWalletTypedData({
    chainId: CHAIN_ID,
    registry: REGISTRY,
    agentId: AGENT_ID,
    newWallet: account.address,
    owner: ADAPTER,
    deadline: DEADLINE,
  });

  it('viem digest matches an independent EIP-712 reproduction', () => {
    expect(hashTypedData(typed)).toBe(manualDigest(account.address));
  });

  it('signature recovers to the agent (newWallet), which the registry requires', async () => {
    const signature = await account.signTypedData(typed);
    const recovered = await recoverTypedDataAddress({ ...typed, signature });
    expect(getAddress(recovered)).toBe(getAddress(account.address));
    expect(await verifyTypedData({ ...typed, address: account.address, signature })).toBe(true);
  });

  it('a different wallet does NOT satisfy the newWallet consent', async () => {
    const signature = await account.signTypedData(typed);
    const other = getAddress('0x1111111111111111111111111111111111111111');
    expect(await verifyTypedData({ ...typed, address: other, signature })).toBe(false);
  });

  it('digest is bound to agentId + owner + deadline (tamper-evident)', () => {
    const base = manualDigest(account.address);
    const wrongAgent = hashTypedData(buildAgentWalletTypedData({
      chainId: CHAIN_ID, registry: REGISTRY, agentId: AGENT_ID + BigInt(1),
      newWallet: account.address, owner: ADAPTER, deadline: DEADLINE,
    }));
    const wrongOwner = hashTypedData(buildAgentWalletTypedData({
      chainId: CHAIN_ID, registry: REGISTRY, agentId: AGENT_ID,
      newWallet: account.address, owner: getAddress('0x2222222222222222222222222222222222222222'), deadline: DEADLINE,
    }));
    expect(wrongAgent).not.toBe(base);
    expect(wrongOwner).not.toBe(base);
  });
});

describe('agent wallet blob', () => {
  const blob = {
    v: 1 as const,
    chainId: 1,
    agentId: '36637',
    wallet: getAddress('0x9c54a9c609212d2fd034b55cf3b42ba99af52880'),
    deadline: '1800000000',
    signature: ('0x' + 'ab'.repeat(65)) as `0x${string}`,
  };

  it('round-trips encode → decode', () => {
    const decoded = decodeAgentWalletBlob(encodeAgentWalletBlob(blob));
    expect(decoded).toEqual(blob);
  });

  it('tolerates surrounding whitespace', () => {
    expect(decodeAgentWalletBlob(`  ${encodeAgentWalletBlob(blob)}\n`)).toEqual(blob);
  });

  it('rejects garbage / malformed input', () => {
    expect(decodeAgentWalletBlob('not-base64!!')).toBeNull();
    expect(decodeAgentWalletBlob(btoa('{"v":2}'))).toBeNull();
    expect(decodeAgentWalletBlob(btoa(JSON.stringify({ ...blob, wallet: '0xnope' })))).toBeNull();
    expect(decodeAgentWalletBlob(btoa(JSON.stringify({ ...blob, agentId: 'x' })))).toBeNull();
  });
});
