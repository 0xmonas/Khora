'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { pixelateImage } from '@/utils/pixelator';
import { createPortraitPrompt } from '@/utils/helpers/createPortraitPrompt';
import { useCommitReveal, type CommitRevealPhase } from '@/hooks/useCommitReveal';
import { useSiweStatus } from '@/components/providers/siwe-provider';
import { sanitizeSvgBytes, validateSvgForContract } from '@/utils/helpers/svgMinifier';
import { useWriteContract, usePublicClient } from 'wagmi';
import { decodeEventLog } from 'viem';
import type { KhoraAgent, AgentService, SupportedChain } from '@/types/agent';
import { IDENTITY_REGISTRY_ABI, IDENTITY_REGISTRY_MAINNET, IDENTITY_REGISTRY_TESTNET, getRegistryAddress } from '@/lib/contracts/identity-registry';
import { BOOA_NFT_ABI } from '@/lib/contracts/booa';
import { toERC8004 } from '@/utils/helpers/exportFormats';

export type Mode = 'create' | 'import';
export type Step = 'input' | 'committing' | 'generating' | 'ready_to_reveal' | 'revealing' | 'reveal_failed' | 'complete' | 'registering' | 'register_complete';

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
  // ERC-8004 config
  erc8004Services: AgentService[];
  setErc8004Services: (s: AgentService[]) => void;
  x402Support: boolean;
  setX402Support: (v: boolean) => void;
  supportedTrust: string[];
  setSupportedTrust: (t: string[]) => void;
  selectedSkills: string[];
  setSelectedSkills: (s: string[]) => void;
  selectedDomains: string[];
  setSelectedDomains: (d: string[]) => void;
  // Agent registration (ERC-8004 Identity Registry)
  importedRegistryTokenId: number | null;
  setImportedRegistryTokenId: (id: number | null) => void;
  registryAgentId: bigint | null;
  registerTxHash: `0x${string}` | null;
  // Modal
  isModalOpen: boolean;
  hasRevealData: boolean;
  // Actions
  mintAndGenerate: () => void;
  triggerReveal: () => void;
  retryReveal: () => void;
  regenerateForReveal: () => void;
  registerAgent: () => void;
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

  // ERC-8004 config state
  const [erc8004Services, setErc8004Services] = useState<AgentService[]>([]);
  const [x402Support, setX402Support] = useState(false);
  const [supportedTrust, setSupportedTrust] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);

  // Agent registration state (Identity Registry)
  const [importedRegistryTokenId, setImportedRegistryTokenId] = useState<number | null>(null);
  const [registryAgentId, setRegistryAgentId] = useState<bigint | null>(null);
  const [registerTxHash, setRegisterTxHash] = useState<`0x${string}` | null>(null);

  const publicClient = usePublicClient();

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
          pendingSvgBytes.current = sanitizeSvgBytes(hexToBytes(parsed.pendingSvgHex));
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
          pendingSvgBytes.current = sanitizeSvgBytes(hexToBytes(result.svg));
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
        // Import mode: use pre-filled form values (name/desc/skills/domains from selection)
        // Enrich with AI to generate creature, vibe, emoji, personality, boundaries
        const enrichResponse = await fetch('/api/enrich-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: agentName.trim(),
            description: agentDescription.trim(),
            skills: [...selectedSkills],
            domains: [...selectedDomains],
          }),
        });
        const enrichResult = await enrichResponse.json();
        if (!enrichResponse.ok || enrichResult.error) throw new Error(enrichResult.error || 'Failed to enrich agent');
        agentData = enrichResult.agent;
        // Keep the user's current services from form (already pre-filled at selection)
        agentData.services = [...erc8004Services];
      }

      // Generate PFP
      const imageUrl = await generateImageFromAgent(agentData);
      // Clean services: remove empty endpoints, strip OASF fields from non-OASF
      const cleanedServices = erc8004Services
        .filter(s => s.endpoint.trim())
        .map(s => {
          if (s.name !== 'OASF') {
            const { skills: _s, domains: _d, ...rest } = s;
            return rest;
          }
          return s;
        });

      // Merge AI-generated skills/domains with user-selected taxonomy picks
      const mergedSkills = Array.from(new Set([...(agentData.skills || []), ...selectedSkills]));
      const mergedDomains = Array.from(new Set([...(agentData.domains || []), ...selectedDomains]));
      setSelectedSkills(mergedSkills);
      setSelectedDomains(mergedDomains);

      const finalAgent: KhoraAgent = {
        ...agentData,
        image: imageUrl,
        services: cleanedServices,
        skills: mergedSkills,
        domains: mergedDomains,
        x402Support,
        supportedTrust,
      };
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
    const svgError = validateSvgForContract(pendingSvgBytes.current);
    if (svgError) {
      setError(svgError);
      setCurrentStep('reveal_failed');
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
    const svgError = validateSvgForContract(pendingSvgBytes.current);
    if (svgError) {
      setError(svgError);
      setCurrentStep('reveal_failed');
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

  // ── Register agent on Identity Registry ──
  const { writeContractAsync: writeRegister } = useWriteContract();

  const registerAgent = useCallback(async () => {
    if (!mintedTokenId || !commitReveal.address || !agent) {
      setError('Missing mint data for registration');
      return;
    }

    setError(null);
    setCurrentStep('registering');

    try {
      const chainId = commitReveal.chainId;
      const registryAddress = getRegistryAddress(chainId);
      const booaTokenId = Number(mintedTokenId);

      // Build ERC-8004 registration JSON
      const registration = toERC8004(agent);

      // Fetch on-chain SVG from BOOA NFT and embed as data URI (WA005 fix)
      if (!publicClient) throw new Error('No public client');
      const booaContract = (chainId === 8453
        ? process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS
        : process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS_TESTNET) as `0x${string}`;
      if (booaContract) {
        try {
          const svgString = await publicClient.readContract({
            address: booaContract,
            abi: BOOA_NFT_ABI,
            functionName: 'getSVG',
            args: [mintedTokenId],
          }) as string;
          if (svgString) {
            registration.image = `data:image/svg+xml;base64,${btoa(svgString)}`;
          }
        } catch {
          // Fallback: leave image as-is from toERC8004 (base64 pixel art)
        }
      }

      // Strip empty endpoint field from metadata-only OASF services (WA009 fix)
      for (const svc of registration.services) {
        if (svc.name === 'OASF' && !svc.endpoint.trim()) {
          delete (svc as unknown as Record<string, unknown>).endpoint;
        }
      }

      // Add registrations array for bidirectional linking (IA004 fix)
      // For import mode, we know the agentId upfront; for create mode, we set it to null
      // (will be filled after registration when agentId is known)
      const registryAddr = chainId === 8453 ? IDENTITY_REGISTRY_MAINNET : IDENTITY_REGISTRY_TESTNET;
      if (mode === 'import' && importedRegistryTokenId) {
        registration.registrations = [{
          agentId: importedRegistryTokenId,
          agentRegistry: `eip155:${chainId}:${registryAddr}`,
        }];
      }

      // Encode as on-chain data URI — fully self-contained, no API dependency
      const jsonStr = JSON.stringify(registration);
      const agentURI = `data:application/json;base64,${btoa(jsonStr)}`;

      let hash: `0x${string}`;

      if (mode === 'import' && importedRegistryTokenId) {
        // UPDATE existing agent via setAgentURI
        hash = await writeRegister({
          address: registryAddress,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'setAgentURI',
          args: [BigInt(importedRegistryTokenId), agentURI],
        });
      } else {
        // REGISTER new agent
        hash = await writeRegister({
          address: registryAddress,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'register',
          args: [agentURI],
        });
      }

      setRegisterTxHash(hash);

      // Wait for receipt via publicClient
      if (!publicClient) throw new Error('No public client');
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      let finalAgentId: number;

      if (mode === 'import' && importedRegistryTokenId) {
        // setAgentURI doesn't mint a new token — use the existing ID
        setRegistryAgentId(BigInt(importedRegistryTokenId));
        finalAgentId = importedRegistryTokenId;
      } else {
        // Decode Registered event to get agentId
        let registeredAgentId: bigint | null = null;
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: IDENTITY_REGISTRY_ABI,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === 'Registered') {
              registeredAgentId = (decoded.args as { agentId: bigint }).agentId;
              break;
            }
          } catch {
            // Not our event, skip
          }
        }

        if (registeredAgentId === null) {
          throw new Error('Could not find Registered event in transaction');
        }

        setRegistryAgentId(registeredAgentId);
        finalAgentId = Number(registeredAgentId);
      }

      // Save registry data to backend (best effort)
      try {
        await fetch(`/api/agent-registry/${chainId}/${booaTokenId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: commitReveal.address,
            registryAgentId: finalAgentId,
          }),
        });
      } catch { /* best effort */ }

      setCurrentStep('register_complete');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      // If user rejected, go back to complete (don't show error)
      if (msg.includes('User rejected') || msg.includes('user rejected') || msg.includes('denied')) {
        setCurrentStep('complete');
        return;
      }
      setError(msg.slice(0, 200));
      setCurrentStep('complete');
    }
  }, [mintedTokenId, commitReveal.address, commitReveal.chainId, agent, mode, importedRegistryTokenId, writeRegister, publicClient]);

  // ── Main action: MINT button ──
  const mintAndGenerate = useCallback(() => {
    if (mode === 'create') {
      if (!agentName.trim()) { setError('Agent name is required'); return; }
      if (!agentDescription.trim()) { setError('Agent description is required'); return; }
    } else {
      if (!agentId.trim()) { setError('Agent ID is required'); return; }
      const parsed = parseInt(agentId);
      if (isNaN(parsed) || parsed <= 0) { setError('Agent ID must be a positive number'); return; }
      if (!agentName.trim()) { setError('Agent name is required — select an agent or enter a name'); return; }
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
    if (currentStep === 'complete' || currentStep === 'register_complete' || currentStep === 'input' || currentStep === 'ready_to_reveal' || currentStep === 'reveal_failed') {
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
    setErc8004Services([]);
    setX402Support(false);
    setSupportedTrust([]);
    setSelectedSkills([]);
    setSelectedDomains([]);
    setImportedRegistryTokenId(null);
    setRegistryAgentId(null);
    setRegisterTxHash(null);
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
        const registration = toERC8004(agent);
        // Fetch on-chain SVG for image field (WA005 fix)
        if (mintedTokenId !== null && publicClient) {
          const chainId = commitReveal.chainId;
          const booaContract = (chainId === 8453
            ? process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS
            : process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS_TESTNET) as `0x${string}`;
          if (booaContract) {
            try {
              const svgString = await publicClient.readContract({
                address: booaContract,
                abi: BOOA_NFT_ABI,
                functionName: 'getSVG',
                args: [mintedTokenId],
              }) as string;
              if (svgString) {
                registration.image = `data:image/svg+xml;base64,${btoa(svgString)}`;
              }
            } catch { /* fallback: base64 pixel art from agent */ }
          }
          // Add registrations if registered (IA004 fix)
          if (registryAgentId !== null) {
            const registryAddr = chainId === 8453 ? IDENTITY_REGISTRY_MAINNET : IDENTITY_REGISTRY_TESTNET;
            registration.registrations = [{
              agentId: Number(registryAgentId),
              agentRegistry: `eip155:${chainId}:${registryAddr}`,
            }];
          }
        }
        // Strip empty endpoint from OASF (WA009 fix)
        for (const svc of registration.services) {
          if (svc.name === 'OASF' && !svc.endpoint.trim()) {
            delete (svc as unknown as Record<string, unknown>).endpoint;
          }
        }
        const blob = new Blob([JSON.stringify(registration, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `${fileName}-erc8004.json`);
      } else if (format === 'openclaw') {
        const { toOpenClawZip } = await import('@/utils/helpers/exportFormats');
        let openClawImage: string | undefined;
        if (mintedTokenId !== null) {
          const contractAddr = process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS;
          if (contractAddr) {
            openClawImage = `eip155:8453/erc721:${contractAddr}/${mintedTokenId.toString()}`;
          }
        }
        const zipBlob = await toOpenClawZip(agent, openClawImage);
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
    erc8004Services, setErc8004Services,
    x402Support, setX402Support,
    supportedTrust, setSupportedTrust,
    selectedSkills, setSelectedSkills,
    selectedDomains, setSelectedDomains,
    importedRegistryTokenId, setImportedRegistryTokenId,
    registryAgentId, registerTxHash,
    hasRevealData: !!(pendingSvgBytes.current && pendingTraitsBytes.current),
    isModalOpen,
    mintAndGenerate, triggerReveal, retryReveal, regenerateForReveal, registerAgent, downloadAgent, reset, closeModal, openModal,
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
