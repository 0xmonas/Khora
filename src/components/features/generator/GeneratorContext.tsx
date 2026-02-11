'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { pixelateImage } from '@/utils/pixelator';
import { createPortraitPrompt } from '@/utils/helpers/createPortraitPrompt';
import { useCommitReveal, type CommitRevealPhase } from '@/hooks/useCommitReveal';
import { useSiweStatus } from '@/components/providers/siwe-provider';
import type { KhoraAgent, SupportedChain } from '@/types/agent';

export type Mode = 'create' | 'import';
export type Step = 'input' | 'committing' | 'generating' | 'ready_to_reveal' | 'revealing' | 'reveal_failed' | 'complete';

type GeneratorContextType = {
  mode: Mode;
  setMode: (mode: Mode) => void;
  agentName: string;
  setAgentName: (name: string) => void;
  agentDescription: string;
  setAgentDescription: (desc: string) => void;
  selectedChain: SupportedChain;
  setSelectedChain: (chain: SupportedChain) => void;
  agentId: string;
  setAgentId: (id: string) => void;
  agent: KhoraAgent | null;
  loading: boolean;
  progress: number;
  error: string | null;
  currentStep: Step;
  generatedImage: string | null;
  pixelatedImage: string | null;
  imageLoading: boolean;
  mintedTokenId: bigint | null;
  // Commit-reveal info
  mintPrice: bigint | undefined;
  totalSupply: bigint | undefined;
  maxSupply: bigint | undefined;
  commitRevealPhase: CommitRevealPhase;
  contractAddress: `0x${string}`;
  commitTxHash: `0x${string}` | undefined;
  revealTxHash: `0x${string}` | undefined;
  // Modal
  isModalOpen: boolean;
  hasRevealData: boolean;
  // Actions
  mintAndGenerate: () => void;
  triggerReveal: () => void;
  retryReveal: () => void;
  regenerateForReveal: () => void;
  downloadAgent: (format: 'png' | 'svg' | 'erc8004' | 'openclaw' | 'json') => Promise<void>;
  reset: () => void;
  closeModal: () => void;
  openModal: () => void;
};

export const GeneratorContext = createContext<GeneratorContextType | undefined>(undefined);

// ── Pending reveal API helpers ──

async function savePendingRevealToAPI(
  address: string, chainId: number, slot: number,
  svgHex: string, traitsHex: string,
) {
  try {
    await fetch('/api/pending-reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, chainId, slot, svg: svgHex, traits: traitsHex }),
    });
  } catch {}
}

async function loadPendingRevealFromAPI(
  address: string, chainId: number, slot: number,
): Promise<{ svg: string; traits: string } | null> {
  try {
    const res = await fetch(
      `/api/pending-reveal?address=${address}&chainId=${chainId}&slot=${slot}`
    );
    const data = await res.json();
    if (data.found) return { svg: data.svg, traits: data.traits };
  } catch {}
  return null;
}

async function deletePendingRevealFromAPI(address: string, chainId: number, slot: number) {
  try {
    await fetch('/api/pending-reveal', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, chainId, slot }),
    });
  } catch {}
}

async function saveAgentMetadataToAPI(
  address: string, chainId: number, tokenId: number,
  agent: KhoraAgent,
) {
  try {
    await fetch('/api/agent-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, chainId, tokenId, agent }),
    });
  } catch {}
}

