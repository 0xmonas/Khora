'use client';
import { useState, useEffect } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { Image as ImageIcon, FileCode, FileJson, Archive, FileText, ChevronDown, Plus, X as XIcon } from 'lucide-react';
import { formatEther } from 'viem';
import { useGenerator } from '../../GeneratorContext';
import { CustomScrollArea } from '@/components/ui/custom-scroll-area';
import { CHAIN_CONFIG } from '@/types/agent';
import type { SupportedChain, AgentService, DiscoveredAgent } from '@/types/agent';
import { OASF_SKILLS, OASF_DOMAINS, ALL_OASF_SKILLS, ALL_OASF_DOMAINS, type OASFCategory } from '@/lib/oasf-taxonomy';

const SERVICE_TYPES = ['web', 'A2A', 'MCP', 'OASF', 'ENS', 'DID', 'email'] as const;
const TRUST_OPTIONS = ['reputation', 'crypto-economic', 'tee-attestation'] as const;

const SERVICE_PLACEHOLDERS: Record<string, string> = {
  web: 'https://myagent.com/',
  A2A: 'https://agent.example/.well-known/agent-card.json',
  MCP: 'https://mcp.myagent.com/',
  OASF: 'ipfs://{cid}',
  ENS: 'myagent.eth',
  DID: 'did:method:identifier',
  email: 'agent@example.com',
};

function isValidEndpoint(type: string, endpoint: string): boolean {
  if (!endpoint.trim()) return false;
  if (type === 'ENS') return /^[a-zA-Z0-9-]+\.eth$/.test(endpoint.trim());
  if (type === 'DID') return endpoint.trim().startsWith('did:');
  if (type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(endpoint.trim());
  // web, A2A, MCP, OASF — must be a URL (https://, http://, ipfs://)
  try { new URL(endpoint.trim()); return true; } catch { return false; }
}

const CHAIN_OPTIONS: { value: SupportedChain; label: string }[] = [
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'base', label: 'Base' },
  { value: 'base-sepolia', label: 'Base Sepolia' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'arbitrum', label: 'Arbitrum' },
  { value: 'celo', label: 'Celo' },
  { value: 'gnosis', label: 'Gnosis' },
  { value: 'scroll', label: 'Scroll' },
  { value: 'taiko', label: 'Taiko' },
  { value: 'bsc', label: 'BNB Chain' },
];

