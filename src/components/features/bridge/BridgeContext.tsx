'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useAccount, useChainId, useWriteContract, usePublicClient, useSwitchChain, useConfig } from 'wagmi';
import { getPublicClient } from '@wagmi/core';
import { decodeEventLog, isAddress } from 'viem';
import { useSiweStatus } from '@/components/providers/siwe-provider';
import { IDENTITY_REGISTRY_ABI, getRegistryAddress, isSupportedRegistryChain } from '@/lib/contracts/identity-registry';
import { BOOA_ADAPTER_ABI, getAdapterAddress, TOKEN_STANDARD_ERC721 } from '@/lib/contracts/booa-adapter';
import { friendlyError } from '@/utils/helpers/friendlyError';
import { ensureSmallImageURI } from '@/utils/helpers/ensureSmallImageURI';
import { toAgentDataURI, traitsToAgent, toERC8004 } from '@/utils/helpers/exportFormats';
import { getV2Address } from '@/lib/contracts/booa-v2';
import type { AgentService } from '@/types/agent';
import type { NFTItem } from '@/app/api/fetch-nfts/route';
import { skillLabelsToSlugs, domainLabelsToSlugs, skillSlugsToLabels, domainSlugsToLabels } from '@/lib/oasf-taxonomy';

export type BridgeStep = 'select' | 'configure' | 'registering' | 'complete';

import { CHAIN_CONFIG, type SupportedChain, type DiscoveredAgent } from '@/types/agent';

const SUPPORTED_CHAINS = Object.keys(CHAIN_CONFIG) as SupportedChain[];
type BridgeChain = SupportedChain;

const CHAIN_IDS: Record<string, number> = Object.fromEntries(
  Object.entries(CHAIN_CONFIG).map(([key, val]) => [key, val.chainId])
);

const BOOA_ORIGIN_CHAIN_IDS = [1, 360, 11011];
function isBooaOriginContract(caipContract: string): boolean {
  const addr = (caipContract.split(':')[2] || '').toLowerCase();
  if (!addr) return false;
  return BOOA_ORIGIN_CHAIN_IDS.some((id) => {
    const a = getV2Address(id);
    return !!a && a.length > 2 && a.toLowerCase() === addr;
  });
}

interface BridgeContextType {
  // NFT listing
  nfts: NFTItem[];
  loading: boolean;
  loadMore: () => void;
  hasMore: boolean;
  selectedChain: BridgeChain;

  // Selected NFT
  selectedNFT: NFTItem | null;
  selectNFT: (nft: NFTItem) => void;
  clearSelection: () => void;
  isExistingAgent: boolean;
  isAdapterBound: boolean;
  configLoading: boolean;
  // Agent already bound to the selected NFT on its own chain (null = none found)
  boundAgentId: number | null;

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
  supportedTrust: string[];
  setSupportedTrust: (t: string[]) => void;

  // Registration target chain (can differ from NFT chain)
  registryChain: BridgeChain;
  setRegistryChain: (chain: BridgeChain) => void;

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

  // Sync a BOOA-origin agent's metadata back to the NFT's on-chain traits
  ogDrift: boolean;
  canSyncToOG: boolean;
  syncToOG: () => Promise<void>;

  // Upgrade legacy native agent → adapter-bound (via Adapter8004.bindExisting)
  canUpgradeToAdapter: boolean;
  upgradeStatus: 'idle' | 'approving' | 'binding' | 'success' | 'error';
  upgradeError: string | null;
  upgradeApproveTxHash: `0x${string}` | null;
  upgradeBindTxHash: `0x${string}` | null;
  upgradeAgentToAdapter: () => Promise<void>;

  // Adapter-vs-native choice for new registrations (only shown when adapter is available + same-chain)
  canUseAdapterForNewRegister: boolean;
  useAdapterForNewRegister: boolean;
  setUseAdapterForNewRegister: (v: boolean) => void;
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
  const { switchChainAsync } = useSwitchChain();
  const wagmiConfig = useConfig();

  // NFT listing state
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [pageKey, setPageKey] = useState<string | null>(null);
  const selectedChain = useMemo<BridgeChain>(() => {
    return SUPPORTED_CHAINS.find((key) => CHAIN_CONFIG[key].chainId === walletChainId) ?? 'ethereum';
  }, [walletChainId]);

