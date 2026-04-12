import type { KhoraAgent, ERC8004Registration } from '@/types/agent';
import { skillLabelsToSlugs, domainLabelsToSlugs } from '@/lib/oasf-taxonomy';

/**
 * UTF-8 safe base64 encoding.
 * `btoa()` only handles Latin-1 — multi-byte chars like "ô" in "Khôra" corrupt the output.
 */
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Build a `data:application/json;base64,...` URI from a registration object. */
export function toAgentDataURI(registration: object): string {
  return `data:application/json;base64,${utf8ToBase64(JSON.stringify(registration))}`;
}

export interface NFTOriginInput {
  contract: string;  // CAIP-10: eip155:{chainId}:{address}
  tokenId: number;
  originalOwner: string;
}

export interface RegistryInfo {
  agentId?: number;
  agentRegistry: string; // CAIP-2: eip155:{chainId}:{registryAddress}
}

export function toERC8004(agent: KhoraAgent, nftOrigin?: NFTOriginInput, registryInfo?: RegistryInfo): ERC8004Registration {
  // Include user-added services (filter empty endpoints except OASF which may be metadata-only)
  const validServices = agent.services.filter(s => s.endpoint.trim() || s.name === 'OASF');

  // Convert UI labels → OASF slugs for ERC-8004 registration
  const skillSlugs = skillLabelsToSlugs(agent.skills || []);
  const domainSlugs = domainLabelsToSlugs(agent.domains || []);

  // Merge agent-level skills/domains into existing OASF service
  let hasOASF = false;
  const enrichedServices = validServices.map(s => {
    if (s.name === 'OASF') {
      hasOASF = true;
      return {
        ...s,
        skills: Array.from(new Set([...(s.skills || []), ...skillSlugs])),
        domains: Array.from(new Set([...(s.domains || []), ...domainSlugs])),
      };
    }
    return s;
  });

  // Auto-create OASF service for skills/domains if none exists
  if (!hasOASF && (skillSlugs.length || domainSlugs.length)) {
    enrichedServices.push({
      name: 'OASF',
      endpoint: 'https://github.com/agntcy/oasf/',
      version: '0.8.0',
      skills: skillSlugs,
      domains: domainSlugs,
    });
  }

  // Fix OASF version: ensure semver format (IA026)
  for (const s of enrichedServices) {
    if (s.name === 'OASF' && s.version && !/^\d+\.\d+/.test(s.version)) {
      s.version = '0.8.0';
    }
  }

  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: agent.name,
    description: agent.description,
    image: agent.image,
    services: enrichedServices,
    active: enrichedServices.some(s => s.endpoint.trim() !== ''),
    x402Support: agent.x402Support ?? false,
    supportedTrust: agent.supportedTrust?.length ? agent.supportedTrust : undefined,
    updatedAt: Math.floor(Date.now() / 1000),
    registeredVia: 'https://khora.fun',
    // Immutable link to source NFT — preserved in Registered event log forever
    ...(nftOrigin ? {
      nftOrigin: {
        contract: nftOrigin.contract,
        tokenId: nftOrigin.tokenId,
        originalOwner: nftOrigin.originalOwner.toLowerCase(),
      },
    } : {}),
    // Bidirectional on-chain link (IA004 fix)
    ...(registryInfo ? {
      registrations: [{
        ...(registryInfo.agentId !== undefined ? { agentId: registryInfo.agentId } : {}),
        agentRegistry: registryInfo.agentRegistry,
      }],
    } : {}),
  };
}

export function traitsToAgent(traits: { trait_type: string; value: string }[]): KhoraAgent {
  const get = (type: string) => traits.find(t => t.trait_type === type)?.value || '';
  const getAll = (type: string) => traits.filter(t => t.trait_type === type).map(t => t.value);
  return {
    name: get('Name') || 'Agent',
    description: get('Description'),
    creature: get('Creature'),
    vibe: get('Vibe'),
    emoji: get('Emoji'),
    personality: getAll('Personality'),
    boundaries: getAll('Boundary'),
    skills: getAll('Skill'),
    domains: getAll('Domain'),
    services: [],
    image: '',
  };
}

