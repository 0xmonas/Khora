// Khôra City — single-script simulation, Phase A: Awakening + emergent map.
// No wallet, no UI. Reads public/data/agents.json + OASF taxonomy, classifies
// each agent into a role, places it on a 64x64 grid using deterministic
// location heuristics, then prints the resulting map and cluster stats.
//
// Run: npx tsx scripts/booa-city-sim.ts

import * as fs from 'fs';
import { OASF_SKILLS, OASF_DOMAINS } from '../src/lib/oasf-taxonomy';

interface Agent { id: number; name: string; skills: string[]; domains: string[]; emoji: string; }
const agents: Agent[] = JSON.parse(fs.readFileSync('public/data/agents.json', 'utf-8'));

// label → top-category map
const skillTop: Record<string, string> = {};
for (const c of OASF_SKILLS) for (const it of c.items) skillTop[it.label] = c.label;
const domainTop: Record<string, string> = {};
for (const c of OASF_DOMAINS) for (const it of c.items) domainTop[it.label] = c.label;

// Map OASF top-category → game role + preferred grid zone
type Role = 'GUARD' | 'COORDINATOR' | 'COMMS' | 'BUILDER' | 'MEDIC' | 'ENERGY' | 'TRADER' | 'SCAVENGER' | 'GENERIC';
const roleProfiles: Record<Role, { label: string; symbol: string; zone: 'edge' | 'inner' | 'mid' | 'outer' | 'rare' }> = {
  GUARD:       { label: 'Guard',       symbol: 'G', zone: 'edge'  },
  COORDINATOR: { label: 'Coordinator', symbol: 'C', zone: 'inner' },
  COMMS:       { label: 'Comms',       symbol: 'N', zone: 'mid'   },
  BUILDER:     { label: 'Builder',     symbol: 'B', zone: 'mid'   },
  MEDIC:       { label: 'Medic',       symbol: 'M', zone: 'inner' },
  ENERGY:      { label: 'Energy',      symbol: 'E', zone: 'rare'  },
  TRADER:      { label: 'Trader',      symbol: 'T', zone: 'mid'   },
  SCAVENGER:   { label: 'Scavenger',   symbol: 'S', zone: 'outer' },
  GENERIC:     { label: 'Generic',     symbol: '.', zone: 'mid'   },
};

function classify(a: Agent): Role {
  const skillCats: Record<string, number> = {};
  for (const s of a.skills) {
    const c = skillTop[s];
    if (c) skillCats[c] = (skillCats[c] || 0) + 1;
  }
  const domainCats: Record<string, number> = {};
  for (const d of a.domains) {
    const c = domainTop[d];
    if (c) domainCats[c] = (domainCats[c] || 0) + 1;
  }

  // Priority order: rare specialties first, then dominant categories
  if ((domainCats['Energy'] || 0) > 0) return 'ENERGY';
  if ((domainCats['Healthcare'] || 0) > 0 || (domainCats['Life Science'] || 0) > 0) return 'MEDIC';
  if ((skillCats['Security & Privacy'] || 0) >= 3) return 'GUARD';
  if ((skillCats['Agent Orchestration'] || 0) >= 3) return 'COORDINATOR';
  if ((skillCats['Natural Language Processing'] || 0) >= 3) return 'COMMS';
  if ((domainCats['Technology'] || 0) >= 4 || (domainCats['Manufacturing'] || 0) > 0) return 'BUILDER';
  if ((domainCats['Finance & Business'] || 0) > 0 || (domainCats['Retail & E-commerce'] || 0) > 0) return 'TRADER';
  if ((skillCats['Tool Interaction'] || 0) > 0 || (skillCats['Data Engineering'] || 0) > 0) return 'SCAVENGER';
  return 'GENERIC';
}

// 64x64 grid
const W = 64, H = 64;
type Cell = { tokenId: number; role: Role } | null;
const grid: Cell[][] = Array.from({ length: H }, () => Array(W).fill(null));

// Deterministic placement: zone-bounded random based on tokenId hash
function hashRand(seed: number, salt: number) {
  // Simple deterministic pseudo-random in [0, 1)
  let x = (seed * 9301 + salt * 49297) % 233280;
  return x / 233280;
}

function pickZoneCell(role: Role, tokenId: number): { x: number; y: number } | null {
  const zone = roleProfiles[role].zone;
  for (let attempt = 0; attempt < 200; attempt++) {
    let x = 0, y = 0;
    const rx = hashRand(tokenId, attempt + 1);
    const ry = hashRand(tokenId, attempt + 7919);
    if (zone === 'edge') {
      // pick a perimeter band of width 4
      const side = Math.floor(rx * 4);
      const along = Math.floor(ry * Math.max(W, H));
      const band = Math.floor(hashRand(tokenId, attempt + 31) * 4);
      if (side === 0)      { x = band;             y = along % H; }
      else if (side === 1) { x = W - 1 - band;     y = along % H; }
      else if (side === 2) { x = along % W;        y = band; }
      else                 { x = along % W;        y = H - 1 - band; }
    } else if (zone === 'inner') {
      // central 16x16
      x = Math.floor(W / 2 - 8 + rx * 16);
      y = Math.floor(H / 2 - 8 + ry * 16);
    } else if (zone === 'mid') {
      // central 32x32 ring
      x = Math.floor(W / 2 - 16 + rx * 32);
      y = Math.floor(H / 2 - 16 + ry * 32);
    } else if (zone === 'outer') {
      // outside the inner 32x32 — corners and outskirts
      x = Math.floor(rx * W);
      y = Math.floor(ry * H);
      const dx = Math.abs(x - W / 2), dy = Math.abs(y - H / 2);
      if (Math.max(dx, dy) < 14) continue;
    } else if (zone === 'rare') {
      // scattered, anywhere — energy stations are rare and remote
      x = Math.floor(rx * W);
      y = Math.floor(ry * H);
      const dx = Math.abs(x - W / 2), dy = Math.abs(y - H / 2);
      if (Math.max(dx, dy) < 20) continue;
    }
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (!grid[y][x]) return { x, y };
  }
  // Fallback: scan for any empty cell
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!grid[y][x]) return { x, y };
  return null;
}

