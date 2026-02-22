'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useMintAgent, type MintPhase } from '@/hooks/useMintAgent';
import { useSiweStatus } from '@/components/providers/siwe-provider';
import { useWriteContract, usePublicClient } from 'wagmi';
import { decodeEventLog } from 'viem';
import type { KhoraAgent, AgentService, SupportedChain } from '@/types/agent';
import { CHAIN_CONFIG } from '@/types/agent';
import { IDENTITY_REGISTRY_ABI, IDENTITY_REGISTRY_MAINNET, IDENTITY_REGISTRY_TESTNET, getRegistryAddress } from '@/lib/contracts/identity-registry';
import { BOOA_V2_ABI, getV2Address } from '@/lib/contracts/booa-v2';
import { toERC8004 } from '@/utils/helpers/exportFormats';
import { friendlyError } from '@/utils/helpers/friendlyError';
import { ensureSmallImageURI } from '@/utils/helpers/ensureSmallImageURI';

export type Mode = 'create' | 'import';
export type Step = 'input' | 'generating' | 'confirming' | 'pending' | 'complete' | 'registering' | 'register_complete' | 'updating' | 'update_complete';
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
  pixelatedImage: string | null;
  mintedTokenId: bigint | null;
  // V2 contract info
  mintPrice: bigint | undefined;
  totalSupply: bigint | undefined;
  maxSupply: bigint | undefined;
  mintPhase: MintPhase;
  booaAddress: `0x${string}`;
  minterAddress: `0x${string}`;
  txHash: `0x${string}` | undefined;
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
  importedAgentChain: SupportedChain | null;
  setImportedAgentChain: (chain: SupportedChain | null) => void;
  importedImageURI: string | null;
  setImportedImageURI: (uri: string | null) => void;
  isImportedAgentOwner: boolean | null;  // null = not checked yet, true/false = ownership result
  setIsImportedAgentOwner: (v: boolean | null) => void;
  registryAgentId: bigint | null;
  registerTxHash: `0x${string}` | null;
  updateTxHash: `0x${string}` | null;
  // Modal
  isModalOpen: boolean;
  // Actions
  mintAndGenerate: () => void;
  registerAgent: () => void;
  updateAgentOnly: () => void;
  downloadAgent: (format: 'png' | 'svg' | 'erc8004' | 'openclaw' | 'json') => Promise<void>;
  reset: () => void;
  closeModal: () => void;
  openModal: () => void;
};

export const GeneratorContext = createContext<GeneratorContextType | undefined>(undefined);

// friendlyError imported from @/utils/helpers/friendlyError

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

/** Extract SVG image data URI from BOOA on-chain tokenURI metadata */
async function fetchBOOAImageURI(
  publicClient: ReturnType<typeof usePublicClient>,
  chainId: number,
  tokenId: bigint,
): Promise<string> {
  if (!publicClient) return '';
  try {
    const booaAddress = getV2Address(chainId);
    const tokenURIResult = await publicClient.readContract({
      address: booaAddress,
      abi: BOOA_V2_ABI,
      functionName: 'tokenURI',
      args: [tokenId],
    });
    const uri = tokenURIResult as string;
    if (!uri) return '';
    // tokenURI returns data:application/json;base64,... — decode and extract image
    if (uri.startsWith('data:')) {
      const base64 = uri.split(',')[1];
      const json = JSON.parse(atob(base64));
      return json.image || '';
    }
    return '';
  } catch (err) {
    console.error('fetchBOOAImageURI error:', err);
    return '';
  }
}

