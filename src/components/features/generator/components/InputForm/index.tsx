'use client';
import { useGenerator } from '../../GeneratorContext';

export function InputForm() {
  const {
    loading,
    progress,
    error,
    characterName,
    setCharacterName,
    generateCharacter,
    currentStep,
    goToStep,
    resetGenerator,
    selectedFramework,
    selectedClients
  } = useGenerator();

  const handleClick = () => {
    if (!characterName.trim()) return;
    goToStep('framework_selection');
  };

  const isGenerateDisabled = () => {
    if (currentStep === 'generating') return true;
    if (!characterName.trim() || !selectedFramework) return true;
    if (currentStep === 'client_selection' && !selectedClients.length) return true;
    return false;
  };

  return (
    <div className="w-full lg:w-[300px] flex-shrink-0">
      <form className="space-y-8">
        <div>
          <h3 className="text-sm font-mono mb-1 dark:text-white">Name your agent</h3>
          <input
            type="text"
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            className="w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm"
            placeholder="Type a name..."
            disabled={currentStep === 'generating'}
          />
        </div>

        <div>
          <h3 className="text-sm font-mono mb-1 dark:text-white">Choose framework</h3>
          <button
            type="button"
            onClick={handleClick}
            disabled={!characterName.trim() || currentStep === 'generating'}
            className="w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm disabled:opacity-50"
          >
            {selectedFramework ? `${selectedFramework} selected` : 'Select framework'}
          </button>
        </div>

        <div>
          <h3 className="text-sm font-mono mb-1 dark:text-white">
            {currentStep === 'complete' ? 'Create new agent' : 'Generate character'}
          </h3>
          <button
            type="button"
            onClick={currentStep === 'complete' ? resetGenerator : generateCharacter}
            disabled={isGenerateDisabled()}
            className="w-full p-3 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-sm hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 disabled:opacity-50"
          >
            {loading ? `Generating... ${progress}%` : 
              currentStep === 'complete' ? 'New Agent' : 'Generate'}
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-500">{error}</div>
        )}
      </form>
    </div>
  );
}