// ─── Awakening ───
const placements: { tokenId: number; role: Role; x: number; y: number }[] = [];
const roleCounts: Record<Role, number> = { GUARD: 0, COORDINATOR: 0, COMMS: 0, BUILDER: 0, MEDIC: 0, ENERGY: 0, TRADER: 0, SCAVENGER: 0, GENERIC: 0 };

for (const a of agents) {
  const role = classify(a);
  roleCounts[role]++;
  const cell = pickZoneCell(role, a.id);
  if (!cell) continue;
  grid[cell.y][cell.x] = { tokenId: a.id, role };
  placements.push({ tokenId: a.id, role, x: cell.x, y: cell.y });
}

// ─── Output ───
console.log('═══════════════════════════════════════════════════════');
console.log('KHÔRA CITY — AWAKENING SIMULATION (Phase A)');
console.log(`${agents.length} agents, ${W}x${H} grid (${W * H} nodes)`);
console.log('═══════════════════════════════════════════════════════\n');

console.log('Role distribution & placement:');
for (const [r, c] of Object.entries(roleCounts).sort((a, b) => b[1] - a[1])) {
  if (c === 0) continue;
  const p = ((c / agents.length) * 100).toFixed(1);
  const bar = '█'.repeat(Math.floor((c / agents.length) * 30));
  console.log(`  ${(r as Role).padEnd(13)} ${roleProfiles[r as Role].symbol}  ${String(c).padStart(5)}  ${p.padStart(5)}%  ${bar}`);
}

// Map render — every 4th cell sampled (16x16 view of 64x64)
console.log('\nMap (16x16 view, sampled every 4th cell):');
console.log('  ' + '0123456789ABCDEF'.split('').join(' '));
for (let y = 0; y < H; y += 4) {
  let row = (y / 4).toString(16).toUpperCase().padStart(1) + ' ';
  for (let x = 0; x < W; x += 4) {
    // count agents in this 4x4 block, dominant role wins
    const cnt: Record<string, number> = {};
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
      const c = grid[y + dy]?.[x + dx];
      if (c) cnt[c.role] = (cnt[c.role] || 0) + 1;
    }
    const dom = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    row += (dom ? roleProfiles[dom[0] as Role].symbol : '·') + ' ';
  }
  console.log(row);
}

// Cluster detection — flood fill on adjacent same-role cells, top-5 largest
const visited = new Set<string>();
const clusters: { role: Role; size: number; cx: number; cy: number }[] = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const k = `${x},${y}`;
    if (visited.has(k)) continue;
    const cell = grid[y][x];
    if (!cell) continue;
    const stack = [{ x, y }];
    let size = 0, sx = 0, sy = 0;
    while (stack.length) {
      const p = stack.pop()!;
      const pk = `${p.x},${p.y}`;
      if (visited.has(pk)) continue;
      visited.add(pk);
      const pc = grid[p.y]?.[p.x];
      if (!pc || pc.role !== cell.role) continue;
      size++; sx += p.x; sy += p.y;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) stack.push({ x: p.x + dx, y: p.y + dy });
    }
    if (size >= 3) clusters.push({ role: cell.role, size, cx: Math.round(sx/size), cy: Math.round(sy/size) });
  }
}
clusters.sort((a, b) => b.size - a.size);
console.log('\nTop 10 emergent clusters (≥3 adjacent agents of same role):');
for (const c of clusters.slice(0, 10)) {
  console.log(`  ${roleProfiles[c.role].label.padEnd(13)} size=${String(c.size).padStart(3)}  center=[${c.cx},${c.cy}]`);
}

// Density stats
const occupied = placements.length;
console.log(`\nOccupancy: ${occupied}/${W * H} (${((occupied / (W * H)) * 100).toFixed(1)}% of nodes)`);
console.log(`Empty wild nodes: ${W * H - occupied}`);

// Sample agents in each role
console.log('\nSample placements:');
for (const r of Object.keys(roleProfiles) as Role[]) {
  const samples = placements.filter((p) => p.role === r).slice(0, 2);
  for (const s of samples) {
    const a = agents.find((x) => x.id === s.tokenId)!;
    console.log(`  ${r.padEnd(13)} #${s.tokenId.toString().padStart(4)}  ${a.emoji}  ${a.name.padEnd(26)} → [${s.x.toString().padStart(2)},${s.y.toString().padStart(2)}]`);
  }
}

fs.writeFileSync('docs/data/booa-city-awakening.json', JSON.stringify(placements, null, 2));
console.log('\n✓ Saved → docs/data/booa-city-awakening.json');