// ensureSmallImageURI imported from @/utils/helpers/ensureSmallImageURI

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
  const [pixelatedImage, setPixelatedImage] = useState<string | null>(null);
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
  const [importedAgentChain, setImportedAgentChain] = useState<SupportedChain | null>(null);
  const [importedImageURI, setImportedImageURI] = useState<string | null>(null);
  const [isImportedAgentOwner, setIsImportedAgentOwner] = useState<boolean | null>(null);
  const [registryAgentId, setRegistryAgentId] = useState<bigint | null>(null);
  const [registerTxHash, setRegisterTxHash] = useState<`0x${string}` | null>(null);
  const [updateTxHash, setUpdateTxHash] = useState<`0x${string}` | null>(null);

  const publicClient = usePublicClient();

  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // V2 mint hook — single-tx with server-signed data
  const mint = useMintAgent();

  // Restore from localStorage (mount-only)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const savedData = localStorage.getItem('khoraGeneratorData');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.agent) setAgent(parsed.agent);
        if (parsed.pixelatedImage) setPixelatedImage(parsed.pixelatedImage);
        if (parsed.currentStep === 'complete') setCurrentStep('complete');
        if (parsed.agentName) setAgentName(parsed.agentName);
        if (parsed.agentDescription) setAgentDescription(parsed.agentDescription);
        if (parsed.mode) setMode(parsed.mode);
      } catch {
        localStorage.removeItem('khoraGeneratorData');
      }
    }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (agent || pixelatedImage) {
      const data: Record<string, unknown> = {
        agent, pixelatedImage, currentStep,
        agentName, agentDescription, mode,
      };
      localStorage.setItem('khoraGeneratorData', JSON.stringify(data));
    }
  }, [agent, pixelatedImage, currentStep, agentName, agentDescription, mode]);

  // ── Check ownership when an imported agent ID changes ──
  // Uses the agent's original chain, not the wallet's current chain
  useEffect(() => {
    if (!importedRegistryTokenId || !mint.address || !importedAgentChain) {
      setIsImportedAgentOwner(null);
      return;
    }
    let cancelled = false;
    const agentChainId = CHAIN_CONFIG[importedAgentChain].chainId;
    const registryAddress = getRegistryAddress(agentChainId);

    // Use viem directly to read from the agent's chain (wallet may be on a different chain)
    const rpcUrl = CHAIN_CONFIG[importedAgentChain].rpcUrl;
    import('viem').then(({ createPublicClient, http }) => {
      const client = createPublicClient({ transport: http(rpcUrl) });
      client.readContract({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'ownerOf',
        args: [BigInt(importedRegistryTokenId)],
      }).then((owner) => {
        if (!cancelled) {
          setIsImportedAgentOwner(
            (owner as string).toLowerCase() === mint.address!.toLowerCase()
          );
        }
      }).catch(() => {
        if (!cancelled) setIsImportedAgentOwner(false);
      });
    });
    return () => { cancelled = true; };
  }, [importedRegistryTokenId, importedAgentChain, mint.address]);

  // ── React to mint phase changes ──

  // When mint tx succeeds, finalize
  useEffect(() => {
    if (mint.phase === 'success' && currentStep === 'pending') {
      setMintedTokenId(mint.tokenId);
      setCurrentStep('complete');
      setLoading(false);
      mint.refetchSupply();
      // Save full agent metadata to Upstash (permanent, no TTL)
      if (agent && agent.name && mint.tokenId !== null && mint.address) {
        saveAgentMetadataToAPI(
          mint.address,
          mint.chainId,
          Number(mint.tokenId),
          agent,
        );
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint.phase, mint.tokenId]);

  // Handle mint errors
  useEffect(() => {
    if (mint.phase === 'error' && (currentStep === 'confirming' || currentStep === 'pending')) {
      const errMsg = mint.error instanceof Error
        ? mint.error.message
        : 'Transaction failed';
      setError(friendlyError(errMsg));
      setCurrentStep('input');
      setLoading(false);
      setIsModalOpen(false);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint.phase]);

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

  // ── Register agent on Identity Registry ──
  const { writeContractAsync: writeRegister } = useWriteContract();

  const registerAgent = useCallback(async () => {
    if (mintedTokenId === null || mintedTokenId === undefined || !mint.address || !agent) {
      setError(friendlyError('Missing mint data for registration'));
      return;
    }

    setError(null);
    setCurrentStep('registering');

    try {
      const chainId = mint.chainId;
      const registryAddress = getRegistryAddress(chainId);
      const booaTokenId = Number(mintedTokenId);

      // Build ERC-8004 registration JSON
      const registration = toERC8004(agent);

      // Fetch the on-chain SVG from BOOA tokenURI (same image the NFT uses)
      const onChainImage = await fetchBOOAImageURI(publicClient, chainId, mintedTokenId);
      if (onChainImage) {
        registration.image = onChainImage;
      }

      // Strip empty endpoint field from metadata-only OASF services
      for (const svc of registration.services) {
        if (svc.name === 'OASF' && !svc.endpoint.trim()) {
          delete (svc as unknown as Record<string, unknown>).endpoint;
        }
      }

      // Add registrations array for bidirectional linking
      const registryAddr = chainId === 8453 ? IDENTITY_REGISTRY_MAINNET : IDENTITY_REGISTRY_TESTNET;
      if (mode === 'import' && importedRegistryTokenId) {
        registration.registrations = [{
          agentId: importedRegistryTokenId,
          agentRegistry: `eip155:${chainId}:${registryAddr}`,
        }];
      }

      // Encode as on-chain data URI
      const jsonStr = JSON.stringify(registration);
      const agentURI = `data:application/json;base64,${btoa(jsonStr)}`;

      let hash: `0x${string}`;

      if (mode === 'import' && importedRegistryTokenId) {
        hash = await writeRegister({
          address: registryAddress,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'setAgentURI',
          args: [BigInt(importedRegistryTokenId), agentURI],
        });
      } else {
        hash = await writeRegister({
          address: registryAddress,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'register',
          args: [agentURI],
        });
      }

      setRegisterTxHash(hash);

      if (!publicClient) throw new Error('No public client');
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      let finalAgentId: number;

      if (mode === 'import' && importedRegistryTokenId) {
        setRegistryAgentId(BigInt(importedRegistryTokenId));
        finalAgentId = importedRegistryTokenId;
      } else {
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
        await fetch(`/api/agent-registry/${mint.chainId}/${booaTokenId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: mint.address,
            registryAgentId: finalAgentId,
          }),
        });
      } catch { /* best effort */ }

      setCurrentStep('register_complete');
    } catch (err) {
      console.error('registerAgent error:', err);
      const msg = err instanceof Error ? err.message : 'Registration failed';
      if (msg.includes('User rejected') || msg.includes('user rejected') || msg.includes('denied')) {
        setCurrentStep('complete');
        return;
      }
      setError(friendlyError(msg));
      setCurrentStep('complete');
    }
  }, [mintedTokenId, mint.address, mint.chainId, agent, mode, importedRegistryTokenId, writeRegister, publicClient, pixelatedImage]);

  // ── UPDATE ONLY: update registry without minting ──
  const updateAgentOnly = useCallback(async () => {
    if (!importedRegistryTokenId || !mint.address || !importedAgentChain) {
      setError(friendlyError('Missing agent data for update'));
      return;
    }
    if (!isAuthenticated) {
      setError('Please connect and sign in with your wallet to continue.');
      return;
    }

    // Use the agent's original chain, not the wallet's current chain
    const agentChainId = CHAIN_CONFIG[importedAgentChain].chainId;
    const registryAddress = getRegistryAddress(agentChainId);

    // Ownership was already checked by the effect, but double-check here
    if (isImportedAgentOwner === false) {
      setError('You are not the owner of this agent. Only the original registrant can update it.');
      return;
    }

    // Wallet must be on the same chain as the agent's registry
    if (mint.chainId !== agentChainId) {
      setError(`Please switch your wallet to ${importedAgentChain === 'base' ? 'Base' : CHAIN_CONFIG[importedAgentChain].name} to update this agent.`);
      return;
    }

    setError(null);
    setCurrentStep('updating');
    setIsModalOpen(true);

    try {
      const registryAddr = agentChainId === 8453 ? IDENTITY_REGISTRY_MAINNET : IDENTITY_REGISTRY_TESTNET;

      // Build ERC-8004 registration from current form state
      const cleanedServices = erc8004Services
        .filter(s => s.endpoint.trim() || s.name === 'OASF')
        .map(s => {
          if (s.name !== 'OASF') {
            return { name: s.name, endpoint: s.endpoint, version: s.version };
          }
          return s;
        });

      // Merge skills/domains into OASF service
      let hasOASF = false;
      const enrichedServices = cleanedServices.map(s => {
        if (s.name === 'OASF') {
          hasOASF = true;
          return {
            ...s,
            skills: Array.from(new Set([...(s.skills || []), ...selectedSkills])),
            domains: Array.from(new Set([...(s.domains || []), ...selectedDomains])),
          };
        }
        return s;
      });
      if (!hasOASF && (selectedSkills.length || selectedDomains.length)) {
        enrichedServices.push({
          name: 'OASF',
          endpoint: '',
          version: '0.8.0',
          skills: selectedSkills,
          domains: selectedDomains,
        });
      }

      // Strip empty OASF endpoints
      for (const svc of enrichedServices) {
        if (svc.name === 'OASF' && !svc.endpoint.trim()) {
          delete (svc as unknown as Record<string, unknown>).endpoint;
        }
      }

      // Ensure image is small enough for on-chain storage (SVG pass-through, large PNG → 64x64 thumbnail)
      const imageForRegistration = await ensureSmallImageURI(importedImageURI || '');

      const registration = {
        type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1' as const,
        name: agentName,
        description: agentDescription,
        image: imageForRegistration,
        services: enrichedServices,
        active: enrichedServices.some(s => s.endpoint?.trim() !== ''),
        x402Support,
        supportedTrust: supportedTrust.length ? supportedTrust : undefined,
        updatedAt: Math.floor(Date.now() / 1000),
        registrations: [{
          agentId: importedRegistryTokenId,
          agentRegistry: `eip155:${agentChainId}:${registryAddr}`,
        }],
      };

      const jsonStr = JSON.stringify(registration);
      const agentURI = `data:application/json;base64,${btoa(jsonStr)}`;

      const hash = await writeRegister({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'setAgentURI',
        args: [BigInt(importedRegistryTokenId), agentURI],
      });

      setUpdateTxHash(hash);
      setRegistryAgentId(BigInt(importedRegistryTokenId));

      if (!publicClient) throw new Error('No public client');
      await publicClient.waitForTransactionReceipt({ hash });

      setCurrentStep('update_complete');
    } catch (err) {
      console.error('updateAgentOnly error:', err);
      const msg = err instanceof Error ? err.message : 'Update failed';
      if (msg.includes('User rejected') || msg.includes('user rejected') || msg.includes('denied')) {
        setCurrentStep('input');
        setIsModalOpen(false);
        return;
      }
      setError(friendlyError(msg));
      setCurrentStep('input');
      setIsModalOpen(false);
    }
  }, [importedRegistryTokenId, importedAgentChain, isImportedAgentOwner, mint.address, mint.chainId, isAuthenticated, agentName, agentDescription, importedImageURI, erc8004Services, selectedSkills, selectedDomains, x402Support, supportedTrust, writeRegister, publicClient]);

  // ── Main action: MINT button ──
  // V2 flow: 1) Server generates agent + signs mint packet  2) User sends single mint tx
  const mintAndGenerate = useCallback(async () => {
    if (mode === 'import') {
      if (!agentId.trim()) { setError('Please enter an Agent ID to continue.'); return; }
      const parsed = parseInt(agentId);
      if (isNaN(parsed) || parsed <= 0) { setError('Agent ID should be a positive number.'); return; }
      if (!agentName.trim()) { setError('Please select an agent or enter a name to continue.'); return; }
    }

    if (!isAuthenticated) {
      setError('Please connect and sign in with your wallet to continue.');
      return;
    }

    setError(null);
    setLoading(true);
    setCurrentStep('generating');
    setIsModalOpen(true);
    mint.reset();
    startProgressBar();

    try {
      // Step 1: Server generates AI agent + pixelates + encodes bitmap + signs packet
      const data = await mint.requestMint();

      if (!data) {
        // requestMint sets its own error via generateError
        throw new Error(mint.error?.message || 'Failed to generate agent');
      }

      // Update local state from server response
      const agentData = data.agent as unknown as KhoraAgent;
      setAgentName(agentData.name || '');
      setAgentDescription(agentData.description || '');

      // Merge skills/domains: user ERC-8004 config takes priority
      const userHasSkills = selectedSkills.length > 0;
      const userHasDomains = selectedDomains.length > 0;
      const mergedSkills = userHasSkills ? [...selectedSkills] : [...(agentData.skills || [])];
      const mergedDomains = userHasDomains ? [...selectedDomains] : [...(agentData.domains || [])];
      if (!userHasSkills) setSelectedSkills(mergedSkills);
      if (!userHasDomains) setSelectedDomains(mergedDomains);

      // Clean services
      const cleanedServices = erc8004Services
        .filter(s => s.endpoint.trim())
        .map(s => {
          if (s.name !== 'OASF') {
            return { name: s.name, endpoint: s.endpoint, version: s.version };
          }
          return s;
        });

      const finalAgent: KhoraAgent = {
        ...agentData,
        image: data.pixelatedImage,
        services: cleanedServices,
        skills: mergedSkills,
        domains: mergedDomains,
        x402Support,
        supportedTrust,
      };
      setAgent(finalAgent);
      setPixelatedImage(data.pixelatedImage);
      stopProgressBar();

      // Step 2: Send mint tx with signed data
      setCurrentStep('confirming');
      mint.sendMintTx(data);
      // Phase tracking (confirming → pending → success) handled by useMintAgent + useEffects above
      setCurrentStep('pending');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(friendlyError(msg));
      setCurrentStep('input');
      setLoading(false);
      setIsModalOpen(false);
      stopProgressBar();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, agentName, agentId, isAuthenticated, mint, selectedSkills, selectedDomains, erc8004Services, x402Support, supportedTrust]);

  // ── Open/Close modal ──
  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (currentStep === 'complete' || currentStep === 'register_complete' || currentStep === 'update_complete' || currentStep === 'input') {
      setIsModalOpen(false);
    }
  }, [currentStep]);

  const reset = useCallback(() => {
    localStorage.removeItem('khoraGeneratorData');
    setAgent(null);
    setLoading(false);
    setProgress(0);
    setError(null);
    setAgentName('');
    setAgentDescription('');
    setAgentId('');
    setSelectedChain('ethereum');
    setPixelatedImage(null);
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
    setImportedAgentChain(null);
    setImportedImageURI(null);
    setIsImportedAgentOwner(null);
    setRegistryAgentId(null);
    setRegisterTxHash(null);
    setUpdateTxHash(null);
    mint.reset();
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, [mint]);

  const downloadAgent = async (format: 'png' | 'svg' | 'erc8004' | 'openclaw' | 'json') => {
    if (!agent) return;
    const imageToUse = pixelatedImage;
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
        const { createSVGBlob } = await import('@/utils/helpers/bitmapEncoder');
        const svgBlob = await createSVGBlob(imageToUse);
        downloadBlob(svgBlob, `${fileName}.svg`);
      } else if (format === 'erc8004') {
        const { toERC8004 } = await import('@/utils/helpers/exportFormats');
        const registration = toERC8004(agent);
        if (pixelatedImage) {
          registration.image = pixelatedImage;
        }
        if (registryAgentId !== null) {
          const chainId = mint.chainId;
          const registryAddr = chainId === 8453 ? IDENTITY_REGISTRY_MAINNET : IDENTITY_REGISTRY_TESTNET;
          registration.registrations = [{
            agentId: Number(registryAgentId),
            agentRegistry: `eip155:${chainId}:${registryAddr}`,
          }];
        }
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
          const booaAddr = mint.booaAddress;
          if (booaAddr && booaAddr.length > 2) {
            openClawImage = `eip155:8453/erc721:${booaAddr}/${mintedTokenId.toString()}`;
          }
        }
        const zipBlob = await toOpenClawZip(agent, openClawImage);
        downloadBlob(zipBlob, `${fileName}-openclaw.zip`);
      }
    } catch {
      setError(friendlyError('Failed to download'));
    }
  };

  const value: GeneratorContextType = {
    mode, setMode, agentName, setAgentName, agentDescription, setAgentDescription,
    selectedChain, setSelectedChain, agentId, setAgentId,
    agent, loading, progress, error, currentStep, pixelatedImage,
    mintedTokenId,
    mintPrice: mint.mintPrice as bigint | undefined,
    totalSupply: mint.totalSupply as bigint | undefined,
    maxSupply: mint.maxSupply as bigint | undefined,
    mintPhase: mint.phase,
    booaAddress: mint.booaAddress,
    minterAddress: mint.minterAddress,
    txHash: mint.txHash,
    erc8004Services, setErc8004Services,
    x402Support, setX402Support,
    supportedTrust, setSupportedTrust,
    selectedSkills, setSelectedSkills,
    selectedDomains, setSelectedDomains,
    importedRegistryTokenId, setImportedRegistryTokenId,
    importedAgentChain, setImportedAgentChain,
    importedImageURI, setImportedImageURI,
    isImportedAgentOwner, setIsImportedAgentOwner,
    registryAgentId, registerTxHash, updateTxHash,
    isModalOpen,
    mintAndGenerate, registerAgent, updateAgentOnly, downloadAgent, reset, closeModal, openModal,
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
