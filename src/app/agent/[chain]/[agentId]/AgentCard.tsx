'use client';

import { useRef, useState, useCallback } from 'react';
import { toPng } from 'html-to-image';
import Image from 'next/image';
import type { AgentScores } from '@/utils/agent-score';

interface AgentData {
  tokenId: number;
  chain: string;
  chainName: string;
  owner: string;
  name: string;
  description: string;
  creature: string;
  vibe: string;
  emoji: string;
  image: string;
  services: { name: string; endpoint?: string; skills?: string[]; domains?: string[] }[];
  skills: string[];
  domains: string[];
  personality: string[];
  x402Support: boolean;
  supportedTrust: string[];
  registryAgentId: number | null;
}

interface AgentCardProps {
  agent: AgentData;
  scores: AgentScores;
  scan8004Url: string | null;
}

const cardFont = { fontFamily: 'var(--font-departure-mono)' };

const goldBloom = { color: '#c8b439', textShadow: '0 0 8px rgba(200,180,57,0.6), 0 0 20px rgba(200,180,57,0.2)' };
const orangeBloom = { color: '#e8833a', textShadow: '0 0 8px rgba(232,131,58,0.6), 0 0 20px rgba(232,131,58,0.2)' };
const dimText = { color: '#999' };
const bodyText = { color: '#ccc' };

function CornerDots() {
  const dot = 'absolute w-[3px] h-[3px] bg-[#eee] z-50';
  return (
    <>
      <div className={`${dot} -top-[1px] -left-[1px]`} />
      <div className={`${dot} -top-[1px] -right-[1px]`} />
      <div className={`${dot} -bottom-[1px] -left-[1px]`} />
      <div className={`${dot} -bottom-[1px] -right-[1px]`} />
    </>
  );
}

function PixelBattery({ score }: { score: number }) {
  const bars = score >= 75 ? 2 : score >= 50 ? 1 : 0;
  return (
    <div className="flex items-center gap-[1px]" title={`${score}/100`}>
      <div className="flex items-center gap-[1px] border border-[#777] p-[1px]" style={{ height: 9, minWidth: 10 }}>
        {[0, 1].map(i => (
          <div
            key={i}
            style={{
              width: 3,
              height: 5,
              background: i < bars ? '#eee' : '#222',
            }}
          />
        ))}
      </div>
      <div style={{ width: 2, height: 4, background: '#777' }} />
    </div>
  );
}

const RANK_GLOW: Record<string, string> = {
  S: 'drop-shadow-[0_0_20px_rgba(200,180,57,0.5)] drop-shadow-[0_0_40px_rgba(200,180,57,0.15)]',
  A: 'drop-shadow-[0_0_12px_rgba(200,180,57,0.35)]',
  B: 'drop-shadow-[0_0_8px_rgba(200,180,57,0.2)]',
  C: '',
  D: '',
};