export function InputForm() {
  const {
    mode,
    setMode,
    error,
    agentName,
    setAgentName,
    agentDescription,
    setAgentDescription,
    selectedChain,
    setSelectedChain,
    agentId,
    setAgentId,
    currentStep,
    agent,
    pixelatedImage,
    downloadAgent,
    mintAndGenerate,
    reset,
    mintPrice,
    totalSupply,
    maxSupply,
    contractAddress,
    openModal,
    erc8004Services,
    setErc8004Services,
    x402Support,
    setX402Support,
    supportedTrust,
    setSupportedTrust,
    selectedSkills,
    setSelectedSkills,
    selectedDomains,
    setSelectedDomains,
    setImportedRegistryTokenId,
  } = useGenerator();

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isWrongNetwork = isConnected && chainId !== base.id && chainId !== baseSepolia.id;

  // Agent discovery state (local to InputForm)
  const [discoveredAgents, setDiscoveredAgents] = useState<DiscoveredAgent[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [showErc8004, setShowErc8004] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [domainSearch, setDomainSearch] = useState('');
  const [openSkillCats, setOpenSkillCats] = useState<Set<string>>(new Set());
  const [openDomainCats, setOpenDomainCats] = useState<Set<string>>(new Set());

  // ERC-8004 service management helpers
  const addService = () => {
    setErc8004Services([...erc8004Services, { name: 'web', endpoint: '', version: '1' }]);
  };
  const removeService = (idx: number) => {
    setErc8004Services(erc8004Services.filter((_, i) => i !== idx));
  };
  const updateService = (idx: number, patch: Partial<AgentService>) => {
    setErc8004Services(erc8004Services.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };
  const toggleTrust = (t: string) => {
    setSupportedTrust(
      supportedTrust.includes(t)
        ? supportedTrust.filter((v) => v !== t)
        : [...supportedTrust, t]
    );
  };
  const toggleSkill = (s: string) => {
    setSelectedSkills(
      selectedSkills.includes(s)
        ? selectedSkills.filter(v => v !== s)
        : [...selectedSkills, s]
    );
  };
  const toggleDomain = (d: string) => {
    setSelectedDomains(
      selectedDomains.includes(d)
        ? selectedDomains.filter(v => v !== d)
        : [...selectedDomains, d]
    );
  };
  const toggleCat = (cat: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Custom user-added items (not in taxonomy, not from AI)
  const [customSkills, setCustomSkills] = useState<string[]>([]);
  const [customDomains, setCustomDomains] = useState<string[]>([]);

  const addCustomSkill = (s: string) => {
    if (!selectedSkills.includes(s)) {
      setSelectedSkills([...selectedSkills, s]);
      setCustomSkills([...customSkills, s]);
    }
  };
  const removeCustomSkill = (s: string) => {
    setSelectedSkills(selectedSkills.filter(v => v !== s));
    setCustomSkills(customSkills.filter(v => v !== s));
  };
  const addCustomDomain = (d: string) => {
    if (!selectedDomains.includes(d)) {
      setSelectedDomains([...selectedDomains, d]);
      setCustomDomains([...customDomains, d]);
    }
  };
  const removeCustomDomain = (d: string) => {
    setSelectedDomains(selectedDomains.filter(v => v !== d));
    setCustomDomains(customDomains.filter(v => v !== d));
  };

  // AI-generated tags (items not in taxonomy AND not user-custom)
  const aiSkills = agent ? selectedSkills.filter(s => !ALL_OASF_SKILLS.has(s) && !customSkills.includes(s)) : [];
  const aiDomains = agent ? selectedDomains.filter(d => !ALL_OASF_DOMAINS.has(d) && !customDomains.includes(d)) : [];

  // Trigger discovery when wallet connects in import mode
  useEffect(() => {
    if (mode !== 'import' || !isConnected || !address || manualMode) {
      return;
    }

    setDiscoveryLoading(true);
    setDiscoveryError(null);
    setDiscoveredAgents([]);

    fetch(`/api/discover-agents?address=${address}`)
      .then((res) => res.json())
      .then((data) => {
        setDiscoveredAgents(data.agents || []);
        if (data.errors?.length > 0) {
          const failedChains = data.errors.map((e: { chain: string }) => e.chain).join(', ');
          setDiscoveryError(`Some chains could not be scanned: ${failedChains}`);
        }
      })
      .catch((err) => setDiscoveryError(err.message || 'Failed to scan chains'))
      .finally(() => setDiscoveryLoading(false));
  }, [mode, isConnected, address, manualMode]);

  const isBusy = currentStep !== 'input' && currentStep !== 'complete' && currentStep !== 'reveal_failed';

  const isMintDisabled = () => {
    if (isBusy) return true;
    if (!isConnected) return true;
    if (!contractAddress) return true;
    if (mode === 'create') {
      return !agentName.trim() || !agentDescription.trim();
    } else {
      const parsed = parseInt(agentId);
      return !agentId.trim() || isNaN(parsed) || parsed <= 0 || !agentName.trim();
    }
  };

  const getMintLabel = () => {
    if (currentStep === 'complete' || currentStep === 'register_complete') return 'MINT AGAIN';
    if (currentStep === 'reveal_failed') return 'RESUME MINT';
    if (currentStep === 'registering') return 'REGISTERING...';
    if (currentStep !== 'input') return 'MINTING...';
    return 'MINT';
  };

  // Handle agent selection from discovery dropdown — fetch 8004 data and pre-fill form
  const handleAgentSelect = async (value: string) => {
    if (!value) return;
    const [chain, tokenId] = value.split(':');
    setSelectedChain(chain as SupportedChain);
    setAgentId(tokenId);
    setImportedRegistryTokenId(parseInt(tokenId));

    // Fetch 8004 registration data and pre-fill form
    setImportLoading(true);
    try {
      const res = await fetch('/api/fetch-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain, agentId: parseInt(tokenId) }),
      });
      const data = await res.json();
      if (data.registration) {
        const reg = data.registration;
        setAgentName(reg.name || '');
        setAgentDescription(reg.description || '');

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
        if (reg.supportedTrust?.length) setSupportedTrust(reg.supportedTrust);
      }
    } catch { /* silent — user can still fill manually */ }
    finally { setImportLoading(false); }
  };

  // Group discovered agents by chain
  const agentsByChain = discoveredAgents.reduce<Record<string, DiscoveredAgent[]>>((acc, agent) => {
    if (!acc[agent.chainName]) acc[agent.chainName] = [];
    acc[agent.chainName].push(agent);
    return acc;
  }, {});

  const selectedValue = agentId && selectedChain ? `${selectedChain}:${agentId}` : '';

  return (
    <div className="w-full lg:w-[300px] flex-shrink-0">
      <form className="space-y-6">
        {/* Mode Toggle */}
        <div>
          <h3 className="text-sm font-mono mb-1 dark:text-white">Mode</h3>
          <div className={`flex ${isBusy ? 'opacity-50 pointer-events-none' : ''}`}>
            <button
              type="button"
              onClick={() => setMode('create')}
              className={`flex-1 p-3 border-2 border-neutral-700 dark:border-neutral-200 font-mono text-sm transition-colors ${
                mode === 'create'
                  ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900'
                  : 'bg-white dark:bg-neutral-900 dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5'
              }`}
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setMode('import')}
              className={`flex-1 p-3 border-2 border-l-0 border-neutral-700 dark:border-neutral-200 font-mono text-sm transition-colors ${
                mode === 'import'
                  ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900'
                  : 'bg-white dark:bg-neutral-900 dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5'
              }`}
            >
              Import
            </button>
          </div>
        </div>

        {/* Create Mode Fields */}
        {mode === 'create' && (
          <>
            <div>
              <h3 className="text-sm font-mono mb-1 dark:text-white">Agent name</h3>
              <div className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => { if (!isBusy) setAgentName(e.target.value); }}
                  className="w-full bg-transparent outline-none"
                  placeholder="Type a name..."
                  disabled={isBusy}
                />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-mono mb-1 dark:text-white">Description</h3>
              <div className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <textarea
                  value={agentDescription}
                  onChange={(e) => { if (!isBusy) setAgentDescription(e.target.value); }}
                  className="w-full bg-transparent outline-none resize-none min-h-[80px]"
                  placeholder="Describe your agent..."
                  disabled={isBusy}
                  rows={3}
                />
              </div>
            </div>
          </>
        )}

        {/* Import Mode Fields */}
        {mode === 'import' && (
          <>
            {!isConnected ? (
              /* Wallet not connected */
              <div className="py-4">
                <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                  Connect your wallet to discover your registered agents
                </p>
              </div>
            ) : !manualMode ? (
              /* Discovery mode */
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-mono dark:text-white">Your Agents</h3>
                  <button
                    type="button"
                    onClick={() => setManualMode(true)}
                    className="text-xs font-mono text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline"
                  >
                    Enter manually
                  </button>
                </div>

                {discoveryLoading ? (
                  <div className="w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm">
                    <div className="flex items-center gap-2">
                      <span className="animate-pulse">Scanning {Object.keys(CHAIN_CONFIG).length} chains...</span>
                    </div>
                  </div>
                ) : discoveredAgents.length === 0 ? (
                  <div className="w-full p-3 border-2 border-neutral-300 dark:border-neutral-600 font-mono text-sm text-neutral-500 dark:text-neutral-400">
                    No registered agents found
                  </div>
                ) : (
                  <div className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <select
                      value={selectedValue}
                      onChange={(e) => handleAgentSelect(e.target.value)}
                      disabled={isBusy}
                      className="w-full bg-transparent outline-none cursor-pointer"
                    >
                      <option value="">Select an agent...</option>
                      {Object.entries(agentsByChain).map(([chainName, agents]) => (
                        <optgroup key={chainName} label={chainName}>
                          {agents.map((agent) => (
                            <option
                              key={`${agent.chain}:${agent.tokenId}`}
                              value={`${agent.chain}:${agent.tokenId}`}
                            >
                              {agent.name
                                ? `${agent.name} (#${agent.tokenId})`
                                : `Agent #${agent.tokenId}${!agent.hasMetadata ? ' (no metadata)' : ''}`
                              }
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}

                {discoveryError && (
                  <p className="text-xs font-mono text-amber-600 dark:text-amber-400 mt-1">
                    {discoveryError}
                  </p>
                )}
              </div>
            ) : (
              /* Manual entry mode */
              <>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-mono dark:text-white">Chain</h3>
                    <button
                      type="button"
                      onClick={() => setManualMode(false)}
                      className="text-xs font-mono text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline"
                    >
                      Back to discovery
                    </button>
                  </div>
                  <div className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <select
                      value={selectedChain}
                      onChange={(e) => setSelectedChain(e.target.value as SupportedChain)}
                      disabled={isBusy}
                      className="w-full bg-transparent outline-none cursor-pointer"
                    >
                      {CHAIN_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-mono mb-1 dark:text-white">Agent ID</h3>
                  <div className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input
                      type="text"
                      value={agentId}
                      onChange={(e) => {
                        if (!isBusy) {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          setAgentId(val);
                          const parsed = parseInt(val);
                          setImportedRegistryTokenId(isNaN(parsed) ? null : parsed);
                        }
                      }}
                      className="w-full bg-transparent outline-none"
                      placeholder="Enter agent token ID..."
                      disabled={isBusy}
                    />
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Import mode: name/description fields (pre-filled from 8004 data) */}
        {mode === 'import' && selectedValue && (
          <>
            {importLoading ? (
              <div className="py-2">
                <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400 animate-pulse">
                  Loading agent data...
                </p>
              </div>
            ) : (
              <>
                <div>
                  <h3 className="text-sm font-mono mb-1 dark:text-white">Agent name</h3>
                  <div className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input
                      type="text"
                      value={agentName}
                      onChange={(e) => { if (!isBusy) setAgentName(e.target.value); }}
                      className="w-full bg-transparent outline-none"
                      placeholder="Agent name..."
                      disabled={isBusy}
                    />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-mono mb-1 dark:text-white">Description</h3>
                  <div className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <textarea
                      value={agentDescription}
                      onChange={(e) => { if (!isBusy) setAgentDescription(e.target.value); }}
                      className="w-full bg-transparent outline-none resize-none min-h-[80px]"
                      placeholder="Agent description..."
                      disabled={isBusy}
                      rows={3}
                    />
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ERC-8004 Config (collapsible) */}
        <div className={isBusy ? 'opacity-50 pointer-events-none' : ''}>
          <button
            type="button"
            onClick={() => setShowErc8004(!showErc8004)}
            className="w-full flex items-center justify-between py-2 text-xs font-mono text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          >
            <span>ERC-8004 Config</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showErc8004 ? 'rotate-180' : ''}`} />
          </button>

          {showErc8004 && (
            <div className="space-y-4 pb-2">
              {/* Services */}
              <div>
                <h3 className="text-xs font-mono mb-2 text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Services</h3>
                <div className="space-y-2">
                  {erc8004Services.map((svc, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center gap-1">
                        {/* Type selector */}
                        <div className="w-[70px] flex-shrink-0 bg-neutral-700 dark:bg-neutral-200 font-mono text-xs">
                          <select
                            value={svc.name}
                            onChange={(e) => updateService(idx, { name: e.target.value })}
                            className="w-full bg-transparent text-white dark:text-neutral-900 outline-none px-1.5 py-1.5 cursor-pointer"
                          >
                            {SERVICE_TYPES.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        {/* Endpoint input */}
                        <div className={`flex-1 min-w-0 bg-neutral-700 dark:bg-neutral-200 font-mono text-xs ${
                          svc.endpoint && !isValidEndpoint(svc.name, svc.endpoint) ? 'ring-1 ring-red-500/50' : ''
                        }`}>
                          <input
                            type="text"
                            value={svc.endpoint}
                            onChange={(e) => updateService(idx, { endpoint: e.target.value })}
                            placeholder={SERVICE_PLACEHOLDERS[svc.name] || 'endpoint...'}
                            className="w-full bg-transparent text-white dark:text-neutral-900 outline-none px-1.5 py-1.5"
                          />
                        </div>
                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => removeService(idx)}
                          className="flex-shrink-0 p-1 text-neutral-400 hover:text-red-500 transition-colors"
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      </div>
                      {/* Version (optional, inline) */}
                      <div className="flex items-center gap-1 ml-[74px]">
                        <span className="text-[10px] font-mono text-neutral-400 flex-shrink-0">ver</span>
                        <div className="flex-1 bg-neutral-700 dark:bg-neutral-200 font-mono text-[10px]">
                          <input
                            type="text"
                            value={svc.version || ''}
                            onChange={(e) => updateService(idx, { version: e.target.value || undefined })}
                            placeholder="e.g. 0.3.0"
                            className="w-full bg-transparent text-white dark:text-neutral-900 outline-none px-1.5 py-1"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addService}
                  className="mt-2 flex items-center gap-1 text-xs font-mono text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add service
                </button>
              </div>

              {/* Agent Skills (OASF) */}
              <TaxonomyPicker
                title="Agent Skills (OASF)"
                categories={OASF_SKILLS}
                allTaxonomy={ALL_OASF_SKILLS}
                selected={selectedSkills}
                onToggle={toggleSkill}
                onAdd={addCustomSkill}
                onRemoveCustom={removeCustomSkill}
                search={skillSearch}
                onSearchChange={setSkillSearch}
                openCats={openSkillCats}
                onToggleCat={(cat) => toggleCat(cat, setOpenSkillCats)}
                aiTags={aiSkills}
                customTags={customSkills}
              />

              {/* Application Domains (OASF) */}
              <TaxonomyPicker
                title="Domains (OASF)"
                categories={OASF_DOMAINS}
                allTaxonomy={ALL_OASF_DOMAINS}
                selected={selectedDomains}
                onToggle={toggleDomain}
                onAdd={addCustomDomain}
                onRemoveCustom={removeCustomDomain}
                search={domainSearch}
                onSearchChange={setDomainSearch}
                openCats={openDomainCats}
                onToggleCat={(cat) => toggleCat(cat, setOpenDomainCats)}
                aiTags={aiDomains}
                customTags={customDomains}
              />

              {/* x402 Support */}
              <div>
                <h3 className="text-xs font-mono mb-1.5 text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">x402 Payment</h3>
                <div className="flex gap-1">
                  {[false, true].map((val) => (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => setX402Support(val)}
                      className={`px-3 py-1 font-mono text-[10px] border transition-colors ${
                        x402Support === val
                          ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 border-neutral-700 dark:border-neutral-200'
                          : 'bg-transparent text-neutral-500 dark:text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-neutral-500'
                      }`}
                    >
                      {val ? 'on' : 'off'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Supported Trust */}
              <div>
                <h3 className="text-xs font-mono mb-1.5 text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Supported Trust</h3>
                <div className="flex flex-wrap gap-1">
                  {TRUST_OPTIONS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTrust(t)}
                      className={`px-2 py-1 font-mono text-[10px] border transition-colors ${
                        supportedTrust.includes(t)
                          ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 border-neutral-700 dark:border-neutral-200'
                          : 'bg-transparent text-neutral-500 dark:text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-neutral-500'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mint Button */}
        <div>
          <button
            type="button"
            onClick={currentStep === 'complete' ? reset : currentStep === 'reveal_failed' ? openModal : mintAndGenerate}
            disabled={currentStep === 'complete' || currentStep === 'reveal_failed' ? false : isMintDisabled()}
            className="w-full h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-sm hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {getMintLabel()}
          </button>

          {/* Supply & Price Info */}
          {isWrongNetwork ? (
            <p className="text-xs font-mono text-red-500 mt-2">
              Switch to Base network to mint
            </p>
          ) : contractAddress && mintPrice !== undefined ? (
            <div className="text-xs font-mono mt-2 space-y-1">
              <div className="flex justify-between text-neutral-500">
                <span>
                  {totalSupply !== undefined ? totalSupply.toString() : '...'} minted
                  {maxSupply && maxSupply > BigInt(0) ? ` / ${maxSupply.toString()}` : ''}
                </span>
                <span>{formatEther(mintPrice)} ETH</span>
              </div>
              {chainId === baseSepolia.id && (
                <p className="text-yellow-600 dark:text-yellow-500">
                  Testnet — Base Sepolia
                </p>
              )}
            </div>
          ) : !isConnected ? (
            <p className="text-xs font-mono text-neutral-500 mt-2">
              Connect wallet to mint
            </p>
          ) : null}
        </div>

        {error && (
          <div className="text-sm text-red-500">{error}</div>
        )}
      </form>

      {/* Agent Data — shown after generation */}
      {currentStep === 'complete' && agent && (
        <div className="mt-6 space-y-4">
          <div className="border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900">
            <div className="h-10 border-b-2 border-neutral-700 dark:border-neutral-200 p-2 flex justify-between items-center">
              <span className="text-sm font-mono tracking-tight dark:text-white">agent_data</span>
            </div>
            <CustomScrollArea className="h-[300px] p-4">
              <div className="font-mono text-[13px] dark:text-white space-y-3">
                <div><span className="text-neutral-500">name:</span> {agent.name}</div>
                <div><span className="text-neutral-500">creature:</span> {agent.creature}</div>
                <div><span className="text-neutral-500">vibe:</span> {agent.vibe}</div>
                <div><span className="text-neutral-500">emoji:</span> {agent.emoji}</div>
                <div className="pt-1">
                  <span className="text-neutral-500">personality:</span>
                  <ul className="ml-2 mt-1">
                    {agent.personality.map((p, i) => <li key={i} className="text-[12px]">- {p}</li>)}
                  </ul>
                </div>
                <div>
                  <span className="text-neutral-500">skills:</span>
                  <span className="ml-1 text-[12px]">{agent.skills.join(', ')}</span>
                </div>
                <div>
                  <span className="text-neutral-500">domains:</span>
                  <span className="ml-1 text-[12px]">{agent.domains.join(', ')}</span>
                </div>
                {agent.boundaries.length > 0 && (
                  <div>
                    <span className="text-neutral-500">boundaries:</span>
                    <ul className="ml-2 mt-1">
                      {agent.boundaries.map((b, i) => <li key={i} className="text-[12px]">- {b}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </CustomScrollArea>
          </div>

          {/* Image Exports */}
          <div>
            <h4 className="text-xs font-mono text-neutral-500 uppercase tracking-wider mb-2">Image</h4>
            <div className="grid grid-cols-2 gap-2">
              <DownloadButton label="PNG" icon={ImageIcon} onClick={() => downloadAgent('png')} disabled={!pixelatedImage} />
              <DownloadButton label="SVG" icon={FileCode} onClick={() => downloadAgent('svg')} disabled={!pixelatedImage} />
            </div>
          </div>

          {/* Data Exports */}
          <div>
            <h4 className="text-xs font-mono text-neutral-500 uppercase tracking-wider mb-2">Data</h4>
            <div className="grid grid-cols-3 gap-2">
              <DownloadButton label="8004" icon={FileJson} onClick={() => downloadAgent('erc8004')} />
              <DownloadButton label="Claw" icon={Archive} onClick={() => downloadAgent('openclaw')} />
              <DownloadButton label="JSON" icon={FileText} onClick={() => downloadAgent('json')} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaxonomyPicker({
  title,
  categories,
  allTaxonomy,
  selected,
  onToggle,
  onAdd,
  onRemoveCustom,
  search,
  onSearchChange,
  openCats,
  onToggleCat,
  aiTags,
  customTags,
}: {
  title: string;
  categories: OASFCategory[];
  allTaxonomy: Set<string>;
  selected: string[];
  onToggle: (item: string) => void;
  onAdd: (item: string) => void;
  onRemoveCustom: (item: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  openCats: Set<string>;
  onToggleCat: (cat: string) => void;
  aiTags: string[];
  customTags: string[];
}) {
  const [customInput, setCustomInput] = useState('');
  const lowerSearch = search.toLowerCase();
  const filteredCats = categories
    .map(cat => ({
      ...cat,
      items: lowerSearch
        ? cat.items.filter(item => item.toLowerCase().includes(lowerSearch))
        : cat.items,
    }))
    .filter(cat => cat.items.length > 0);

  const totalSelected = selected.length;

  const handleAddCustom = () => {
    const val = customInput.trim();
    if (val && !selected.includes(val) && !allTaxonomy.has(val)) {
      onAdd(val);
      setCustomInput('');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-xs font-mono text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{title}</h3>
        {totalSelected > 0 && (
          <span className="text-[10px] font-mono text-neutral-400">{totalSelected} selected</span>
        )}
      </div>

      {/* Search */}
      <div className="bg-neutral-700 dark:bg-neutral-200 font-mono text-[10px] mb-1.5">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search..."
          className="w-full bg-transparent text-white dark:text-neutral-900 outline-none px-1.5 py-1"
        />
      </div>

      {/* Categories accordion */}
      <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
        {filteredCats.map(cat => {
          const isOpen = openCats.has(cat.label) || !!lowerSearch;
          const catSelected = cat.items.filter(i => selected.includes(i)).length;

          return (
            <div key={cat.label}>
              <button
                type="button"
                onClick={() => onToggleCat(cat.label)}
                className="w-full flex items-center justify-between py-1 text-[10px] font-mono text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              >
                <span className="flex items-center gap-1">
                  <ChevronDown className={`w-2.5 h-2.5 transition-transform ${isOpen ? 'rotate-180' : '-rotate-90'}`} />
                  {cat.label}
                </span>
                {catSelected > 0 && (
                  <span className="text-neutral-500">{catSelected}/{cat.items.length}</span>
                )}
              </button>

              {isOpen && (
                <div className="flex flex-wrap gap-1 pb-1.5 pl-3.5">
                  {cat.items.map(item => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => onToggle(item)}
                      className={`px-1.5 py-0.5 font-mono text-[9px] border transition-colors ${
                        selected.includes(item)
                          ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 border-neutral-700 dark:border-neutral-200'
                          : 'bg-transparent text-neutral-500 dark:text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-neutral-500'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom add */}
      <div className="mt-1.5 flex items-center gap-1">
        <div className="flex-1 bg-neutral-700 dark:bg-neutral-200 font-mono text-[10px]">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustom(); } }}
            placeholder="Add custom..."
            className="w-full bg-transparent text-white dark:text-neutral-900 outline-none px-1.5 py-1"
          />
        </div>
        <button
          type="button"
          onClick={handleAddCustom}
          disabled={!customInput.trim()}
          className="flex-shrink-0 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 disabled:opacity-30 transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Custom + AI tags */}
      {(customTags.length > 0 || aiTags.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {customTags.map(tag => (
            <span
              key={`custom-${tag}`}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 font-mono text-[9px] text-neutral-400 dark:text-neutral-500 border border-neutral-400 dark:border-neutral-500"
            >
              {tag}
              <button type="button" onClick={() => onRemoveCustom(tag)} className="hover:text-red-500 transition-colors">
                <XIcon className="w-2 h-2" />
              </button>
            </span>
          ))}
          {aiTags.map(tag => (
            <span
              key={`ai-${tag}`}
              className="px-1.5 py-0.5 font-mono text-[9px] italic text-neutral-400 dark:text-neutral-500 border border-dashed border-neutral-300 dark:border-neutral-600"
            >
              {tag} (AI)
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DownloadButton({
  label,
  onClick,
  disabled = false,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-10 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono text-xs dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
