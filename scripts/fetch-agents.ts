/**
 * Fetches all BOOA agent traits from Alchemy and writes to public/data/agents.json
 * Run: npx tsx scripts/fetch-agents.ts
 *
 * Output is used by Persona Quiz, future leaderboards, search, etc.
 * Re-run periodically to refresh (agents don't change after mint, but metadata can update).
 */

import * as fs from 'fs';
import * as path from 'path';

// Read .env manually to avoid dotenv dependency
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
const envVars: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
}

const ALCHEMY_API_KEY = envVars.ALCHEMY_API_KEY || process.env.ALCHEMY_API_KEY || '';
const BOOA_ADDRESS = envVars.NEXT_PUBLIC_BOOA_V2_ADDRESS || process.env.NEXT_PUBLIC_BOOA_V2_ADDRESS || '';

interface AgentData {
  id: number;
  name: string;
  creature: string;
  vibe: string;
  emoji: string;
  skills: string[];
  domains: string[];
  image: string;
}

async function main() {
  if (!ALCHEMY_API_KEY || !BOOA_ADDRESS) {
    console.error('Missing ALCHEMY_API_KEY or NEXT_PUBLIC_BOOA_V2_ADDRESS in .env');
    process.exit(1);
  }

  console.log(`Fetching agents from contract ${BOOA_ADDRESS}...`);

  const agents: AgentData[] = [];
  let pageKey: string | null = null;
  let page = 0;

  do {
    const url = new URL(
      `https://shape-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}/getNFTsForContract`
    );
    url.searchParams.set('contractAddress', BOOA_ADDRESS);
    url.searchParams.set('withMetadata', 'true');
    url.searchParams.set('limit', '100');
    if (pageKey) url.searchParams.set('startToken', pageKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`Alchemy error: ${res.status}`);
      break;
    }

    const data = await res.json();

    for (const nft of data.nfts || []) {
      const attrs: { trait_type: string; value: string }[] =
        nft.raw?.metadata?.attributes || [];

      const get = (type: string) => attrs.find((a: { trait_type: string; value: string }) => a.trait_type === type)?.value || '';
      const getAll = (type: string) => attrs.filter((a: { trait_type: string; value: string }) => a.trait_type === type).map((a: { trait_type: string; value: string }) => a.value);

      const image = nft.image?.thumbnailUrl || nft.image?.cachedUrl || '';

      agents.push({
        id: Number(nft.tokenId),
        name: get('Name') || `BOOA #${nft.tokenId}`,
        creature: get('Creature'),
        vibe: get('Vibe'),
        emoji: get('Emoji'),
        skills: getAll('Skill'),
        domains: getAll('Domain'),
        image,
      });
    }

    pageKey = data.pageKey || null;
    page++;
    console.log(`  Page ${page}: ${agents.length} agents fetched`);
  } while (pageKey);

  const outPath = path.resolve(__dirname, '../public/data/agents.json');
  fs.writeFileSync(outPath, JSON.stringify(agents));
  const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`Done. ${agents.length} agents written to public/data/agents.json (${sizeKB} KB)`);
}

main();
