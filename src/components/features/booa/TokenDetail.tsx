'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAccount, useChainId, useReadContract } from 'wagmi';
import { mainnet, shape } from 'wagmi/chains';
import { Download, FileCode, Image as ImageIcon, X, ArrowUpRight } from 'lucide-react';
import { useAgentMetadata } from '@/hooks/useAgentMetadata';
import { BOOA_V2_STORAGE_ABI, getV2Address, getV2StorageAddress } from '@/lib/contracts/booa-v2';
import { traitsToAgent } from '@/utils/helpers/exportFormats';
import type { BooaAgent } from '@/types/agent';
import type { GalleryToken } from '@/hooks/useGalleryTokens';

const font = { fontFamily: 'var(--font-departure-mono)' };
const PILL =
  'inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border ' +
  'border-neutral-200 dark:border-neutral-800 text-muted-foreground ' +
  'hover:border-neutral-400 dark:hover:border-neutral-600 hover:text-foreground transition-colors';
const CHIP =
  'text-[10px] px-2 py-0.5 rounded-md border border-neutral-200 dark:border-neutral-800 text-muted-foreground';
const LABEL = 'text-[10px] uppercase tracking-wider text-muted-foreground';

interface OnChainTrait { trait_type: string; value: string }

function useOnChainTraits(tokenId: bigint, storageAddress: `0x${string}`) {
  const { data } = useReadContract({
    address: storageAddress,
    abi: BOOA_V2_STORAGE_ABI,
    functionName: 'getTraits',
    args: [tokenId],
    query: { enabled: !!storageAddress && storageAddress.length > 2 },
  });
  if (!data) return [];
  try {
    const hex = data as `0x${string}`;
    const bytes = new Uint8Array(hex.slice(2).match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
    return JSON.parse(new TextDecoder().decode(bytes)) as OnChainTrait[];
  } catch {
    return [];
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

async function downloadFormat(
  agent: BooaAgent,
  svgString: string | null,
  format: 'json' | 'erc8004' | 'openclaw' | 'png' | 'svg',
  onChainImage?: string,
) {
  const fileName = agent.name.toLowerCase().replace(/\s+/g, '-') || 'agent';
  if (format === 'json') {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { image: _img, ...dataWithoutImage } = agent;
    downloadBlob(new Blob([JSON.stringify(dataWithoutImage, null, 2)], { type: 'application/json' }), `${fileName}.json`);
  } else if (format === 'erc8004') {
    const { toERC8004 } = await import('@/utils/helpers/exportFormats');
    downloadBlob(new Blob([JSON.stringify(toERC8004(agent), null, 2)], { type: 'application/json' }), `${fileName}-erc8004.json`);
  } else if (format === 'openclaw') {
    const { toOpenClawZip } = await import('@/utils/helpers/exportFormats');
    downloadBlob(await toOpenClawZip(agent, onChainImage), `${fileName}-openclaw.zip`);
  } else if (format === 'svg' && svgString) {
    downloadBlob(new Blob([svgString], { type: 'image/svg+xml' }), `${fileName}.svg`);
  } else if (format === 'png' && agent.image) {
    const { embedJsonInPng } = await import('@/utils/helpers/pngEncoder');
    downloadBlob(await embedJsonInPng(agent.image, agent), `${fileName}.png`);
  }
}

function TraitGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="space-y-1.5">
      <p className={LABEL} style={font}>{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.length > 0
          ? items.map((s) => <span key={s} className={CHIP} style={{ ...font, overflowWrap: 'anywhere' }}>{s}</span>)
          : <span className={`${CHIP} opacity-50`} style={font}>None</span>}
      </div>
    </div>
  );
}

export function TokenDetail({
  token,
  chainId: chainOverride,
  configureLink = true,
  liveArt = true,
  children,
}: {
  token: GalleryToken;
  chainId?: number;
  configureLink?: boolean;
  liveArt?: boolean;
  children?: ReactNode;
}) {
  const walletChain = useChainId();
  const chainId = chainOverride ?? walletChain;
  const { address } = useAccount();
  const contract = getV2Address(chainId);
  const storage = getV2StorageAddress(chainId);
  const isEth = chainId === mainnet.id;
  const isMainnet = chainId === shape.id;
  const tokenId = token.tokenId.toString();
  const traits = useOnChainTraits(token.tokenId, storage);
  const { metadata, isLoading: metadataLoading } = useAgentMetadata(token.isOwned ? token.tokenId : null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [registryAgentId, setRegistryAgentId] = useState<bigint | null>(null);
  const [liveSvg, setLiveSvg] = useState<string | null>(null);

  useEffect(() => {
    setLiveSvg(null);
    if (!isEth || !liveArt) return;
    let alive = true;
    fetch(`/api/booa-image/${tokenId}?live=1`)
      .then((r) => (r.ok ? r.text() : null))
      .then((s) => { if (alive && s) setLiveSvg(s); })
      .catch(() => null);
    return () => { alive = false; };
  }, [isEth, liveArt, tokenId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/agent-registry/${chainId}/${tokenId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.registrations?.length > 0) setRegistryAgentId(BigInt(data.registrations[0].agentId));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [chainId, tokenId, token.isOwned, address]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxOpen(false); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [lightboxOpen]);

  const marketplaceUrl = isEth
    ? `https://opensea.io/assets/ethereum/${contract}/${tokenId}`
    : isMainnet
      ? `https://opensea.io/assets/shape/${contract}/${tokenId}`
      : `https://testnet.rarible.com/token/shape/${contract}:${tokenId}`;
  const chainSlug = isEth ? 'ethereum' : isMainnet ? 'shape' : 'shape-sepolia';
  const onchainCheckerUrl = `https://onchainchecker.xyz/collection/${chainSlug}/${contract}/${tokenId}`;
  const scan8004Url = registryAgentId !== null
    ? `https://${isEth || isMainnet ? 'www' : 'testnet'}.8004scan.io/agents/${chainSlug}/${registryAgentId.toString()}`
    : null;

  const get = (t: string) => traits.find((x) => x.trait_type === t)?.value;
  const all = (t: string) => traits.filter((x) => x.trait_type === t).map((x) => x.value);
  const name = get('Name');
  const description = get('Description');
  const creature = get('Creature');
  const vibe = get('Vibe');
  const emoji = get('Emoji');
  const agent = metadata || (traits.length > 0 ? traitsToAgent(traits) : null);
  const art = liveSvg ?? token.svg;
  const src = art ? `data:image/svg+xml,${encodeURIComponent(art)}` : null;

  return (
    <>
      <div className="space-y-5 min-w-0">
        <div className="flex gap-4 items-start min-w-0">
          <button
            onClick={() => src && setLightboxOpen(true)}
            className="w-28 h-28 sm:w-36 sm:h-36 shrink-0 rounded-md overflow-hidden ring-1 ring-neutral-200 dark:ring-neutral-800 bg-neutral-50 dark:bg-neutral-900 hover:ring-neutral-400 dark:hover:ring-neutral-600 transition-all"
            title="View full size"
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={name || `BOOA #${tokenId}`} className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
            ) : (
              <div className="w-full h-full animate-pulse bg-neutral-100 dark:bg-neutral-800" />
            )}
          </button>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="space-y-0.5">
              <p className="text-sm text-foreground" style={{ ...font, overflowWrap: 'anywhere' }}>
                {emoji && `${emoji} `}{name || `BOOA #${tokenId}`}
              </p>
              <p className="text-[10px] text-muted-foreground/60" style={font}>
                #{tokenId}{token.isOwned && ' · yours'}
              </p>
              {creature && (
                <p className="text-[11px] text-muted-foreground leading-relaxed" style={{ ...font, overflowWrap: 'anywhere' }}>{creature}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {token.isOwned && configureLink && (
                <Link href={`/studio/my-booas?token=${tokenId}`} className={PILL} style={font}>Configure</Link>
              )}
              <a href={marketplaceUrl} target="_blank" rel="noopener noreferrer" className={PILL} style={font}>
                <Image src="/openseatransparent.svg" alt="" width={12} height={12} className="invert dark:invert-0" /> {isEth || isMainnet ? 'OpenSea' : 'Rarible'}
              </a>
              <a href={onchainCheckerUrl} target="_blank" rel="noopener noreferrer" className={PILL} style={font}>
                <Image src="/onchainchecker.svg" alt="" width={12} height={12} className="dark:invert" /> Checker
              </a>
              {scan8004Url && (
                <a href={scan8004Url} target="_blank" rel="noopener noreferrer" className={PILL} style={font}>
                  <Image src="/8004scan.svg" alt="" width={12} height={12} className="dark:invert" /> 8004scan <ArrowUpRight className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {vibe && (
          <div className="space-y-1.5">
            <p className={LABEL} style={font}>Vibe</p>
            <p className="text-[11px] text-foreground/80 leading-relaxed" style={{ ...font, overflowWrap: 'anywhere' }}>{vibe}</p>
          </div>
        )}
        {description && (
          <div className="space-y-1.5">
            <p className={LABEL} style={font}>Description</p>
            <p className="text-[11px] text-foreground/80 leading-relaxed" style={{ ...font, overflowWrap: 'anywhere' }}>{description}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TraitGroup label="Personality" items={all('Personality')} />
          <TraitGroup label="Boundaries" items={all('Boundary')} />
          <TraitGroup label="Skills" items={all('Skill')} />
          <TraitGroup label="Domains" items={all('Domain')} />
        </div>

        {token.isOwned && metadataLoading && <div className="h-7 rounded-md bg-neutral-100 dark:bg-neutral-800 animate-pulse" />}
        {token.isOwned && agent && (
          <div className="space-y-1.5">
            <p className={LABEL} style={font}>Download</p>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => downloadFormat(agent, art, 'json')} className={PILL} style={font}><FileCode className="w-3 h-3" /> JSON</button>
              <button onClick={() => downloadFormat(agent, art, 'erc8004')} className={PILL} style={font}>8004</button>
              <button
                onClick={() => downloadFormat(agent, art, 'openclaw', `eip155:${isEth ? '1' : isMainnet ? '360' : '11011'}/erc721:${contract}/${tokenId}`)}
                className={PILL} style={font}
              >
                <Image src="/openclaw.svg" alt="" width={12} height={12} /> OpenClaw
              </button>
              {metadata?.image && (
                <button onClick={() => downloadFormat(metadata, art, 'png')} className={PILL} style={font}><ImageIcon className="w-3 h-3" /> PNG</button>
              )}
              {art && (
                <button onClick={() => downloadFormat(agent, art, 'svg')} className={PILL} style={font}><Download className="w-3 h-3" /> SVG</button>
              )}
            </div>
          </div>
        )}

        {children}
      </div>

      {lightboxOpen && src && (
        <div className="fixed inset-0 z-50 bg-neutral-900/95 flex items-center justify-center p-8" onClick={() => setLightboxOpen(false)}>
          <button onClick={() => setLightboxOpen(false)} className="absolute top-6 right-6 text-white hover:scale-110 transition-transform z-10" aria-label="Close">
            <X className="w-8 h-8" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={name || `BOOA #${tokenId}`} className="max-h-[85vh] max-w-[85vw] object-contain" style={{ imageRendering: 'pixelated' }} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}
