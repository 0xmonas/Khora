import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getRedis } from '@/lib/server/redis';
import { getAI } from '@/lib/server/gemini';
import { BOOA_V2_ABI, getV2Address } from '@/lib/contracts/booa-v2';
import { getAdapterAddress, BOOA_ADAPTER_ABI } from '@/lib/contracts/booa-adapter';
import { CHAIN_CONFIG } from '@/types/agent';

const MODEL = process.env.GEMINI_WIKI_MODEL || 'gemini-2.5-flash-lite';
const DAILY_MAX = Number(process.env.WIKI_DAILY_GLOBAL_MAX || 300);
const REFRESH_MS = Number(process.env.WIKI_REFRESH_SECONDS || 600) * 1000;
const ETH_CHAIN_ID = 1;
const SHAPE_CHAIN_ID = 360;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || '';
const ETH_RPC = ALCHEMY_API_KEY ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}` : '';
const SHAPE_RPC = process.env.NEXT_PUBLIC_SHAPE_RPC_URL || 'https://mainnet.shape.network';
const ZERO = '0x0000000000000000000000000000000000000000';

export const MAX_TOKEN_ID = 3332;

interface AgentIdentity {
  id: number;
  name: string;
  creature: string;
  vibe: string;
  emoji: string;
  skills: string[];
  domains: string[];
  personality: string[];
  boundaries: string[];
  description: string;
  appearance: Record<string, string>;
}

interface WikiTransfer {
  from: string;
  to: string;
  block: number;
  time: number | null;
}

interface WikiRegistration {
  chain: string;
  chainId: number;
  agentId: number;
  registeredBy: string | null;
}

interface WikiBinding {
  agentId: number;
  controller: string | null;
}

interface WikiFacts {
  owner: string | null;
  transfers: WikiTransfer[] | null;
  registrations: WikiRegistration[];
  binding: WikiBinding | null;
}

interface WikiEntry {
  date: string;
  text: string;
}

interface WikiDoc {
  revision: number;
  updatedAt: number;
  factsHash: string | null;
  facts: WikiFacts;
  entries: WikiEntry[];
}

export interface WikiConnection {
  id: number;
  name: string;
  why: string;
}

export interface WikiResult {
  tokenId: number;
  name: string;
  markdown: string;
  meta: {
    tokenId: number;
    name: string;
    creature: string;
    vibe: string;
    owner: string | null;
    revision: number;
    updatedAt: string;
    entries: number;
    connections: WikiConnection[];
  };
}

const APPEARANCE_TRAITS = ['Hair', 'Eyes', 'Mouth', 'Facial Feature', 'Headwear', 'Outfit', 'Skin', 'Meme Core', 'Trait Intensity', 'Palette'];

let agentIndex: Map<number, AgentIdentity> | null = null;

async function loadAgents(): Promise<Map<number, AgentIdentity>> {
  if (agentIndex) return agentIndex;
  const file = await fs.readFile(path.join(process.cwd(), 'public/data/agents.json'), 'utf8');
  const raw = JSON.parse(file) as Array<{
    id: number; name: string; creature: string; vibe: string; emoji: string;
    skills: string[]; domains: string[]; personality: string[]; boundaries: string[];
    traits: Array<{ trait_type: string; value: string }>;
  }>;
  agentIndex = new Map(
    raw.map((a) => {
      const appearance: Record<string, string> = {};
      let description = '';
      for (const t of a.traits || []) {
        if (t.trait_type === 'Description') description = t.value;
        else if (APPEARANCE_TRAITS.includes(t.trait_type)) appearance[t.trait_type] = t.value;
      }
      return [a.id, {
        id: a.id, name: a.name, creature: a.creature, vibe: a.vibe, emoji: a.emoji,
        skills: a.skills || [], domains: a.domains || [], personality: a.personality || [],
        boundaries: a.boundaries || [], description, appearance,
      }];
    }),
  );
  return agentIndex;
}

async function getIdentity(tokenId: number): Promise<AgentIdentity | null> {
  const index = await loadAgents();
  return index.get(tokenId) ?? null;
}

async function fetchChainOn(chainId: number, rpc: string, tokenId: number): Promise<{ owner: string | null; transfers: WikiTransfer[] | null }> {
  const { createPublicClient, http, parseAbiItem } = await import('viem');
  const { shape, mainnet } = await import('viem/chains');
  const client = createPublicClient({
    chain: chainId === ETH_CHAIN_ID ? mainnet : shape,
    transport: http(rpc || undefined),
  });
  const address = getV2Address(chainId);
  if (!address || address.length <= 2) return { owner: null, transfers: null };

  let owner: string | null = null;
  try {
    owner = (await client.readContract({
      address, abi: BOOA_V2_ABI, functionName: 'ownerOf', args: [BigInt(tokenId)],
    })) as string;
  } catch {
    // ownerOf reverts when the token does not live on this chain (e.g. not yet
    // migrated to Ethereum) — signal "not here" so the caller can fall back.
    return { owner: null, transfers: null };
  }

  let transfers: WikiTransfer[] | null = null;
  try {
    const event = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)');
    const latest = await client.getBlockNumber();
    const PAGE = BigInt(9999);
    const pages = Math.min(10, Math.max(1, Number(process.env.WIKI_LOG_PAGES || 3)));
    const logs = [];
    let toBlock = latest;
    for (let i = 0; i < pages; i++) {
      const fromBlock = toBlock >= PAGE ? toBlock - PAGE : BigInt(0);
      const chunk = await client.getLogs({
        address, event, args: { tokenId: BigInt(tokenId) }, fromBlock, toBlock,
      });
      logs.push(...chunk);
      if (fromBlock === BigInt(0)) break;
      toBlock = fromBlock - BigInt(1);
    }
    logs.sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : 1));
    const recent = logs.slice(-12);
    const blocks = await Promise.all(
      recent.map((l) => client.getBlock({ blockNumber: l.blockNumber }).catch(() => null)),
    );
    transfers = recent.map((l, i) => ({
      from: (l.args.from as string) || ZERO,
      to: (l.args.to as string) || ZERO,
      block: Number(l.blockNumber),
      time: blocks[i] ? Number(blocks[i]!.timestamp) * 1000 : null,
    }));
  } catch { /* log scan unavailable — degrade */ }

  return { owner, transfers };
}

async function fetchChain(tokenId: number): Promise<{ owner: string | null; transfers: WikiTransfer[] | null }> {
  // Canonical home is Ethereum post-migration. Read there first; fall back to
  // Shape for tokens whose holders have not migrated yet.
  const eth = await fetchChainOn(ETH_CHAIN_ID, ETH_RPC, tokenId);
  if (eth.owner) return eth;
  return fetchChainOn(SHAPE_CHAIN_ID, SHAPE_RPC, tokenId);
}

// Is this BOOA Awakened? Read the Adapter8004 binding straight from chain: scan
// AgentBound events (filtered by the BOOA contract), confirm the current binding
// via bindingOf, and take the NFT holder as the controller. No cache dependency.
async function fetchBinding(tokenId: number): Promise<WikiBinding | null> {
  const adapter = getAdapterAddress(ETH_CHAIN_ID);
  const booa = getV2Address(ETH_CHAIN_ID);
  if (!adapter || !booa || booa.length <= 2) return null;
  try {
    const { createPublicClient, http, parseAbiItem } = await import('viem');
    const { mainnet } = await import('viem/chains');
    const client = createPublicClient({ chain: mainnet, transport: http(ETH_RPC || undefined) });
    const event = parseAbiItem(
      'event AgentBound(uint256 indexed agentId, uint8 indexed standard, address indexed tokenContract, uint256 tokenId, address registeredBy)'
    );
    const latest = await client.getBlockNumber();
    const PAGE = BigInt(9999);
    const MAX_PAGES = 8;
    let cursor = latest;
    let agentId: number | null = null;
    for (let i = 0; i < MAX_PAGES && agentId === null; i++) {
      const from = cursor > PAGE ? cursor - PAGE : BigInt(0);
      const logs = await client.getLogs({
        address: adapter, event,
        args: { tokenContract: booa as `0x${string}` },
        fromBlock: from, toBlock: cursor,
      });
      for (let j = logs.length - 1; j >= 0; j--) {
        if (Number(logs[j].args.tokenId) === tokenId) { agentId = Number(logs[j].args.agentId); break; }
      }
      if (from === BigInt(0)) break;
      cursor = from - BigInt(1);
    }
    if (agentId === null) return null;

    // Confirm the agent is still bound to this exact token (guards unbind/rebind).
    const binding = await client.readContract({
      address: adapter, abi: BOOA_ADAPTER_ABI, functionName: 'bindingOf', args: [BigInt(agentId)],
    }) as { standard: number; tokenContract: `0x${string}`; tokenId: bigint };
    if (Number(binding.tokenId) !== tokenId || binding.tokenContract.toLowerCase() !== booa.toLowerCase()) return null;

    let controller: string | null = null;
    try {
      controller = (await client.readContract({
        address: booa as `0x${string}`, abi: BOOA_V2_ABI, functionName: 'ownerOf', args: [BigInt(tokenId)],
      })) as string;
    } catch { /* holder read failed — leave null */ }

    return { agentId, controller };
  } catch {
    return null;
  }
}

async function fetchRegistrations(tokenId: number): Promise<WikiRegistration[]> {
  try {
    const redis = getRedis();
    const chains = Object.entries(CHAIN_CONFIG).filter(([slug]) => !slug.includes('sepolia'));
    const keys = chains.map(([, c]) => `agent:registry:${c.chainId}:${tokenId}`);
    const vals = (await redis.mget(...keys)) as ({ agentId?: number; registeredBy?: string } | null)[];
    const regs: WikiRegistration[] = [];
    chains.forEach(([, c], i) => {
      const v = vals[i];
      if (v && typeof v.agentId === 'number') {
        regs.push({ chain: c.name, chainId: c.chainId, agentId: v.agentId, registeredBy: v.registeredBy || null });
      }
    });
    return regs;
  } catch {
    return [];
  }
}

function hashFacts(facts: WikiFacts): string {
  const stable = {
    owner: facts.owner ? facts.owner.toLowerCase() : null,
    blocks: facts.transfers ? facts.transfers.map((t) => t.block) : null,
    regs: facts.registrations.map((r) => `${r.chainId}:${r.agentId}`).sort(),
    binding: facts.binding ? facts.binding.agentId : null,
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function fmtDate(ms: number | null): string {
  return ms ? new Date(ms).toISOString().slice(0, 10) : 'unknown date';
}

function diffSummary(prev: WikiFacts | null, next: WikiFacts, tokenId: number): string[] {
  const changes: string[] = [];
  if (!prev) {
    changes.push(`First archive entry for BOOA #${tokenId}.`);
    const mint = next.transfers?.find((t) => t.from === ZERO);
    if (mint) changes.push(`Minted on Shape at block ${mint.block} (${fmtDate(mint.time)}).`);
    else changes.push('Minted on Shape during the genesis mint (March 2026).');
    if (next.owner) changes.push(`Currently held by ${shortAddr(next.owner)}.`);
    for (const r of next.registrations) {
      changes.push(`Registered on the ${r.chain} ERC-8004 registry as agent #${r.agentId}.`);
    }
    if (next.binding) {
      changes.push(`Awakened — bound to onchain agent #${next.binding.agentId} via Adapter8004. Whoever holds the NFT controls the agent.`);
    }
    return changes;
  }
  if (next.owner && prev.owner && next.owner.toLowerCase() !== prev.owner.toLowerCase()) {
    changes.push(`Custody moved from ${shortAddr(prev.owner)} to ${shortAddr(next.owner)}.`);
  }
  const prevBlocks = new Set((prev.transfers || []).map((t) => t.block));
  for (const t of next.transfers || []) {
    if (!prevBlocks.has(t.block) && t.from !== ZERO) {
      changes.push(`Transferred ${shortAddr(t.from)} → ${shortAddr(t.to)} at block ${t.block} (${fmtDate(t.time)}).`);
    }
  }
  const prevRegs = new Set(prev.registrations.map((r) => `${r.chainId}:${r.agentId}`));
  for (const r of next.registrations) {
    if (!prevRegs.has(`${r.chainId}:${r.agentId}`)) {
      changes.push(`New ERC-8004 registration on ${r.chain}: agent #${r.agentId}.`);
    }
  }
  if (next.binding && (!prev.binding || prev.binding.agentId !== next.binding.agentId)) {
    changes.push(`Awakened onchain — now bound to agent #${next.binding.agentId} via Adapter8004; whoever holds the NFT controls the agent.`);
  } else if (!next.binding && prev.binding) {
    changes.push('Binding released — no longer bound to an onchain agent.');
  }
  return changes;
}

