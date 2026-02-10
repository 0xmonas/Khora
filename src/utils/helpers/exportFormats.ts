import type { KhoraAgent, ERC8004Registration } from '@/types/agent';

export function toERC8004(agent: KhoraAgent, onChainImage?: string): ERC8004Registration {
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: agent.name,
    description: agent.description,
    image: onChainImage || agent.image,
    services: agent.services,
    active: agent.services.length > 0,
  };
}

export function toIdentityMd(agent: KhoraAgent): string {
  return `# IDENTITY

**Name:** ${agent.name}
**Creature:** ${agent.creature}
**Vibe:** ${agent.vibe}
**Emoji:** ${agent.emoji}
**Avatar:** (see attached PFP)
`;
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
    : 'No skills defined.';

  const domainsSection = agent.domains.length > 0
    ? agent.domains.map(d => `- ${d}`).join('\n')
    : 'No domains defined.';

  return `# SOUL

> ${agent.description}

## Core Truths

${personalitySection}

## Boundaries

${boundariesSection}

## Skills

${skillsSection}

## Domains

${domainsSection}
`;
}

export async function toOpenClawZip(agent: KhoraAgent): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  zip.file('IDENTITY.md', toIdentityMd(agent));
  zip.file('SOUL.md', toSoulMd(agent));

  return zip.generateAsync({ type: 'blob' });
}
