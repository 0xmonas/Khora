import type { KhoraAgent, ERC8004Registration } from '@/types/agent';

export function toERC8004(agent: KhoraAgent): ERC8004Registration {
  // Include user-added services (filter empty endpoints except OASF which may be metadata-only)
  const validServices = agent.services.filter(s => s.endpoint.trim() || s.name === 'OASF');

  // Merge agent-level skills/domains into existing OASF service
  let hasOASF = false;
  const enrichedServices = validServices.map(s => {
    if (s.name === 'OASF') {
      hasOASF = true;
      return {
        ...s,
        skills: Array.from(new Set([...(s.skills || []), ...(agent.skills || [])])),
        domains: Array.from(new Set([...(s.domains || []), ...(agent.domains || [])])),
      };
    }
    return s;
  });

  // Auto-create OASF service for skills/domains if none exists
  if (!hasOASF && (agent.skills?.length || agent.domains?.length)) {
    enrichedServices.push({
      name: 'OASF',
      endpoint: '',
      version: '0.8.0',
      skills: agent.skills || [],
      domains: agent.domains || [],
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