export function GeneratorProvider({ children }: { children: React.ReactNode }) {
  const siweStatus = useSiweStatus();
  const isAuthenticated = siweStatus === 'authenticated';

  const [mode, setMode] = useState<Mode>('create');
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [selectedChain, setSelectedChain] = useState<SupportedChain>('ethereum');
  const [agentId, setAgentId] = useState('');
  const [agent, setAgent] = useState<KhoraAgent | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>('input');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [pixelatedImage, setPixelatedImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [mintedTokenId, setMintedTokenId] = useState<bigint | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Track whether we're in an active mint-generate flow
  const isFlowActive = useRef(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep SVG/traits bytes in ref for retry
  const pendingSvgBytes = useRef<Uint8Array | null>(null);
  const pendingTraitsBytes = useRef<Uint8Array | null>(null);

  const commitReveal = useCommitReveal();

  // Restore from localStorage (mount-only)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const savedData = localStorage.getItem('khoraGeneratorData');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.agent) setAgent(parsed.agent);
        if (parsed.generatedImage) setGeneratedImage(parsed.generatedImage);
        if (parsed.pixelatedImage) setPixelatedImage(parsed.pixelatedImage);
        if (parsed.currentStep === 'complete') setCurrentStep('complete');
        if (parsed.agentName) setAgentName(parsed.agentName);
        if (parsed.agentDescription) setAgentDescription(parsed.agentDescription);
        if (parsed.mode) setMode(parsed.mode);
        if (parsed.pendingSvgHex) {
          pendingSvgBytes.current = hexToBytes(parsed.pendingSvgHex);
        }
        if (parsed.pendingTraitsHex) {
          pendingTraitsBytes.current = hexToBytes(parsed.pendingTraitsHex);
        }
      } catch {
        localStorage.removeItem('khoraGeneratorData');
      }
    }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (agent || generatedImage) {
      const data: Record<string, unknown> = {
        agent, generatedImage, pixelatedImage, currentStep,
        agentName, agentDescription, mode,
      };
      if (pendingSvgBytes.current) {
        data.pendingSvgHex = bytesToHex(pendingSvgBytes.current);
      }
      if (pendingTraitsBytes.current) {
        data.pendingTraitsHex = bytesToHex(pendingTraitsBytes.current);
      }
      localStorage.setItem('khoraGeneratorData', JSON.stringify(data));
    }
  }, [agent, generatedImage, pixelatedImage, currentStep, agentName, agentDescription, mode]);

  // Pixelate when image changes
  useEffect(() => {
    const processImage = async () => {
      if (!generatedImage) {
        setPixelatedImage(null);
        return;
      }
      setImageLoading(true);
      try {
        const img = new Image();
        img.src = generatedImage;
        await new Promise<void>((resolve) => { img.onload = () => resolve(); });
        const processed = await pixelateImage(generatedImage);
        setPixelatedImage(processed);
      } catch {
        setPixelatedImage(generatedImage);
      } finally {
        setImageLoading(false);
      }
    };
    processImage();
  }, [generatedImage]);

  // ── React to commit-reveal phase changes ──

  // When commit is confirmed, start AI generation
  useEffect(() => {
    if (commitReveal.phase === 'committed' && isFlowActive.current && currentStep === 'committing') {
      runGeneration();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitReveal.phase]);

  // When reveal succeeds, finalize + cleanup API + save metadata
  useEffect(() => {
    if (commitReveal.phase === 'success' && isFlowActive.current) {
      setMintedTokenId(commitReveal.tokenId);
      setCurrentStep('complete');
      setLoading(false);
      isFlowActive.current = false;
      pendingSvgBytes.current = null;
      pendingTraitsBytes.current = null;
      commitReveal.refetchSupply();
      if (commitReveal.address && commitReveal.slotIndex !== null) {
        deletePendingRevealFromAPI(
          commitReveal.address, commitReveal.chainId, Number(commitReveal.slotIndex)
        );
      }
      // Save full agent metadata to Upstash (permanent, no TTL)
      if (agent && agent.name && commitReveal.tokenId !== null && commitReveal.address) {
        saveAgentMetadataToAPI(
          commitReveal.address,
          commitReveal.chainId,
          Number(commitReveal.tokenId),
          agent,
        );
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitReveal.phase, commitReveal.tokenId]);

  // Handle reveal_failed
  useEffect(() => {
    if (commitReveal.phase === 'reveal_failed' && isFlowActive.current) {
      const errMsg = commitReveal.error instanceof Error
        ? commitReveal.error.message
        : 'Reveal transaction failed — you can retry';
      setError(errMsg.slice(0, 200));
      setCurrentStep('reveal_failed');
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitReveal.phase]);

  // Handle commit errors
  useEffect(() => {
    if (commitReveal.phase === 'error' && isFlowActive.current) {
      const errMsg = commitReveal.error instanceof Error
        ? commitReveal.error.message
        : 'Transaction failed';
      setError(errMsg.slice(0, 200));
      setCurrentStep('input');
      setLoading(false);
      isFlowActive.current = false;
      setIsModalOpen(false);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitReveal.phase]);

  // Recovery: slotIndex + pending SVG in localStorage
  useEffect(() => {
    if (
      commitReveal.phase === 'committed' &&
      !isFlowActive.current &&
      currentStep === 'input' &&
      commitReveal.slotIndex !== null &&
      pendingSvgBytes.current
    ) {
      setCurrentStep('reveal_failed');
      setError('You have a pending reveal from a previous session. Retry or generate a new image.');
      isFlowActive.current = true;
      setIsModalOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitReveal.phase, commitReveal.slotIndex, currentStep]);

  // Recovery: slotIndex but NO local SVG → try API
  useEffect(() => {
    if (
      commitReveal.phase === 'committed' &&
      !isFlowActive.current &&
      currentStep === 'input' &&
      commitReveal.slotIndex !== null &&
      !pendingSvgBytes.current &&
      commitReveal.address
    ) {
      loadPendingRevealFromAPI(
        commitReveal.address, commitReveal.chainId, Number(commitReveal.slotIndex)
      ).then(result => {
        if (result) {
          pendingSvgBytes.current = hexToBytes(result.svg);
          pendingTraitsBytes.current = hexToBytes(result.traits);
          setCurrentStep('reveal_failed');
          setError('You have a pending reveal recovered from the server. Retry or generate a new image.');
        } else {
          setCurrentStep('reveal_failed');
          setError('You have a pending commitment but the image was lost. You can generate a new image or wait for expiry to reclaim.');
        }
        isFlowActive.current = true;
        setIsModalOpen(true);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitReveal.phase, commitReveal.slotIndex, currentStep, commitReveal.address]);

  const startProgressBar = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setProgress(0);
    progressIntervalRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 99.9) return 99.9;
        const remaining = 99.9 - prev;
        const increment = Math.max(0.1, remaining * 0.03);
        return Math.round((prev + increment) * 10) / 10;
      });
    }, 100);
  };

  const stopProgressBar = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setProgress(100);
  };

  // API generation — generates but does NOT auto-reveal
  const runGeneration = async () => {
    setCurrentStep('generating');
    startProgressBar();

    try {
      let agentData: Omit<KhoraAgent, 'image'>;

      if (mode === 'create') {
        const agentResponse = await fetch('/api/generate-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: agentName.trim(), description: agentDescription.trim() }),
        });
        const agentResult = await agentResponse.json();
        if (!agentResponse.ok || agentResult.error) throw new Error(agentResult.error || 'Failed to generate agent');
        agentData = agentResult.agent;
      } else {
        const fetchResponse = await fetch('/api/fetch-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chain: selectedChain, agentId: parseInt(agentId) }),
        });
        const fetchResult = await fetchResponse.json();
        if (!fetchResponse.ok || fetchResult.error) throw new Error(fetchResult.error || 'Failed to fetch agent');

        const registration = fetchResult.registration;
        const allSkills: string[] = [];
        const allDomains: string[] = [];
        const services = registration.services || registration.endpoints || [];
        for (const svc of services) {
          if (svc.skills) allSkills.push(...svc.skills);
          if (svc.domains) allDomains.push(...svc.domains);
        }

        const enrichResponse = await fetch('/api/enrich-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: registration.name,
            description: registration.description || '',
            skills: Array.from(new Set(allSkills)),
            domains: Array.from(new Set(allDomains)),
          }),
        });
        const enrichResult = await enrichResponse.json();
        if (!enrichResponse.ok || enrichResult.error) throw new Error(enrichResult.error || 'Failed to enrich agent');
        agentData = enrichResult.agent;
        agentData.services = registration.services || registration.endpoints || [];
      }

      // Generate PFP
      const imageUrl = await generateImageFromAgent(agentData);
      const finalAgent: KhoraAgent = { ...agentData, image: imageUrl };
      setAgent(finalAgent);
      stopProgressBar();

      // Pixelate
      const pixelated = await pixelateImage(imageUrl);
      setPixelatedImage(pixelated);

      // Prepare SVG + traits
      const imageToUse = pixelated;
      const { convertToSVG } = await import('@/utils/helpers/svgConverter');
      const { minifySVG, svgToBytes, svgByteSize, SSTORE2_MAX_BYTES } = await import('@/utils/helpers/svgMinifier');

      const svgString = await convertToSVG(imageToUse);
      const minified = minifySVG(svgString);
      const byteSize = svgByteSize(minified);

      if (byteSize > SSTORE2_MAX_BYTES) {
        throw new Error(`SVG too large: ${(byteSize / 1024).toFixed(1)}KB (max 24KB)`);
      }

      const svgBytes = svgToBytes(minified);

      const attributes: Array<{ trait_type: string; value: string }> = [];
      if (agentName.trim()) attributes.push({ trait_type: 'Name', value: agentName.trim() });
      if (agentDescription.trim()) attributes.push({ trait_type: 'Description', value: agentDescription.trim() });
      if (agentData.creature) attributes.push({ trait_type: 'Creature', value: agentData.creature });
      if (agentData.vibe) attributes.push({ trait_type: 'Vibe', value: agentData.vibe });
      if (agentData.emoji) attributes.push({ trait_type: 'Emoji', value: agentData.emoji });
      for (const s of agentData.skills || []) attributes.push({ trait_type: 'Skill', value: s });
      for (const d of agentData.domains || []) attributes.push({ trait_type: 'Domain', value: d });
      for (const p of agentData.personality || []) attributes.push({ trait_type: 'Personality', value: p });
      for (const b of agentData.boundaries || []) attributes.push({ trait_type: 'Boundary', value: b });

      const traitsBytes = new TextEncoder().encode(JSON.stringify(attributes));

      // Save bytes for retry
      pendingSvgBytes.current = svgBytes;
      pendingTraitsBytes.current = traitsBytes;

      // Save to API for cross-session recovery (fire-and-forget)
      if (commitReveal.address && commitReveal.slotIndex !== null) {
        savePendingRevealToAPI(
          commitReveal.address, commitReveal.chainId, Number(commitReveal.slotIndex),
          bytesToHex(svgBytes), bytesToHex(traitsBytes),
        );
      }

      // Stop here — user will click REVEAL in the modal
      setCurrentStep('ready_to_reveal');
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setCurrentStep('input');
      setLoading(false);
      isFlowActive.current = false;
      setIsModalOpen(false);
      stopProgressBar();
    }
  };

  const generateImageFromAgent = async (agentData: Omit<KhoraAgent, 'image'>) => {
    setImageLoading(true);
    try {
      const prompt = await createPortraitPrompt(agentData);
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const responseText = await response.text();
      let data;
      try { data = JSON.parse(responseText); }
      catch { throw new Error('Invalid response format from image API'); }

      if (!response.ok || data.error) {
        throw new Error(data.error || `Image generation failed: ${response.status}`);
      }
      if (!data.image) throw new Error('No image in response');
      setGeneratedImage(data.image);
      return data.image;
    } finally {
      setImageLoading(false);
    }
  };

  // ── User clicks REVEAL in the modal ──
  const triggerReveal = useCallback(() => {
    if (!pendingSvgBytes.current || !pendingTraitsBytes.current) {
      setError('No pending reveal data');
      return;
    }
    setError(null);
    setLoading(true);
    setCurrentStep('revealing');
    isFlowActive.current = true;
    try {
      commitReveal.reveal(pendingSvgBytes.current, pendingTraitsBytes.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate reveal');
      setCurrentStep('reveal_failed');
      setLoading(false);
    }
  }, [commitReveal]);

  // ── Retry reveal (after reject/cancel) ──
  const retryReveal = useCallback(() => {
    if (!pendingSvgBytes.current || !pendingTraitsBytes.current) {
      setError('No pending reveal data — use Regenerate to create a new image');
      return;
    }
    setError(null);
    setLoading(true);
    setCurrentStep('revealing');
    isFlowActive.current = true;
    try {
      commitReveal.reveal(pendingSvgBytes.current, pendingTraitsBytes.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry reveal');
      setCurrentStep('reveal_failed');
      setLoading(false);
    }
  }, [commitReveal]);

  // ── Regenerate image for existing commit (when reveal data was lost) ──
  const regenerateForReveal = useCallback(() => {
    if (!isAuthenticated) {
      setError('Please sign in with your wallet first');
      return;
    }
    if (mode === 'create' && (!agentName.trim() || !agentDescription.trim())) {
      setError('Please fill in agent name and description first, then retry');
      return;
    }
    setError(null);
    isFlowActive.current = true;
    runGeneration();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, mode, agentName, agentDescription]);

  // ── Main action: MINT button ──
  const mintAndGenerate = useCallback(() => {
    if (mode === 'create') {
      if (!agentName.trim()) { setError('Agent name is required'); return; }
      if (!agentDescription.trim()) { setError('Agent description is required'); return; }
    } else {
      if (!agentId.trim()) { setError('Agent ID is required'); return; }
      const parsed = parseInt(agentId);
      if (isNaN(parsed) || parsed <= 0) { setError('Agent ID must be a positive number'); return; }
    }

    setError(null);
    setLoading(true);
    setCurrentStep('committing');
    isFlowActive.current = true;
    setIsModalOpen(true);

    commitReveal.reset();
    pendingSvgBytes.current = null;
    pendingTraitsBytes.current = null;

    try {
      commitReveal.commit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate transaction');
      setCurrentStep('input');
      setLoading(false);
      isFlowActive.current = false;
      setIsModalOpen(false);
    }
  }, [mode, agentName, agentDescription, agentId, commitReveal]);

  // ── Open/Close modal ──
  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (currentStep === 'complete' || currentStep === 'input' || currentStep === 'ready_to_reveal' || currentStep === 'reveal_failed') {
      setIsModalOpen(false);
    }
  }, [currentStep]);

  const reset = useCallback(() => {
    localStorage.removeItem('khoraGeneratorData');
    pendingSvgBytes.current = null;
    pendingTraitsBytes.current = null;
    setAgent(null);
    setLoading(false);
    setProgress(0);
    setError(null);
    setAgentName('');
    setAgentDescription('');
    setAgentId('');
    setSelectedChain('ethereum');
    setGeneratedImage(null);
    setPixelatedImage(null);
    setImageLoading(false);
    setCurrentStep('input');
    setMode('create');
    setMintedTokenId(null);
    setIsModalOpen(false);
    commitReveal.reset();
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, [commitReveal]);

  const downloadAgent = async (format: 'png' | 'svg' | 'erc8004' | 'openclaw' | 'json') => {
    if (!agent) return;
    const imageToUse = pixelatedImage || generatedImage;
    const fileName = agent.name.toLowerCase().replace(/\s+/g, '-');

    try {
      if (format === 'json') {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { image: _img, ...dataWithoutImage } = agent;
        const blob = new Blob([JSON.stringify(dataWithoutImage, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `${fileName}.json`);
      } else if (format === 'png') {
        if (!imageToUse) return;
        const { embedJsonInPng } = await import('@/utils/helpers/pngEncoder');
        const agentWithPixelImage = { ...agent, image: imageToUse };
        const pngBlob = await embedJsonInPng(imageToUse, agentWithPixelImage);
        downloadBlob(pngBlob, `${fileName}.png`);
      } else if (format === 'svg') {
        if (!imageToUse) return;
        const { createSVGBlob } = await import('@/utils/helpers/svgConverter');
        const svgBlob = await createSVGBlob(imageToUse);
        downloadBlob(svgBlob, `${fileName}.svg`);
      } else if (format === 'erc8004') {
        const { toERC8004 } = await import('@/utils/helpers/exportFormats');
        const agentWithPixelImage = { ...agent, image: imageToUse || agent.image };
        let onChainImage: string | undefined;
        if (mintedTokenId !== null) {
          const contractAddr = process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS;
          if (contractAddr) {
            onChainImage = `eip155:8453/erc721:${contractAddr}/${mintedTokenId.toString()}`;
          }
        }
        const registration = toERC8004(agentWithPixelImage, onChainImage);
        const blob = new Blob([JSON.stringify(registration, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `${fileName}-erc8004.json`);
      } else if (format === 'openclaw') {
        const { toOpenClawZip } = await import('@/utils/helpers/exportFormats');
        const zipBlob = await toOpenClawZip(agent);
        downloadBlob(zipBlob, `${fileName}-openclaw.zip`);
      }
    } catch {
      setError('Failed to download');
    }
  };

  const value: GeneratorContextType = {
    mode, setMode, agentName, setAgentName, agentDescription, setAgentDescription,
    selectedChain, setSelectedChain, agentId, setAgentId,
    agent, loading, progress, error, currentStep, generatedImage, pixelatedImage, imageLoading,
    mintedTokenId,
    mintPrice: commitReveal.mintPrice as bigint | undefined,
    totalSupply: commitReveal.totalSupply as bigint | undefined,
    maxSupply: commitReveal.maxSupply as bigint | undefined,
    commitRevealPhase: commitReveal.phase,
    contractAddress: commitReveal.contractAddress,
    commitTxHash: commitReveal.commitTxHash,
    revealTxHash: commitReveal.revealTxHash,
    hasRevealData: !!(pendingSvgBytes.current && pendingTraitsBytes.current),
    isModalOpen,
    mintAndGenerate, triggerReveal, retryReveal, regenerateForReveal, downloadAgent, reset, closeModal, openModal,
  };

  return (
    <GeneratorContext.Provider value={value}>
      {children}
    </GeneratorContext.Provider>
  );
}

export function useGenerator() {
  const context = useContext(GeneratorContext);
  if (context === undefined) throw new Error('useGenerator must be used within a GeneratorProvider');
  return context;
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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
