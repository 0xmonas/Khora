// Reads public/data/agents.json + src/lib/oasf-taxonomy and prints
// role/category distribution percentages across all 3,333 BOOAs.
//
// Run: npx tsx scripts/booa-role-dist.ts

import * as fs from 'fs';
import { OASF_SKILLS, OASF_DOMAINS } from '../src/lib/oasf-taxonomy';

interface Agent { id: number; skills: string[]; domains: string[]; }
const d: Agent[] = JSON.parse(fs.readFileSync('public/data/agents.json', 'utf-8'));

// label → top category
const skillTop: Record<string, string> = {};
for (const cat of OASF_SKILLS) for (const it of cat.items) skillTop[it.label] = cat.label;
const domainTop: Record<string, string> = {};
for (const cat of OASF_DOMAINS) for (const it of cat.items) domainTop[it.label] = cat.label;

const primary: Record<string, number> = {};
const skillCat: Record<string, number> = {};
const domainCat: Record<string, number> = {};

for (const t of d) {
  const tops: string[] = [];
  for (const s of t.skills || []) {
    const c = skillTop[s];
    if (c) { tops.push(c); skillCat[c] = (skillCat[c] || 0) + 1; }
  }
  for (const dn of t.domains || []) {
    const c = domainTop[dn];
    if (c) { tops.push(c); domainCat[c] = (domainCat[c] || 0) + 1; }
  }
  const cnts: Record<string, number> = {};
  for (const x of tops) cnts[x] = (cnts[x] || 0) + 1;
  const top = Object.entries(cnts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
  primary[top] = (primary[top] || 0) + 1;
}

function dump(label: string, dist: Record<string, number>) {
  console.log(`\n═══ ${label} ═══`);
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  for (const [k, c] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    const pct = ((c / total) * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor((c / total) * 40));
    console.log(`  ${k.padEnd(36)} ${String(c).padStart(5)}  ${pct.padStart(5)}%  ${bar}`);
  }
}

dump(`AGENT PRIMARY ROLE (${d.length} token)`, primary);
dump('SKILL category occurrences', skillCat);
dump('DOMAIN category occurrences', domainCat);
