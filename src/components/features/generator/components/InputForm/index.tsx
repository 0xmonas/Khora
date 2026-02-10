'use client';
import { useGenerator } from '../../GeneratorContext';
import type { SupportedChain } from '@/types/agent';

const CHAIN_OPTIONS: { value: SupportedChain; label: string }[] = [
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'base', label: 'Base' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'arbitrum', label: 'Arbitrum' },
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
            <div>
              <h3 className="text-sm font-mono mb-1 dark:text-white">Chain</h3>
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

        {/* Generate / Reset */}
        <div>
          <h3 className="text-sm font-mono mb-1 dark:text-white">
            {currentStep === 'complete' ? 'Create new agent' : 'Generate agent'}
          </h3>
          <div className="relative flex gap-2">
            <button
              type="button"
              onClick={currentStep === 'complete' ? reset : generate}
              disabled={(currentStep === 'complete' ? false : isGenerateDisabled()) || loading}
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
