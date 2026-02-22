'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAccount, useChainId, useWriteContract, usePublicClient } from 'wagmi';
import { decodeEventLog } from 'viem';
import { useSiweStatus } from '@/components/providers/siwe-provider';
import { IDENTITY_REGISTRY_ABI, getRegistryAddress } from '@/lib/contracts/identity-registry';
import { friendlyError } from '@/utils/helpers/friendlyError';
import { ensureSmallImageURI } from '@/utils/helpers/ensureSmallImageURI';
import type { AgentService } from '@/types/agent';
import type { NFTItem } from '@/app/api/fetch-nfts/route';

export type BridgeStep = 'select' | 'configure' | 'registering' | 'complete';

const SUPPORTED_CHAINS = ['base', 'base-sepolia', 'ethereum', 'polygon', 'arbitrum'] as const;
type BridgeChain = typeof SUPPORTED_CHAINS[number];

const CHAIN_IDS: Record<string, number> = {
  base: 8453,
  'base-sepolia': 84532,
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
};

interface BridgeContextType {
  // NFT listing
  nfts: NFTItem[];
  loading: boolean;
  loadMore: () => void;
  hasMore: boolean;
  selectedChain: BridgeChain;
  setSelectedChain: (chain: BridgeChain) => void;

  // Selected NFT
  selectedNFT: NFTItem | null;
  selectNFT: (nft: NFTItem) => void;
  clearSelection: () => void;
  isExistingAgent: boolean;
  configLoading: boolean;

  // ERC-8004 config (pre-filled from NFT metadata, user-editable)
  agentName: string;
  setAgentName: (name: string) => void;
  agentDescription: string;
  setAgentDescription: (desc: string) => void;
  agentImage: string;
  erc8004Services: AgentService[];
  setErc8004Services: (s: AgentService[]) => void;
  selectedSkills: string[];
  setSelectedSkills: (s: string[]) => void;
  selectedDomains: string[];
  setSelectedDomains: (d: string[]) => void;
  x402Support: boolean;
  setX402Support: (v: boolean) => void;

  // Registration / Update
  step: BridgeStep;
  registryAgentId: bigint | null;
  registerTxHash: `0x${string}` | null;
  error: string | null;
  register: () => Promise<void>;
  updateAgent: () => Promise<void>;
  reset: () => void;
  isModalOpen: boolean;
  closeModal: () => void;
}

const BridgeContext = createContext<BridgeContextType | undefined>(undefined);

export function useBridge() {
  const ctx = useContext(BridgeContext);
  if (!ctx) throw new Error('useBridge must be used within BridgeProvider');
  return ctx;
}

