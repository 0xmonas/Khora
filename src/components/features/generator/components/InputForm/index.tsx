'use client';
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useGenerator } from '../../GeneratorContext';
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
    loading,
    progress,
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
    generate,
    reset,
  } = useGenerator();

  const { address, isConnected } = useAccount();

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

  const isDisabled = currentStep === 'generating' || currentStep === 'complete';

  const isGenerateDisabled = () => {
    if (currentStep === 'generating') return true;
    if (mode === 'create') {
      return !agentName.trim() || !agentDescription.trim();
    } else {
      const parsed = parseInt(agentId);
      return !agentId.trim() || isNaN(parsed) || parsed <= 0;
    }
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
          <div className={`flex ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
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
              <div className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => { if (!isDisabled) setAgentName(e.target.value); }}
                  className="w-full bg-transparent outline-none"
                  placeholder="Type a name..."
                  disabled={isDisabled}
                />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-mono mb-1 dark:text-white">Description</h3>
              <div className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <textarea
                  value={agentDescription}
                  onChange={(e) => { if (!isDisabled) setAgentDescription(e.target.value); }}
                  className="w-full bg-transparent outline-none resize-none min-h-[80px]"
                  placeholder="Describe your agent..."
                  disabled={isDisabled}
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
                  <div className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <select
                      value={selectedValue}
                      onChange={(e) => handleAgentSelect(e.target.value)}
                      disabled={isDisabled}
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
                  <div className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <select
                      value={selectedChain}
                      onChange={(e) => setSelectedChain(e.target.value as SupportedChain)}
                      disabled={isDisabled}
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
                  <div className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input
                      type="text"
                      value={agentId}
                      onChange={(e) => {
                        if (!isDisabled) {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          setAgentId(val);
                        }
                      }}
                      className="w-full bg-transparent outline-none"
                      placeholder="Enter agent token ID..."
                      disabled={isDisabled}
                    />
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Generate / Reset */}
        <div>
          <h3 className="text-sm font-mono mb-1 dark:text-white">
            {currentStep === 'complete' ? 'Create new agent' : 'Generate agent'}
          </h3>
          <div className="relative flex gap-2">
            <button
              type="button"
              onClick={currentStep === 'complete' ? reset : generate}
              disabled={
                (currentStep === 'complete' ? false : isGenerateDisabled()) ||
                loading ||
                (mode === 'import' && !isConnected) ||
                (mode === 'import' && !manualMode && discoveredAgents.length === 0 && !discoveryLoading)
              }
              className="flex-1 p-3 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-sm hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 disabled:opacity-50 relative overflow-hidden"
            >
              {loading && (
                <div
                  className="absolute left-0 top-0 bottom-0 bg-neutral-700/20 dark:bg-neutral-200/20 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              )}
              <span className="relative z-10">
                {loading ? 'Generating...' :
                  currentStep === 'complete' ? 'New Agent' : 'Generate'}
              </span>
            </button>

            {currentStep === 'complete' && (
              <button
                type="button"
                onClick={generate}
                className="w-12 p-3 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-sm hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 flex items-center justify-center"
                title="Try again with same parameters"
              >
                <span className="font-['Departure-Mono']">↻</span>
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-500">{error}</div>
        )}
      </form>
    </div>
  );
}
