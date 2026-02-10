'use client';
import { useState, useEffect } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { Image as ImageIcon, FileCode, FileJson, Archive, FileText } from 'lucide-react';
import { formatEther } from 'viem';
import { useGenerator } from '../../GeneratorContext';
import { CustomScrollArea } from '@/components/ui/custom-scroll-area';
import type { SupportedChain, DiscoveredAgent } from '@/types/agent';

const CHAIN_OPTIONS: { value: SupportedChain; label: string }[] = [
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'base', label: 'Base' },
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
  } = useGenerator();

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isWrongNetwork = isConnected && chainId !== base.id && chainId !== baseSepolia.id;

  // Agent discovery state (local to InputForm)
  const [discoveredAgents, setDiscoveredAgents] = useState<DiscoveredAgent[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);

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

  const isBusy = currentStep !== 'input' && currentStep !== 'complete';

  const isMintDisabled = () => {
    if (isBusy) return true;
    if (!isConnected) return true;
    if (!contractAddress) return true;
    if (mode === 'create') {
      return !agentName.trim() || !agentDescription.trim();
    } else {
      const parsed = parseInt(agentId);
      return !agentId.trim() || isNaN(parsed) || parsed <= 0;
    }
  };

  const getMintLabel = () => {
    if (currentStep === 'complete') return 'MINT AGAIN';
    if (currentStep !== 'input') return 'MINTING...';
    return 'MINT';
  };

  // Handle agent selection from discovery dropdown
  const handleAgentSelect = (value: string) => {
    if (!value) return;
    const [chain, tokenId] = value.split(':');
    setSelectedChain(chain as SupportedChain);
    setAgentId(tokenId);
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
                      <span className="animate-pulse">Scanning 9 chains...</span>
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

        {/* Mint Button */}
        <div>
          <button
            type="button"
            onClick={currentStep === 'complete' ? reset : mintAndGenerate}
            disabled={currentStep === 'complete' ? false : isMintDisabled()}
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