export function BridgeProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const walletChainId = useChainId();
  const publicClient = usePublicClient();
  const siweStatus = useSiweStatus();
  const isAuthenticated = siweStatus === 'authenticated';
  const { writeContractAsync } = useWriteContract();

  // NFT listing state
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [pageKey, setPageKey] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState<BridgeChain>('base');

  // Selected NFT
  const [selectedNFT, setSelectedNFT] = useState<NFTItem | null>(null);
  const [isExistingAgent, setIsExistingAgent] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);

  // 8004 config
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [agentImage, setAgentImage] = useState('');
  const [erc8004Services, setErc8004Services] = useState<AgentService[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [x402Support, setX402Support] = useState(false);

  // Registration
  const [step, setStep] = useState<BridgeStep>('select');
  const [registryAgentId, setRegistryAgentId] = useState<bigint | null>(null);
  const [registerTxHash, setRegisterTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch NFTs when address or chain changes
  const fetchNFTs = useCallback(async (key?: string | null) => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/fetch-nfts', window.location.origin);
      url.searchParams.set('address', address);
      url.searchParams.set('chain', selectedChain);
      if (key) url.searchParams.set('pageKey', key);

      const res = await fetch(url.toString());
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to fetch NFTs');

      if (key) {
        setNfts(prev => [...prev, ...data.nfts]);
      } else {
        setNfts(data.nfts || []);
      }
      setPageKey(data.pageKey || null);
      setHasMore(!!data.pageKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch NFTs';
      setError(friendlyError(msg));
    } finally {
      setLoading(false);
    }
  }, [address, selectedChain]);

  useEffect(() => {
    if (isConnected && address) {
      setNfts([]);
      setPageKey(null);
      setHasMore(false);
      fetchNFTs();
    }
  }, [isConnected, address, selectedChain, fetchNFTs]);

  const loadMore = useCallback(() => {
    if (pageKey && !loading) fetchNFTs(pageKey);
  }, [pageKey, loading, fetchNFTs]);

  // Select NFT or Agent and auto-fill config
  const selectNFT = useCallback(async (nft: NFTItem) => {
    setSelectedNFT(nft);
    setError(null);

    // Check if this is an existing agent (from discover-agents, contractAddress='0x8004')
    const existing = nft.contractAddress === '0x8004';
    setIsExistingAgent(existing);

    if (existing) {
      // Existing agent — fetch full registration data via /api/fetch-agent
      setAgentName(nft.name || '');
      setAgentDescription(nft.description || '');
      setAgentImage(nft.image || '');
      setConfigLoading(true);
      setStep('configure');

      try {
        const res = await fetch('/api/fetch-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chain: nft.chain, agentId: parseInt(nft.tokenId) }),
        });
        const data = await res.json();
        if (data.registration) {
          const reg = data.registration;
          setAgentName(reg.name || nft.name || '');
          setAgentDescription(reg.description || '');
          if (reg.image) setAgentImage(reg.image);

          const services: AgentService[] = (reg.services || []).map((s: AgentService) => ({
            name: s.name || 'web',
            endpoint: s.endpoint || '',
            version: s.version || '1',
            ...(s.skills ? { skills: s.skills } : {}),
            ...(s.domains ? { domains: s.domains } : {}),
          }));
          setErc8004Services(services);

          const allSkills: string[] = [];
          const allDomains: string[] = [];
          for (const svc of reg.services || []) {
            if (svc.skills) allSkills.push(...svc.skills);
            if (svc.domains) allDomains.push(...svc.domains);
          }
          if (allSkills.length) setSelectedSkills(Array.from(new Set(allSkills)));
          if (allDomains.length) setSelectedDomains(Array.from(new Set(allDomains)));
          if (reg.x402Support !== undefined) setX402Support(!!reg.x402Support);
        }
      } catch { /* silent — basic info already set */ }
      finally { setConfigLoading(false); }
    } else {
      // New NFT — map attributes to skills/domains
      setAgentName(nft.name || `${nft.collection} #${nft.tokenId}`);
      setAgentDescription(nft.description || '');
      setAgentImage(nft.image || '');

      const attrs = nft.raw.attributes || [];
      const skillTypes = new Set(['skill', 'ability', 'power', 'class', 'trait']);
      const domainTypes = new Set(['domain', 'category', 'type', 'faction', 'realm']);

      setSelectedSkills(attrs.filter(a => skillTypes.has(a.trait_type.toLowerCase())).map(a => a.value));
      setSelectedDomains(attrs.filter(a => domainTypes.has(a.trait_type.toLowerCase())).map(a => a.value));
      setErc8004Services([]);
      setX402Support(false);
      setConfigLoading(false);
      setStep('configure');
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedNFT(null);
    setIsExistingAgent(false);
    setConfigLoading(false);
    setAgentName('');
    setAgentDescription('');
    setAgentImage('');
    setErc8004Services([]);
    setSelectedSkills([]);
    setSelectedDomains([]);
    setX402Support(false);
    setError(null);
    setStep('select');
  }, []);

  // Max agentURI size (100KB) — prevents excessive gas costs and abuse
  const MAX_AGENT_URI_BYTES = 100_000;

  // Build ERC-8004 registration JSON
  const buildRegistrationJSON = useCallback(() => {
    const cleanedServices = erc8004Services.filter(s => s.endpoint.trim() || s.name === 'OASF');

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

    for (const svc of enrichedServices) {
      if (svc.name === 'OASF' && !svc.endpoint.trim()) {
        delete (svc as unknown as Record<string, unknown>).endpoint;
      }
    }

    return {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1' as const,
      name: agentName,
      description: agentDescription,
      image: '', // will be set after ensureSmallImageURI
      services: enrichedServices,
      active: enrichedServices.some(s => s.endpoint?.trim() !== ''),
      x402Support,
      updatedAt: Math.floor(Date.now() / 1000),
    };
  }, [erc8004Services, selectedSkills, selectedDomains, agentName, agentDescription, x402Support]);

  // Register NEW agent on Identity Registry
  const register = useCallback(async () => {
    if (!selectedNFT || !address) return;
    if (!isAuthenticated) {
      setError('Please connect and sign in with your wallet to continue.');
      return;
    }

    const registryAddress = getRegistryAddress(walletChainId);

    setError(null);
    setStep('registering');
    setIsModalOpen(true);
    setRegisterTxHash(null);
    setRegistryAgentId(null);

    try {
      const registration = buildRegistrationJSON();
      registration.image = await ensureSmallImageURI(agentImage);

      const jsonStr = JSON.stringify(registration);
      if (new Blob([jsonStr]).size > MAX_AGENT_URI_BYTES) {
        throw new Error('Registration data too large. Please reduce services, skills, or image size.');
      }
      const agentURI = `data:application/json;base64,${btoa(jsonStr)}`;

      const hash = await writeContractAsync({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'register',
        args: [agentURI],
      });

      setRegisterTxHash(hash);

      if (!publicClient) throw new Error('No public client');
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      let registeredAgentId: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: IDENTITY_REGISTRY_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'Registered' && 'agentId' in decoded.args) {
            registeredAgentId = decoded.args.agentId as bigint;
            break;
          }
        } catch { continue; }
      }

      if (registeredAgentId === null) {
        throw new Error('Could not find Registered event in transaction');
      }

      setRegistryAgentId(registeredAgentId);
      setStep('complete');
    } catch (err) {
      console.error('bridge register error:', err);
      const msg = err instanceof Error ? err.message : 'Registration failed';
      if (msg.includes('User rejected') || msg.includes('user rejected') || msg.includes('denied')) {
        setStep('configure');
        setIsModalOpen(false);
        return;
      }
      setError(friendlyError(msg));
      setStep('configure');
      setIsModalOpen(false);
    }
  }, [selectedNFT, address, isAuthenticated, walletChainId, agentImage, buildRegistrationJSON, writeContractAsync, publicClient]);

  // Update EXISTING agent on Identity Registry (setAgentURI)
  const updateAgent = useCallback(async () => {
    if (!selectedNFT || !address) return;
    if (!isAuthenticated) {
      setError('Please connect and sign in with your wallet to continue.');
      return;
    }

    const agentTokenId = parseInt(selectedNFT.tokenId);
    const agentChainId = CHAIN_IDS[selectedNFT.chain] || walletChainId;
    const registryAddress = getRegistryAddress(agentChainId);

    // Check wallet is on the correct chain
    if (walletChainId !== agentChainId) {
      const chainName = SUPPORTED_CHAINS.find(c => CHAIN_IDS[c] === agentChainId) || selectedNFT.chain;
      setError(`Please switch your wallet to ${chainName} to update this agent.`);
      return;
    }

    setError(null);
    setStep('registering');
    setIsModalOpen(true);
    setRegisterTxHash(null);

    try {
      const registration = buildRegistrationJSON();
      registration.image = await ensureSmallImageURI(agentImage);

      const jsonStr = JSON.stringify(registration);
      if (new Blob([jsonStr]).size > MAX_AGENT_URI_BYTES) {
        throw new Error('Registration data too large. Please reduce services, skills, or image size.');
      }
      const agentURI = `data:application/json;base64,${btoa(jsonStr)}`;

      const hash = await writeContractAsync({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'setAgentURI',
        args: [BigInt(agentTokenId), agentURI],
      });

      setRegisterTxHash(hash);

      if (!publicClient) throw new Error('No public client');
      await publicClient.waitForTransactionReceipt({ hash });

      setRegistryAgentId(BigInt(agentTokenId));
      setStep('complete');
    } catch (err) {
      console.error('bridge update error:', err);
      const msg = err instanceof Error ? err.message : 'Update failed';
      if (msg.includes('User rejected') || msg.includes('user rejected') || msg.includes('denied')) {
        setStep('configure');
        setIsModalOpen(false);
        return;
      }
      setError(friendlyError(msg));
      setStep('configure');
      setIsModalOpen(false);
    }
  }, [selectedNFT, address, isAuthenticated, walletChainId, agentImage, buildRegistrationJSON, writeContractAsync, publicClient]);

  const reset = useCallback(() => {
    clearSelection();
    setRegistryAgentId(null);
    setRegisterTxHash(null);
    setIsModalOpen(false);
  }, [clearSelection]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    if (step === 'complete') reset();
  }, [step, reset]);

  return (
    <BridgeContext.Provider value={{
      nfts, loading, loadMore, hasMore, selectedChain, setSelectedChain: setSelectedChain as (chain: BridgeChain) => void,
      selectedNFT, selectNFT, clearSelection, isExistingAgent, configLoading,
      agentName, setAgentName, agentDescription, setAgentDescription, agentImage,
      erc8004Services, setErc8004Services,
      selectedSkills, setSelectedSkills, selectedDomains, setSelectedDomains,
      x402Support, setX402Support,
      step, registryAgentId, registerTxHash, error, register, updateAgent, reset,
      isModalOpen, closeModal,
    }}>
      {children}
    </BridgeContext.Provider>
  );
}