export function AgentCard({ agent, scores, scan8004Url }: AgentCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50 });
  const [isHovering, setIsHovering] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (!flipped) {
      setTilt({ x: (y - 0.5) * -10, y: (x - 0.5) * 10 });
    }
    setGlarePos({ x: x * 100, y: y * 100 });
  }, [flipped]);

  const handleMouseEnter = useCallback(() => setIsHovering(true), []);
  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    setTilt({ x: 0, y: 0 });
  }, []);

  const handleDownloadPNG = useCallback(async () => {
    if (!frontRef.current) return;
    const dataUrl = await toPng(frontRef.current, {
      pixelRatio: 2,
      backgroundColor: '#0a0a0a',
    });
    const link = document.createElement('a');
    link.download = `booa-${agent.tokenId}.png`;
    link.href = dataUrl;
    link.click();
  }, [agent.tokenId]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const shortOwner = agent.owner;
  const glow = RANK_GLOW[scores.rank] || '';
  const isHighRank = scores.rank === 'S' || scores.rank === 'A' || scores.rank === 'B';

  return (
    <div className="flex flex-col items-center gap-6" style={cardFont}>
      {/* Card */}
      <div
        className={`w-[380px] h-[532px] cursor-pointer select-none ${glow}`}
        style={{ perspective: '1000px' }}
        onClick={() => setFlipped(!flipped)}
      >
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="relative w-full h-full transition-transform duration-700 ease-out"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped
              ? 'rotateY(180deg)'
              : `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          }}
        >
          {/* FRONT */}
          <div
            ref={frontRef}
            className="absolute inset-0 border-2 border-[#444] overflow-hidden"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <div className="absolute inset-0 bg-[#0a0a0a]" />
            <CornerDots />

            {/* Scanlines */}
            <div
              className="absolute inset-0 z-30 pointer-events-none opacity-[0.03]"
              style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)',
              }}
            />

            {/* Hover glow */}
            {isHovering && (
              <div
                className="absolute inset-0 z-20 pointer-events-none"
                style={{
                  background: `radial-gradient(circle at ${glarePos.x}% ${glarePos.y}%, rgba(200,180,57,0.06) 0%, transparent 50%)`,
                }}
              />
            )}

            <div className="relative z-10 h-full flex flex-col">
              {/* Header */}
              <div className="relative flex items-center justify-between px-4 h-8 bg-[#111] border-b border-[#444]">
                <CornerDots />
                <span className="text-[10px] tracking-wider" style={goldBloom}>
                  BOOA #{agent.tokenId}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] uppercase" style={dimText}>
                    {agent.chainName}
                  </span>
                  <PixelBattery score={scores.overall} />
                </div>
              </div>

              {/* Image */}
              <div className="px-4 pt-3">
                <div className="relative w-full aspect-[4/3] border-2 border-[#444] overflow-hidden bg-[#111]">
                  <CornerDots />
                  {agent.image ? (
                    <img
                      src={agent.image}
                      alt={agent.name}
                      className="w-full h-full object-contain"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl text-[#555]">?</span>
                    </div>
                  )}
                  <div
                    className="absolute inset-0 pointer-events-none opacity-[0.05]"
                    style={{
                      backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.4) 2px, rgba(255,255,255,0.4) 3px)',
                    }}
                  />
                </div>
              </div>

              {/* Data */}
              <div className="px-4 pt-3 flex-1 flex flex-col gap-0">
                <div className="h-px bg-[#444] mb-2" />

                {/* Name */}
                <div className="py-0.5">
                  <p className="text-[7px] uppercase tracking-wider mb-0.5" style={dimText}>NAME</p>
                  <p className="text-[11px] uppercase truncate" style={goldBloom}>
                    {agent.emoji && `${agent.emoji} `}{agent.name}
                  </p>
                </div>

                {/* Creature */}
                <div className="py-0.5">
                  <p className="text-[7px] uppercase tracking-wider mb-0.5" style={dimText}>CREATURE</p>
                  <p className="text-[9px] uppercase leading-snug overflow-hidden" style={{ ...bodyText, maxHeight: '2.4em' }}>{agent.creature || '---'}</p>
                </div>

                {/* Vibe */}
                <div className="py-0.5">
                  <p className="text-[7px] uppercase tracking-wider mb-0.5" style={dimText}>VIBE</p>
                  <p className="text-[9px] uppercase leading-snug overflow-hidden" style={{ ...bodyText, maxHeight: '2.4em' }}>{agent.vibe || '---'}</p>
                </div>

                {/* Rank + Score inline */}
                <div className="flex items-center justify-between py-0.5">
                  <div>
                    <p className="text-[7px] uppercase tracking-wider mb-0.5" style={dimText}>RANK</p>
                    <span
                      className="text-[14px] font-black"
                      style={isHighRank ? orangeBloom : dimText}
                    >
                      {scores.rank}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-[7px] uppercase tracking-wider mb-0.5" style={dimText}>SCORE</p>
                    <span className="text-[10px]" style={bodyText}>{scores.overall} / 100</span>
                  </div>
                </div>

                <div className="h-px bg-[#444] my-1.5" />

                {/* Stats grid */}
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { label: 'IDENT', value: scores.identity },
                    { label: 'SERVC', value: scores.service },
                    { label: 'TRUST', value: scores.trust },
                    { label: 'REACH', value: scores.reach },
                  ].map(({ label, value }) => (
                    <div key={label} className="relative text-center py-1 border border-[#444] bg-[#111]">
                      <CornerDots />
                      <p className="text-[11px]" style={goldBloom}>{value}</p>
                      <p className="text-[6px] uppercase tracking-wider" style={dimText}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="relative flex items-center justify-between px-4 h-7 bg-[#111] border-t border-[#444]">
                <CornerDots />
                <span className="text-[6px] truncate" style={dimText}>{shortOwner}</span>
                <span className="text-[8px] tracking-wider shrink-0" style={goldBloom}>BOOA</span>
              </div>
            </div>
          </div>

          {/* BACK */}
          <div
            className="absolute inset-0 border-2 border-[#444] overflow-hidden"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div className="absolute inset-0 bg-[#0a0a0a]" />
            <CornerDots />

            <div
              className="absolute inset-0 z-30 pointer-events-none opacity-[0.03]"
              style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)',
              }}
            />

            <div className="relative z-10 h-full flex flex-col">
              {/* Header */}
              <div className="relative flex items-center justify-between px-4 h-8 bg-[#111] border-b border-[#444]">
                <CornerDots />
                <span className="text-[10px] tracking-wider uppercase truncate" style={goldBloom}>
                  {agent.emoji && `${agent.emoji} `}{agent.name}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[14px] font-black"
                    style={isHighRank ? orangeBloom : dimText}
                  >
                    {scores.rank}
                  </span>
                  <PixelBattery score={scores.overall} />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 px-4 pt-3 space-y-3 overflow-hidden">
                {agent.description && (
                  <div>
                    <p className="text-[7px] uppercase tracking-wider mb-1" style={dimText}>DESCRIPTION</p>
                    <p className="text-[9px] leading-relaxed line-clamp-3" style={bodyText}>{agent.description}</p>
                  </div>
                )}

                {/* Stats with bars */}
                <div>
                  <p className="text-[7px] uppercase tracking-wider mb-1.5" style={dimText}>ASSESSMENT</p>
                  <div className="space-y-1.5">
                    {[
                      { label: 'IDENTITY', value: scores.identity },
                      { label: 'SERVICE', value: scores.service },
                      { label: 'TRUST', value: scores.trust },
                      { label: 'REACH', value: scores.reach },
                    ].map(({ label, value }, i) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-[7px] uppercase w-14 shrink-0" style={dimText}>{label}</span>
                        <div className="flex-1 h-[4px] bg-[#1a1a1a] border border-[#444]/30 overflow-hidden">
                          <div
                            className={`h-full ${i < 2 ? 'bg-[#c8b439]' : 'bg-[#e8833a]'}`}
                            style={{
                              width: `${value}%`,
                              boxShadow: i < 2
                                ? '0 0 6px rgba(200,180,57,0.5)'
                                : '0 0 6px rgba(232,131,58,0.5)',
                            }}
                          />
                        </div>
                        <span className="text-[8px] w-6 text-right" style={bodyText}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {agent.skills.length > 0 && (
                  <div>
                    <p className="text-[7px] uppercase tracking-wider mb-1" style={dimText}>SPECIAL SKILLS</p>
                    <div className="flex flex-wrap gap-1">
                      {agent.skills.slice(0, 6).map((sk) => (
                        <span key={sk} className="px-1.5 py-0.5 border border-[#444] text-[8px] uppercase" style={bodyText}>{sk}</span>
                      ))}
                    </div>
                  </div>
                )}

                {agent.domains.length > 0 && (
                  <div>
                    <p className="text-[7px] uppercase tracking-wider mb-1" style={dimText}>DOMAINS</p>
                    <div className="flex flex-wrap gap-1">
                      {agent.domains.slice(0, 4).map((d) => (
                        <span key={d} className="px-1.5 py-0.5 border border-[#444] text-[8px] uppercase" style={bodyText}>{d}</span>
                      ))}
                    </div>
                  </div>
                )}

                {agent.services.length > 0 && (
                  <div>
                    <p className="text-[7px] uppercase tracking-wider mb-1" style={dimText}>SERVICES</p>
                    <div className="space-y-0.5">
                      {agent.services.slice(0, 3).map((svc, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="text-[8px] uppercase" style={goldBloom}>{svc.name}</span>
                          {svc.endpoint && <span className="text-[7px] truncate" style={dimText}>{svc.endpoint}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {agent.personality.length > 0 && (
                  <div>
                    <p className="text-[7px] uppercase tracking-wider mb-1" style={dimText}>MENTAL STATE</p>
                    <p className="text-[9px] uppercase" style={bodyText}>{agent.personality.slice(0, 4).join(' · ')}</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="relative flex items-center justify-between px-4 h-7 bg-[#111] border-t border-[#444]">
                <CornerDots />
                <span className="text-[6px] truncate" style={dimText}>{shortOwner}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {agent.registryAgentId !== null && (
                    <span className="text-[8px]" style={{ color: '#e8833a', opacity: 0.5 }}>8004 #{agent.registryAgentId}</span>
                  )}
                  <span className="text-[8px] tracking-wider" style={goldBloom}>BOOA</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {scan8004Url && (
          <a href={scan8004Url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 h-10 px-4 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 text-xs dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors">
            <Image src="/8004scan.svg" alt="" width={14} height={14} className="dark:invert" />
            <span>8004scan</span>
          </a>
        )}
        <button onClick={(e) => { e.stopPropagation(); handleDownloadPNG(); }} className="h-10 px-4 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 text-xs dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors">
          Save PNG
        </button>
        <button onClick={(e) => { e.stopPropagation(); handleCopyLink(); }} className="h-10 px-4 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 text-xs dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors">
          {copied ? 'Copied!' : 'Share'}
        </button>
      </div>

      <p className="text-[8px] uppercase tracking-[0.25em]" style={{ color: '#333' }}>
        Click to flip
      </p>
    </div>
  );
}