  // Selected NFT
  const [selectedNFT, setSelectedNFT] = useState<NFTItem | null>(null);
  const [isExistingAgent, setIsExistingAgent] = useState(false);
  const [isAdapterBound, setIsAdapterBound] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [upgradeStatus, setUpgradeStatus] = useState<'idle' | 'approving' | 'binding' | 'success' | 'error'>('idle');
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgradeApproveTxHash, setUpgradeApproveTxHash] = useState<`0x${string}` | null>(null);
  const [upgradeBindTxHash, setUpgradeBindTxHash] = useState<`0x${string}` | null>(null);
  const [useAdapterForNewRegister, setUseAdapterForNewRegister] = useState(true);
  const [preservedNftOrigin, setPreservedNftOrigin] = useState<{
    contract: string;
    tokenId: number;
    originalOwner: string;
  } | null>(null);
  const [ogDrift, setOgDrift] = useState(false);
  const [boundAgentId, setBoundAgentId] = useState<number | null>(null);

  // 8004 config
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [agentImage, setAgentImage] = useState('');
  const [erc8004Services, setErc8004Services] = useState<AgentService[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [x402Support, setX402Support] = useState(false);
  const [supportedTrust, setSupportedTrust] = useState<string[]>([]);

  // Registration target chain (defaults to NFT's chain, user can change)
  const [registryChain, setRegistryChain] = useState<BridgeChain>('shape');

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
    // Check if this is an existing agent (from discover-agents, contractAddress='0x8004')
    const existing = nft.contractAddress === '0x8004';
    if (!existing && !isAddress(nft.contractAddress)) {
      setSelectedNFT(null);
      setError('Invalid NFT contract address.');
      return;
    }
    setSelectedNFT(nft);
    setRegistryChain(nft.chain as BridgeChain);
    setError(null);
    setOgDrift(false);
    setBoundAgentId(null);

    setIsExistingAgent(existing);
    setIsAdapterBound(false);

    if (existing) {
      // Probe agent-binding metadata to know whether edits must route through adapter.
      const agentChainId = CHAIN_IDS[nft.chain];
      const adapterAddress = agentChainId ? getAdapterAddress(agentChainId) : null;
      if (adapterAddress && agentChainId) {
        try {
          const { createPublicClient, http } = await import('viem');
          const { CHAIN_CONFIG } = await import('@/types/agent');
          const cfg = Object.values(CHAIN_CONFIG).find(c => c.chainId === agentChainId);
          if (cfg) {
            const probeClient = createPublicClient({ transport: http(cfg.rpcUrls[0]) });
            const bindingMeta = await probeClient.readContract({
              address: getRegistryAddress(agentChainId),
              abi: IDENTITY_REGISTRY_ABI,
              functionName: 'getMetadata',
              args: [BigInt(parseInt(nft.tokenId)), 'agent-binding'],
            }) as `0x${string}`;
            if (bindingMeta && bindingMeta.toLowerCase() === adapterAddress.toLowerCase()) {
              setIsAdapterBound(true);
            }
          }
        } catch { /* no binding → leave as false */ }
      }

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

          const allSkillSlugs: string[] = [];
          const allDomainSlugs: string[] = [];
          for (const svc of reg.services || []) {
            if (svc.skills) allSkillSlugs.push(...svc.skills);
            if (svc.domains) allDomainSlugs.push(...svc.domains);
          }
          // Convert on-chain OASF slugs → human-readable labels for UI
          if (allSkillSlugs.length) setSelectedSkills(Array.from(new Set(skillSlugsToLabels(allSkillSlugs))));
          if (allDomainSlugs.length) setSelectedDomains(Array.from(new Set(domainSlugsToLabels(allDomainSlugs))));
          if (reg.x402Support !== undefined) setX402Support(!!reg.x402Support);
          if (reg.supportedTrust?.length) setSupportedTrust(reg.supportedTrust);

          if (reg.nftOrigin && typeof reg.nftOrigin === 'object') {
            const o = reg.nftOrigin as { contract?: unknown; tokenId?: unknown; originalOwner?: unknown };
            if (typeof o.contract === 'string' && typeof o.tokenId === 'number' && typeof o.originalOwner === 'string') {
              setPreservedNftOrigin({
                contract: o.contract,
                tokenId: o.tokenId,
                originalOwner: o.originalOwner,
              });

              if (isBooaOriginContract(o.contract)) {
                try {
                  const tRes = await fetch(`/api/booa-token?network=mainnet&tokenId=${o.tokenId}`);
                  if (tRes.ok) {
                    const tData = await tRes.json();
                    const tAttrs = (tData.attributes || []) as { trait_type: string; value: string }[];
                    const ogName = String(tData.name || '').trim();
                    const ogDesc = (tAttrs.find(a => a.trait_type === 'Description')?.value || '').trim();
                    const nameDrift = !!ogName && String(reg.name || '').trim() !== ogName;
                    const descDrift = !!ogDesc && String(reg.description || '').trim() !== ogDesc;
                    setOgDrift(nameDrift || descDrift);
                  }
                } catch { /* drift unknown → leave false */ }
              }
            }
          }
        }
      } catch { /* silent — basic info already set */ }
      finally { setConfigLoading(false); }
    } else {
      const attrs = nft.raw.attributes || [];
      const findAttr = (key: string) => attrs.find(a => a.trait_type?.toLowerCase() === key.toLowerCase())?.value;
      const isBOOA = nft.collection?.toLowerCase().includes('booa') || /^BOOA #\d+$/i.test(nft.name || '');
      const characterDesc = isBOOA ? (findAttr('Description') as string | undefined) : undefined;

      setAgentName(nft.name || `${nft.collection} #${nft.tokenId}`);
      setAgentDescription(characterDesc || nft.description || '');
      setAgentImage(nft.image || '');

      const skillTypes = new Set(['skill', 'ability', 'power', 'class', 'trait']);
      const domainTypes = new Set(['domain', 'category', 'type', 'faction', 'realm']);

      setSelectedSkills(attrs.filter(a => skillTypes.has(a.trait_type.toLowerCase())).map(a => a.value));
      setSelectedDomains(attrs.filter(a => domainTypes.has(a.trait_type.toLowerCase())).map(a => a.value));
      setErc8004Services([]);
      setX402Support(false);
      setSupportedTrust([]);
      setPreservedNftOrigin(null);
      setConfigLoading(false);
      setStep('configure');

      // Probe whether this NFT already has an adapter-bound agent on its own chain,
      // so same-chain re-register can be blocked (other chains stay allowed).
      if (address) {
        try {
          const res = await fetch(`/api/discover-agents?address=${address}&chain=${nft.chain}`);
          const data = await res.json();
          const bound = ((data.agents || []) as DiscoveredAgent[]).find((a) =>
            !!a.boundContract &&
            a.boundContract === nft.contractAddress.toLowerCase() &&
            String(a.boundTokenId) === nft.tokenId
          );
          if (bound) setBoundAgentId(bound.tokenId);
        } catch { /* probe failed → leave null */ }
      }
    }
  }, [address]);

  const clearSelection = useCallback(() => {
    setSelectedNFT(null);
    setIsExistingAgent(false);
    setIsAdapterBound(false);
    setConfigLoading(false);
    setUpgradeStatus('idle');
    setUpgradeError(null);
    setUpgradeApproveTxHash(null);
    setUpgradeBindTxHash(null);
    setAgentName('');
    setAgentDescription('');
    setAgentImage('');
    setErc8004Services([]);
    setSelectedSkills([]);
    setSelectedDomains([]);
    setX402Support(false);
    setSupportedTrust([]);
    setPreservedNftOrigin(null);
    setOgDrift(false);
    setBoundAgentId(null);
    setError(null);
    setStep('select');
  }, []);

  // Max agentURI size (100KB) — prevents excessive gas costs and abuse
  const MAX_AGENT_URI_BYTES = 100_000;

  // Build ERC-8004 registration JSON
  const buildRegistrationJSON = useCallback(() => {
    const cleanedServices = erc8004Services.filter(s => s.endpoint.trim() || s.name === 'OASF');

    // Convert UI labels → OASF slugs for ERC-8004 registration
    const skillSlugs = skillLabelsToSlugs(selectedSkills);
    const domainSlugs = domainLabelsToSlugs(selectedDomains);
    let hasOASF = false;
    const enrichedServices = cleanedServices.map(s => {
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
    if (!hasOASF && (skillSlugs.length || domainSlugs.length)) {
      enrichedServices.push({
        name: 'OASF',
        endpoint: 'https://github.com/agntcy/oasf/',
        version: '0.8.0',
        skills: skillSlugs,
        domains: domainSlugs,
      });
    }

    for (const svc of enrichedServices) {
      if (svc.name === 'OASF' && !svc.endpoint.trim()) {
        svc.endpoint = 'https://github.com/agntcy/oasf/';
      }
    }

    let nftOriginData: { nftOrigin: { contract: string; tokenId: number; originalOwner: string } } | Record<string, never> = {};
    if (preservedNftOrigin) {
      nftOriginData = { nftOrigin: preservedNftOrigin };
    } else if (selectedNFT && selectedNFT.contractAddress !== '0x8004' && address) {
      nftOriginData = {
        nftOrigin: {
          contract: `eip155:${selectedNFT.chainId}:${selectedNFT.contractAddress}`,
          tokenId: Number(selectedNFT.tokenId),
          originalOwner: address.toLowerCase(),
        },
      };
    }

    return {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1' as const,
      name: agentName,
      description: agentDescription,
      image: '', // will be set after ensureSmallImageURI
      services: enrichedServices,
      active: enrichedServices.some(s => s.endpoint?.trim() !== ''),
      x402Support,
      supportedTrust: supportedTrust.length ? supportedTrust : undefined,
      updatedAt: Math.floor(Date.now() / 1000),
      registeredVia: 'https://booa.app',
      ...nftOriginData,
    };
  }, [erc8004Services, selectedSkills, selectedDomains, agentName, agentDescription, x402Support, supportedTrust, selectedNFT, address, preservedNftOrigin]);

  // Register NEW agent on Identity Registry
  const register = useCallback(async () => {
    if (!selectedNFT || !address) return;
    if (!isAuthenticated) {
      setError('Please connect and sign in with your wallet to continue.');
      return;
    }
    if (boundAgentId !== null && registryChain === selectedNFT.chain) {
      setError(`Already registered on ${CHAIN_CONFIG[registryChain]?.name || registryChain} as Agent #${boundAgentId}. Pick a different chain, or edit it from the Agents tab.`);
      return;
    }

    // Use the user-selected registry chain (defaults to NFT's chain, can be changed)
    const targetChainId = CHAIN_IDS[registryChain] || walletChainId;
    const registryAddress = getRegistryAddress(targetChainId);

    if (!isSupportedRegistryChain(targetChainId)) {
      setError('This chain is not supported for agent registration.');
      return;
    }

    // Auto-switch wallet to the correct chain if needed
    if (walletChainId !== targetChainId) {
      try {
        await switchChainAsync({ chainId: targetChainId });
      } catch {
        const chainName = SUPPORTED_CHAINS.find(c => CHAIN_IDS[c] === targetChainId) || registryChain;
        setError(`Please switch your wallet to ${chainName} to register.`);
        return;
      }
    }

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
      // Add registrations array for bidirectional on-chain link (IA004)
      const regAddr = getRegistryAddress(targetChainId);
      (registration as Record<string, unknown>).registrations = [{ agentRegistry: `eip155:${targetChainId}:${regAddr}` }];

      const agentURI = toAgentDataURI(registration);

      // Adapter route requires:
      //   1. Adapter deployed on target chain
      //   2. NFT lives on the same chain as the agent (adapter calls IERC721.ownerOf locally)
      //   3. User opted in (default ON when available)
      const adapterAddress = getAdapterAddress(targetChainId);
      const sameChainNFT = selectedNFT.chain === registryChain && selectedNFT.contractAddress !== '0x8004';
      const goAdapter = !!adapterAddress && sameChainNFT && useAdapterForNewRegister;

      const hash = goAdapter
        ? await writeContractAsync({
            address: adapterAddress,
            chainId: targetChainId,
            abi: BOOA_ADAPTER_ABI,
            functionName: 'register',
            args: [
              TOKEN_STANDARD_ERC721,
              selectedNFT.contractAddress as `0x${string}`,
              BigInt(selectedNFT.tokenId),
              agentURI,
            ],
          })
        : await writeContractAsync({
            address: registryAddress,
            chainId: targetChainId,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: 'register',
            args: [agentURI],
          });

      setRegisterTxHash(hash);

      // Get a public client for the target chain (publicClient hook may still reference old chain after switch)
      const client = getPublicClient(wagmiConfig, { chainId: targetChainId }) || publicClient;
      if (!client) throw new Error('No public client');
      const receipt = await client.waitForTransactionReceipt({ hash });

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

      // Notify server to persist registry data in Redis
      fetch(`/api/agent-registry/${targetChainId}/${selectedNFT.tokenId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-siwe-address': address },
        body: JSON.stringify({ address, registryAgentId: Number(registeredAgentId), txHash: hash }),
      }).catch(() => {});
    } catch (err) {
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
  }, [selectedNFT, address, isAuthenticated, walletChainId, registryChain, agentImage, buildRegistrationJSON, writeContractAsync, switchChainAsync, wagmiConfig, publicClient, useAdapterForNewRegister, boundAgentId]);

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

    if (!isSupportedRegistryChain(agentChainId)) {
      setError('This chain is not supported for agent updates.');
      return;
    }

    // Auto-switch wallet to the correct chain if needed
    if (walletChainId !== agentChainId) {
      try {
        await switchChainAsync({ chainId: agentChainId });
      } catch {
        const chainName = SUPPORTED_CHAINS.find(c => CHAIN_IDS[c] === agentChainId) || selectedNFT.chain;
        setError(`Please switch your wallet to ${chainName} to update this agent.`);
        return;
      }
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
      // Add registrations array with agentId for bidirectional on-chain link (IA004)
      const regAddr = getRegistryAddress(agentChainId);
      (registration as Record<string, unknown>).registrations = [{
        agentId: agentTokenId,
        agentRegistry: `eip155:${agentChainId}:${regAddr}`,
      }];

      const agentURI = toAgentDataURI(registration);

      const client = getPublicClient(wagmiConfig, { chainId: agentChainId }) || publicClient;
      if (!client) throw new Error('No public client');

      const adapterAddress = getAdapterAddress(agentChainId);
      let isAdapterBound = false;
      if (adapterAddress) {
        try {
          const bindingMeta = await client.readContract({
            address: registryAddress,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: 'getMetadata',
            args: [BigInt(agentTokenId), 'agent-binding'],
          }) as `0x${string}`;
          isAdapterBound = !!bindingMeta && bindingMeta.toLowerCase() === adapterAddress.toLowerCase();
        } catch { /* no binding metadata → native agent */ }
      }

      const hash = isAdapterBound
        ? await writeContractAsync({
            address: adapterAddress!,
            chainId: agentChainId,
            abi: BOOA_ADAPTER_ABI,
            functionName: 'setAgentURI',
            args: [BigInt(agentTokenId), agentURI],
          })
        : await writeContractAsync({
            address: registryAddress,
            chainId: agentChainId,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: 'setAgentURI',
            args: [BigInt(agentTokenId), agentURI],
          });

      setRegisterTxHash(hash);

      await client.waitForTransactionReceipt({ hash });

      setRegistryAgentId(BigInt(agentTokenId));
      setStep('complete');
    } catch (err) {
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
  }, [selectedNFT, address, isAuthenticated, walletChainId, agentImage, buildRegistrationJSON, writeContractAsync, switchChainAsync, wagmiConfig, publicClient]);

  const syncToOG = useCallback(async () => {
    if (!selectedNFT || !address || !preservedNftOrigin) return;
    if (!isAuthenticated) {
      setError('Please connect and sign in with your wallet to continue.');
      return;
    }

    const agentTokenId = parseInt(selectedNFT.tokenId);
    const agentChainId = CHAIN_IDS[selectedNFT.chain] || walletChainId;
    const registryAddress = getRegistryAddress(agentChainId);

    if (!isSupportedRegistryChain(agentChainId)) {
      setError('This chain is not supported for agent updates.');
      return;
    }

    if (walletChainId !== agentChainId) {
      try {
        await switchChainAsync({ chainId: agentChainId });
      } catch {
        const chainName = SUPPORTED_CHAINS.find(c => CHAIN_IDS[c] === agentChainId) || selectedNFT.chain;
        setError(`Please switch your wallet to ${chainName} to update this agent.`);
        return;
      }
    }

    setError(null);
    setStep('registering');
    setIsModalOpen(true);
    setRegisterTxHash(null);

    try {
      const res = await fetch(`/api/booa-token?network=mainnet&tokenId=${preservedNftOrigin.tokenId}`);
      if (!res.ok) throw new Error('Could not load BOOA traits. Try again.');
      const data = await res.json();
      const attributes = (data.attributes || []) as { trait_type: string; value: string }[];
      if (attributes.length === 0) throw new Error('BOOA traits unavailable. Try again.');

      const registration = toERC8004(traitsToAgent(attributes), preservedNftOrigin, {
        agentId: agentTokenId,
        agentRegistry: `eip155:${agentChainId}:${registryAddress}`,
      });
      registration.name = String(data.name || `BOOA #${preservedNftOrigin.tokenId}`);
      registration.image = `https://booa.app/api/booa-image/${preservedNftOrigin.tokenId}`;
      const agentURI = toAgentDataURI(registration);

      const client = getPublicClient(wagmiConfig, { chainId: agentChainId }) || publicClient;
      if (!client) throw new Error('No public client');

      const adapterAddress = getAdapterAddress(agentChainId);
      let bound = false;
      if (adapterAddress) {
        try {
          const bindingMeta = await client.readContract({
            address: registryAddress,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: 'getMetadata',
            args: [BigInt(agentTokenId), 'agent-binding'],
          }) as `0x${string}`;
          bound = !!bindingMeta && bindingMeta.toLowerCase() === adapterAddress.toLowerCase();
        } catch { /* no binding metadata → native agent */ }
      }

      const hash = bound
        ? await writeContractAsync({
            address: adapterAddress!,
            chainId: agentChainId,
            abi: BOOA_ADAPTER_ABI,
            functionName: 'setAgentURI',
            args: [BigInt(agentTokenId), agentURI],
          })
        : await writeContractAsync({
            address: registryAddress,
            chainId: agentChainId,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: 'setAgentURI',
            args: [BigInt(agentTokenId), agentURI],
          });

      setRegisterTxHash(hash);
      await client.waitForTransactionReceipt({ hash });

      setRegistryAgentId(BigInt(agentTokenId));
      setOgDrift(false);
      setStep('complete');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      if (msg.includes('User rejected') || msg.includes('user rejected') || msg.includes('denied')) {
        setStep('configure');
        setIsModalOpen(false);
        return;
      }
      setError(friendlyError(msg));
      setStep('configure');
      setIsModalOpen(false);
    }
  }, [selectedNFT, address, isAuthenticated, preservedNftOrigin, walletChainId, switchChainAsync, writeContractAsync, wagmiConfig, publicClient]);

  const canSyncToOG = !!(
    isExistingAgent &&
    preservedNftOrigin &&
    isBooaOriginContract(preservedNftOrigin.contract)
  );

  // Compute upgrade eligibility: legacy native agent + current owner + adapter chain + has nftOrigin.
  const agentChainIdForUpgrade = selectedNFT && CHAIN_IDS[selectedNFT.chain];
  const canUpgradeToAdapter = !!(
    isExistingAgent &&
    !isAdapterBound &&
    preservedNftOrigin &&
    agentChainIdForUpgrade &&
    getAdapterAddress(agentChainIdForUpgrade)
  );

  // Compute adapter eligibility for NEW registrations.
  const registryChainId = CHAIN_IDS[registryChain];
  const canUseAdapterForNewRegister = !!(
    !isExistingAgent &&
    selectedNFT &&
    selectedNFT.contractAddress !== '0x8004' &&
    selectedNFT.chain === registryChain &&
    registryChainId &&
    getAdapterAddress(registryChainId)
  );

  // Upgrade legacy native agent → adapter-bound via Adapter8004.bindExisting (v0.0.6+).
  // Two transactions:
  //   1. registry.approve(adapter, agentId)  — let the adapter transfer the agent NFT
  //   2. adapter.bindExisting(agentId, ERC721, BOOA, tokenId)  — adapter takes ownership,
  //      writes binding metadata, leaves agentURI + non-binding metadata intact
  // Same agentId is preserved (no orphan), the agent's URI and history stay attached.
  const upgradeAgentToAdapter = useCallback(async () => {
    if (!selectedNFT || !address || !isAuthenticated) return;
    if (!preservedNftOrigin) {
      setUpgradeError('Agent has no nftOrigin metadata — cannot derive the bound NFT.');
      setUpgradeStatus('error');
      return;
    }

    const agentTokenId = parseInt(selectedNFT.tokenId);
    const agentChainId = CHAIN_IDS[selectedNFT.chain];
    const adapterAddress = agentChainId ? getAdapterAddress(agentChainId) : null;
    if (!adapterAddress || !agentChainId) {
      setUpgradeError('No adapter deployed on this chain.');
      setUpgradeStatus('error');
      return;
    }
    if (!isSupportedRegistryChain(agentChainId)) {
      setUpgradeError('This chain is not supported for agent binding.');
      setUpgradeStatus('error');
      return;
    }

    const contractMatch = preservedNftOrigin.contract.match(/^eip155:(\d+):(0x[a-fA-F0-9]{40})$/);
    if (!contractMatch) {
      setUpgradeError('Invalid nftOrigin format on the existing agent.');
      setUpgradeStatus('error');
      return;
    }
    const boundChainId = parseInt(contractMatch[1]);
    const boundContract = contractMatch[2] as `0x${string}`;
    if (boundChainId !== agentChainId) {
      setUpgradeError('Cross-chain nftOrigin upgrade not supported yet.');
      setUpgradeStatus('error');
      return;
    }

    if (walletChainId !== agentChainId) {
      try {
        await switchChainAsync({ chainId: agentChainId });
      } catch {
        setUpgradeError('Please switch your wallet to the agent chain.');
        setUpgradeStatus('error');
        return;
      }
    }

    setUpgradeError(null);
    setUpgradeApproveTxHash(null);
    setUpgradeBindTxHash(null);
    setIsModalOpen(true);

    try {
      const registryAddress = getRegistryAddress(agentChainId);
      const client = getPublicClient(wagmiConfig, { chainId: agentChainId }) || publicClient;
      if (!client) throw new Error('No public client');

      // Step 1 — approve adapter to transfer the agent NFT on the registry.
      setUpgradeStatus('approving');
      const approveHash = await writeContractAsync({
        address: registryAddress,
        chainId: agentChainId,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'approve',
        args: [adapterAddress, BigInt(agentTokenId)],
      });
      setUpgradeApproveTxHash(approveHash);
      await client.waitForTransactionReceipt({ hash: approveHash });

      // Step 2 — call adapter.bindExisting. Adapter transfers the agent NFT from
      // holder → adapter and writes the canonical binding metadata. agentURI and
      // non-binding metadata are preserved by the adapter; same agentId continues.
      setUpgradeStatus('binding');
      const bindHash = await writeContractAsync({
        address: adapterAddress,
        chainId: agentChainId,
        abi: BOOA_ADAPTER_ABI,
        functionName: 'bindExisting',
        args: [
          BigInt(agentTokenId),
          TOKEN_STANDARD_ERC721,
          boundContract,
          BigInt(preservedNftOrigin.tokenId),
        ],
      });
      setUpgradeBindTxHash(bindHash);
      await client.waitForTransactionReceipt({ hash: bindHash });

      setUpgradeStatus('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upgrade failed';
      if (msg.includes('User rejected') || msg.includes('user rejected') || msg.includes('denied')) {
        setUpgradeStatus('idle');
        setIsModalOpen(false);
        return;
      }
      setUpgradeError(friendlyError(msg));
      setUpgradeStatus('error');
    }
  }, [selectedNFT, address, isAuthenticated, preservedNftOrigin, walletChainId, switchChainAsync, writeContractAsync, wagmiConfig, publicClient]);

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
      nfts, loading, loadMore, hasMore, selectedChain,
      selectedNFT, selectNFT, clearSelection, isExistingAgent, isAdapterBound, configLoading, boundAgentId,
      agentName, setAgentName, agentDescription, setAgentDescription, agentImage,
      erc8004Services, setErc8004Services,
      selectedSkills, setSelectedSkills, selectedDomains, setSelectedDomains,
      x402Support, setX402Support,
      supportedTrust, setSupportedTrust,
      registryChain, setRegistryChain,
      step, registryAgentId, registerTxHash, error, register, updateAgent, reset,
      isModalOpen, closeModal,
      canUpgradeToAdapter, upgradeStatus, upgradeError, upgradeApproveTxHash, upgradeBindTxHash, upgradeAgentToAdapter,
      ogDrift, canSyncToOG, syncToOG,
      canUseAdapterForNewRegister, useAdapterForNewRegister, setUseAdapterForNewRegister,
    }}>
      {children}
    </BridgeContext.Provider>
  );
}
