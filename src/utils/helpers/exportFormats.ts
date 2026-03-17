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

export function toIdentityMd(agent: KhoraAgent, onChainImage?: string): string {
  const avatar = onChainImage || '(not minted yet)';
  return `# IDENTITY

**Name:** ${agent.name}
**Creature:** ${agent.creature}
**Vibe:** ${agent.vibe}
**Emoji:** ${agent.emoji}
**Avatar:** ${avatar}
`;
}

export function toSoulMd(agent: KhoraAgent): string {
  const personalitySection = agent.personality.length > 0
    ? agent.personality.map((p, i) => `${i + 1}. ${p}`).join('\n')
    : 'No personality traits defined.';

  const boundariesSection = agent.boundaries.length > 0
    ? agent.boundaries.map(b => `- ${b}`).join('\n')
    : 'No boundaries defined.';

  return `# SOUL

> ${agent.description}

## Core Truths

${personalitySection}

## Boundaries

${boundariesSection}

## Vibe

${agent.vibe || 'Not defined.'}

## Continuity

This agent's identity and art are stored fully on-chain. No external dependencies.
`;
}

export async function toOpenClawZip(agent: KhoraAgent, onChainImage?: string): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  zip.file('IDENTITY.md', toIdentityMd(agent, onChainImage));
  zip.file('SOUL.md', toSoulMd(agent));

  return zip.generateAsync({ type: 'blob' });
}