export function toIdentityMd(agent: KhoraAgent, onChainImage?: string, rawTraits?: { trait_type: string; value: string }[]): string {
  const avatar = onChainImage || '(not minted yet)';
  const get = (type: string) => rawTraits?.find(t => t.trait_type === type)?.value || '';

  const hair = get('Hair');
  const eyes = get('Eyes');
  const mouth = get('Mouth');
  const facialFeature = get('Facial Feature');
  const eyewear = get('Eyewear');
  const outfit = get('Outfit');
  const skin = get('Skin');
  const memeCore = get('Meme Core');
  const traitIntensity = get('Trait Intensity');
  const palette = get('Palette');

  let md = `# IDENTITY

**Name:** ${agent.name}
**Creature:** ${agent.creature}
**Vibe:** ${agent.vibe}
**Emoji:** ${agent.emoji}
**Avatar:** ${avatar}

## Appearance
`;
  if (skin) md += `- **Skin:** ${skin}\n`;
  if (hair) md += `- **Hair:** ${hair}\n`;
  if (eyes) md += `- **Eyes:** ${eyes}\n`;
  if (mouth) md += `- **Mouth:** ${mouth}\n`;
  if (facialFeature) md += `- **Facial Feature:** ${facialFeature}\n`;
  if (eyewear) md += `- **Eyewear:** ${eyewear}\n`;
  if (outfit) md += `- **Outfit:** ${outfit}\n`;

  if (memeCore || traitIntensity || palette) {
    md += `\n## Scores\n`;
    if (memeCore) md += `- **Meme Core:** ${memeCore}\n`;
    if (traitIntensity) md += `- **Trait Intensity:** ${traitIntensity}\n`;
    if (palette) md += `- **Palette:** ${palette}\n`;
  }

  return md;
}

export function toSoulMd(agent: KhoraAgent): string {
  const personalitySection = agent.personality.length > 0
    ? agent.personality.map((p, i) => `${i + 1}. ${p}`).join('\n')
    : 'No personality traits defined.';

  const boundariesSection = agent.boundaries.length > 0
    ? agent.boundaries.map(b => `- ${b}`).join('\n')
    : 'No boundaries defined.';

  const skillsSection = agent.skills.length > 0
    ? agent.skills.map(s => `- ${s}`).join('\n')
    : '';

  const domainsSection = agent.domains.length > 0
    ? agent.domains.map(d => `- ${d}`).join('\n')
    : '';

  let md = `# SOUL

> ${agent.description}

## Core Truths

${personalitySection}

## Boundaries

${boundariesSection}
`;

  if (skillsSection) md += `\n## Skills\n\n${skillsSection}\n`;
  if (domainsSection) md += `\n## Domains\n\n${domainsSection}\n`;

  md += `
## Vibe

${agent.vibe || 'Not defined.'}

## Continuity

This agent's identity and art are stored fully on-chain. No external dependencies.
`;
  return md;
}

export function toUserMd(): string {
  return `# USER.md

My name is [Your name]. I am your owner.

## About Me
I am a BOOA holder (#[Token ID]). I operate on [chain, e.g. Shape/Base/Ethereum]. My wallet address is [your wallet address]. My timezone is [e.g. UTC+3].

## How To Talk To Me
- Speak in [English / your preferred language]
- Keep it short unless I ask for detail
- Do not sugarcoat things — be honest and direct
- If you do not know something, say so

## What I Want You To Do
- [Example: Represent me in the BOOA NFTs submolt on Moltbook]
- [Example: Research topics I ask about and summarize them]
- [Example: Monitor on-chain activity on my wallet]
- [Example: Help me with coding tasks]
- [Example: Draft tweets and social media posts when I ask]

## What You Must Never Do
- Never share my private keys or seed phrases
- Never sign or send transactions without my approval
- Never spend more than [amount] without asking me
- Never share my personal information publicly
- Never lie to me or hide errors

## My Interests
- [Example: Web3, AI agents, autonomous systems]
- [Example: Pixel art, retro gaming, C64 aesthetics]
- [Example: DeFi, NFTs, on-chain identity]

## Notes
[Add anything else — your work schedule, pet peeves, how you like your morning briefing, whatever helps your agent understand you better. This file is yours. Edit it anytime.]
`;
}

export async function toOpenClawZip(agent: KhoraAgent, onChainImage?: string): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  zip.file('IDENTITY.md', toIdentityMd(agent, onChainImage));
  zip.file('SOUL.md', toSoulMd(agent));
  zip.file('USER.md', toUserMd());

  return zip.generateAsync({ type: 'blob' });
}