async function underDailyCap(): Promise<boolean> {
  const redis = getRedis();
  const key = `wiki:gen:${new Date().toISOString().slice(0, 10)}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 172800);
  return n <= DAILY_MAX;
}

async function generateEntry(
  identity: AgentIdentity,
  changes: string[],
  prevEntry: WikiEntry | null,
): Promise<string | null> {
  if (changes.length === 0) return null;
  const redis = getRedis();
  const cooldownKey = `wiki:cooldown:${identity.id}`;
  try {
    if (await redis.get(cooldownKey)) return null;
    if (!(await underDailyCap())) return null;
  } catch {
    return null;
  }
  const prompt = [
    'You are the Archivist of Khôra. You keep the living wiki of BOOA agents — 3,333 fully on-chain AI identities.',
    'Write ONE new chronicle entry (60-120 words) for this agent\'s wiki page, recording what just happened in its life.',
    'Voice: terse, warm, lightly cyberpunk. Third person. No hashtags, no markdown headings, no emoji, no bullet lists. Plain prose only.',
    'Treat on-chain events as moments in a biography, not log lines.',
    '',
    `AGENT: ${JSON.stringify({
      token: identity.id, name: identity.name, creature: identity.creature, vibe: identity.vibe,
      skills: identity.skills.slice(0, 4), personality: identity.personality.slice(0, 3),
      description: identity.description.slice(0, 300),
    })}`,
    '',
    `WHAT CHANGED:\n${changes.map((c) => `- ${c}`).join('\n')}`,
    prevEntry ? `\nPREVIOUS ENTRY (continue the thread, do not repeat it):\n${prevEntry.text}` : '',
    '',
    'Return only the entry text.',
  ].join('\n');
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { maxOutputTokens: 2000, temperature: 0.8, topP: 0.95 },
    });
    const text = response.text?.trim();
    if (!text) return null;
    return text.replace(/^#+\s.*$/gm, '').trim().slice(0, 1200);
  } catch {
    try { await getRedis().set(cooldownKey, 1, { ex: 300 }); } catch { /* best effort */ }
    return null;
  }
}

function connections(identity: AgentIdentity): WikiConnection[] {
  if (!agentIndex) return [];
  const out: WikiConnection[] = [];
  const seen = new Set<number>([identity.id]);
  const all = Array.from(agentIndex.values());
  const siblings: AgentIdentity[] = [];
  for (const a of all) {
    if (a.id !== identity.id && a.emoji === identity.emoji) siblings.push(a);
  }
  siblings.sort((a, b) => Math.abs(a.id - identity.id) - Math.abs(b.id - identity.id));
  for (const s of siblings.slice(0, 3)) {
    out.push({ id: s.id, name: s.name, why: `same species ${identity.emoji}` });
    seen.add(s.id);
  }
  const mySkills = new Set(identity.skills);
  const kin: Array<{ a: AgentIdentity; shared: string[] }> = [];
  for (const a of all) {
    if (seen.has(a.id)) continue;
    const shared = a.skills.filter((s) => mySkills.has(s));
    if (shared.length >= 2) kin.push({ a, shared });
  }
  kin.sort((x, y) => y.shared.length - x.shared.length || Math.abs(x.a.id - identity.id) - Math.abs(y.a.id - identity.id));
  for (const k of kin.slice(0, 2)) {
    out.push({ id: k.a.id, name: k.a.name, why: `shared skills: ${k.shared.slice(0, 2).join(', ')}` });
  }
  return out;
}

function buildMarkdown(identity: AgentIdentity, doc: WikiDoc, links: WikiConnection[]): string {
  const { facts, entries } = doc;
  const contract = getV2Address(ETH_CHAIN_ID);
  const lines: string[] = [];

  lines.push('---');
  lines.push(`token: ${identity.id}`);
  lines.push(`name: ${identity.name}`);
  lines.push(`creature: ${identity.creature}`);
  lines.push(`owner: ${facts.owner ?? 'unknown'}`);
  lines.push(`chain: eip155:${ETH_CHAIN_ID}`);
  lines.push(`updated: ${new Date(doc.updatedAt).toISOString()}`);
  lines.push(`revision: ${doc.revision}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${identity.name}`);
  lines.push('');
  lines.push(`> BOOA #${identity.id} · ${identity.vibe} ${identity.emoji} — born onchain, a fully on-chain agent identity on Ethereum.`);
  lines.push('');
  lines.push('## Identity');
  lines.push('');
  if (identity.description) {
    lines.push(identity.description);
    lines.push('');
  }
  lines.push(`- **Creature:** ${identity.creature}`);
  lines.push(`- **Vibe:** ${identity.vibe}`);
  if (identity.skills.length) lines.push(`- **Skills:** ${identity.skills.join(', ')}`);
  if (identity.domains.length) lines.push(`- **Domains:** ${identity.domains.join(', ')}`);
  if (identity.personality.length) lines.push(`- **Personality:** ${identity.personality.join(', ')}`);
  if (identity.boundaries.length) lines.push(`- **Boundaries:** ${identity.boundaries.join(', ')}`);
  const looks = Object.entries(identity.appearance).map(([k, v]) => `${k} ${v}`).join(' · ');
  if (looks) lines.push(`- **Appearance:** ${looks}`);
  lines.push('');
  lines.push('## Chronicle');
  lines.push('');
  if (entries.length === 0) {
    lines.push('*The archive is quiet. The chronicle begins when the chain speaks.*');
  } else {
    entries.forEach((e, i) => {
      lines.push(`### ${e.date} — entry ${i + 1}`);
      lines.push('');
      lines.push(e.text);
      lines.push('');
    });
  }
  lines.push('');
  lines.push('## On-Chain Record');
  lines.push('');
  lines.push(`- **Contract:** \`${contract}\` (Ethereum, chain ${ETH_CHAIN_ID})`);
  lines.push(`- **Token:** #${identity.id}`);
  lines.push(`- **Holder:** ${facts.owner ? `\`${facts.owner}\`` : 'unknown'}`);
  if (facts.binding) {
    lines.push(`- **Awakened:** yes — bound to onchain agent #${facts.binding.agentId} via Adapter8004 (ERC-8217). The holder controls the agent; it transfers with the NFT.`);
    if (facts.binding.controller) lines.push(`- **Controller:** \`${facts.binding.controller}\``);
  } else {
    lines.push('- **Awakened:** not yet — this BOOA is not bound to an onchain agent. Awaken it at booa.app/studio/awaken.');
  }
  if (facts.transfers && facts.transfers.length) {
    lines.push('- **Recent transfers:**');
    for (const t of facts.transfers) {
      const label = t.from === ZERO ? 'minted to' : `\`${shortAddr(t.from)}\` →`;
      lines.push(`  - ${label} \`${shortAddr(t.to)}\` — block ${t.block}, ${fmtDate(t.time)}`);
    }
  }
  lines.push('');
  lines.push('## ERC-8004');
  lines.push('');
  if (facts.registrations.length === 0) {
    lines.push('*No registrations recorded by the platform yet. Any BOOA can register on 16 EVM chains via the Bridge.*');
  } else {
    for (const r of facts.registrations) {
      const by = r.registeredBy ? ` — registered by \`${shortAddr(r.registeredBy)}\`` : '';
      lines.push(`- **${r.chain} (${r.chainId}):** agent #${r.agentId}${by}`);
    }
  }
  lines.push('');
  lines.push('## Connections');
  lines.push('');
  if (links.length === 0) {
    lines.push('*A singular creature. No close kin found.*');
  } else {
    for (const l of links) {
      lines.push(`- [[${l.id}|${l.name}]] — ${l.why}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function build(identity: AgentIdentity, doc: WikiDoc): WikiResult {
  const links = connections(identity);
  return {
    tokenId: identity.id,
    name: identity.name,
    markdown: buildMarkdown(identity, doc, links),
    meta: {
      tokenId: identity.id,
      name: identity.name,
      creature: identity.creature,
      vibe: identity.vibe,
      owner: doc.facts.owner,
      revision: doc.revision,
      updatedAt: new Date(doc.updatedAt).toISOString(),
      entries: doc.entries.length,
      connections: links,
    },
  };
}

export async function getWiki(tokenId: number): Promise<WikiResult | null> {
  const identity = await getIdentity(tokenId);
  if (!identity) return null;
  const redis = getRedis();
  const key = `wiki:v1:${tokenId}`;
  const now = Date.now();

  const doc = await redis.get<WikiDoc>(key);
  if (doc && now - doc.updatedAt < REFRESH_MS) return build(identity, doc);

  const [chain, registrations, binding] = await Promise.all([fetchChain(tokenId), fetchRegistrations(tokenId), fetchBinding(tokenId)]);
  const facts: WikiFacts = { owner: chain.owner, transfers: chain.transfers, registrations, binding };

  if (!facts.owner && doc) return build(identity, doc);

  const hash = hashFacts(facts);
  if (doc && doc.factsHash === hash) {
    const refreshed: WikiDoc = { ...doc, updatedAt: now, facts };
    await redis.set(key, refreshed);
    return build(identity, refreshed);
  }

  const prevFacts = doc && doc.entries.length > 0 ? doc.facts : null;
  const changes = diffSummary(prevFacts, facts, tokenId);
  const prevEntry = doc?.entries.length ? doc.entries[doc.entries.length - 1] : null;
  const entryText = await generateEntry(identity, changes, prevEntry);

  const entries = [...(doc?.entries ?? [])];
  if (entryText) entries.push({ date: new Date(now).toISOString().slice(0, 10), text: entryText });

  const next: WikiDoc = {
    revision: (doc?.revision ?? 0) + (entryText ? 1 : 0),
    updatedAt: now,
    factsHash: entryText ? hash : (doc?.factsHash ?? null),
    facts: entryText ? facts : (doc?.facts ?? facts),
    entries: entries.slice(-12),
  };
  await redis.set(key, next);
  return build(identity, next);
}
