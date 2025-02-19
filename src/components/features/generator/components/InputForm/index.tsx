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
selectedClients,
pixelMode,
setPixelMode,
initialPixelMode,
selectedPalette,
setSelectedPalette,
selectedModel,
setSelectedModel
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
      <div 
        className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${
          currentStep === 'complete' || currentStep === 'generating'
            ? 'opacity-50 cursor-not-allowed'
            : ''
        }`}
      >
        <input
          type="text"
          value={characterName}
          onChange={(e) => {
            if (currentStep === 'complete' || currentStep === 'generating') return;
            setCharacterName(e.target.value);
          }}
          className="w-full bg-transparent outline-none"
          placeholder="Type a name..."
          disabled={currentStep === 'complete' || currentStep === 'generating'}
        />
      </div>
    </div>

    <div>
      <h3 className="text-sm font-mono mb-1 dark:text-white">Choose framework</h3>
      <div 
        onClick={() => {
          if (currentStep === 'complete' || currentStep === 'generating') return;
          handleClick();
        }}
        className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${
          currentStep === 'complete' || currentStep === 'generating' || !characterName.trim()
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer'
        }`}
      >
        {selectedFramework ? `${selectedFramework} selected` : 'Select framework'}
      </div>
    </div>

    <div>
      <h3 className="text-sm font-mono mb-1 dark:text-white">Art Model</h3>
      <div 
        className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${
          currentStep === 'generating' || currentStep === 'complete'
            ? 'opacity-50 cursor-not-allowed'
            : ''
        }`}
      >
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value as 'KHORA' | 'ZEREBRO' | 'BAYC')}
          disabled={currentStep === 'generating' || currentStep === 'complete'}
          className="w-full bg-transparent outline-none cursor-pointer"
        >
          <option value="KHORA">Khôra</option>
          <option value="ZEREBRO">Zerebro</option>
          <option value="BAYC">BAYC</option>
        </select>
      </div>
    </div>

    {selectedModel === 'KHORA' && (
      <div>
        <h3 className="text-sm font-mono mb-1 dark:text-white">Khôra Mode</h3>
        <div 
          onClick={() => {
            if (currentStep === 'generating') return;
            setPixelMode(!pixelMode);
          }}
          className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 relative ${
            currentStep === 'generating'
              ? 'opacity-50 cursor-not-allowed'
              : 'cursor-pointer'
          }`}
        >
          <div className="absolute inset-0 flex">
            <div className="w-1/2 flex items-center justify-center">
              <span className={`font-mono text-sm transition-opacity duration-200 ${
                !pixelMode 
                ? 'opacity-0' 
                : 'text-white dark:text-neutral-900'
              }`}>OFF</span>
            </div>
            <div className="w-1/2 flex items-center justify-center">
              <span className={`font-mono text-sm transition-opacity duration-200 ${
                pixelMode 
                ? 'opacity-0' 
                : 'text-white dark:text-neutral-900'
              }`}>ON</span>
            </div>
          </div>
          <div 
            className={`w-1/2 h-6 transition-transform duration-200 ease-in-out bg-white dark:bg-neutral-900 flex items-center justify-center ${
              pixelMode ? 'transform translate-x-full' : ''
            }`}
          >
            <span className="font-mono text-sm text-neutral-900 dark:text-white">
              {pixelMode ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      </div>
    )}

    {selectedModel === 'KHORA' && pixelMode && (
      <div>
        <h3 className="text-sm font-mono mb-1 dark:text-white">Color Style</h3>
        <div 
          className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${
            currentStep === 'generating'
              ? 'opacity-50 cursor-not-allowed'
              : ''
          }`}
        >
          <select
            value={selectedPalette}
            onChange={(e) => setSelectedPalette(e.target.value as 'DEFAULT' | 'MONOCHROME' | 'EXPERIMENTAL' | 'MIDWEST' | 'SECAM' | 'C64')}
            disabled={currentStep === 'generating'}
            className="w-full bg-transparent outline-none cursor-pointer"
          >
            <option value="MIDWEST">Midwest</option>
            <option value="DEFAULT">Default Blue</option>
            <option value="MONOCHROME">Monochrome</option>
            <option value="EXPERIMENTAL">Experimental</option>
            <option value="SECAM">SECAM</option>
            <option value="C64">Commodore 64</option>
          </select>
        </div>
      </div>
    )}

    <div>
      <h3 className="text-sm font-mono mb-1 dark:text-white">
        {currentStep === 'complete' ? 'Create new agent' : 'Generate character'}
      </h3>
      <div className="relative flex gap-2">
        <button
          type="button"
          onClick={currentStep === 'complete' ? resetGenerator : generateCharacter}
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
            onClick={generateCharacter}
            className="w-12 p-3 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-sm hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 flex items-center justify-center"
            title="Try Again with Same Parameters"
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