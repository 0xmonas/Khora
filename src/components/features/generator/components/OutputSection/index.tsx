// OutputSection.tsx
'use client';

import { useState } from 'react';
import { useGenerator } from '@/components/features/generator/GeneratorContext';
import { OutputBox } from '../OutputBox';
import { FleekWarningDialog } from '../FleekWarningDialog';
import { Framework } from '@/types/templates';

export function OutputSection() {
  const {
    character,
    loading,
    downloadCharacter,
    generatedImage,
    imageLoading,
    currentStep,
    goToStep,
    CLIENTS_BY_FRAMEWORK,
    selectedClients,
    setSelectedClients,
    selectedFramework,
    setSelectedFramework,
    FRAMEWORKS,
    resetGenerator,
    pixelMode,           
    pixelatedImage      
  } = useGenerator();

  const [showFleekWarning, setShowFleekWarning] = useState(false);
  const [pendingFramework, setPendingFramework] = useState<Framework | null>(null);

  const skeletonSize = "w-32 h-32";

  const handleFrameworkSelect = (framework: Framework) => {
    if (framework === 'fleek') {
      setPendingFramework(framework);
      setShowFleekWarning(true);
    } else {
      setSelectedFramework(framework);
      setSelectedClients([]);
    }
  };

  const handleFleekConfirm = () => {
    if (pendingFramework) {
      setSelectedFramework(pendingFramework);
      setSelectedClients([]);
    }
    setShowFleekWarning(false);
  };

  const handleFleekCancel = () => {
    setPendingFramework(null);
    setSelectedFramework(null);
    setSelectedClients([]);
    setShowFleekWarning(false);
  };

  const toggleClient = (client: string) => {
    if (selectedClients.includes(client)) {
      setSelectedClients(selectedClients.filter(c => c !== client));
    } else {
      setSelectedClients([...selectedClients, client]);
    }
  };

  if (currentStep === 'framework_selection' || currentStep === 'client_selection') {
    const availableClients = selectedFramework ? CLIENTS_BY_FRAMEWORK[selectedFramework] : [];
    
    return (
      <>
        <FleekWarningDialog 
          open={showFleekWarning}
          onConfirm={handleFleekConfirm}
          onCancel={handleFleekCancel}
        />
        <div className="w-full max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="flex flex-col w-full">
              <OutputBox 
                title="agent_framework"
                downloadType="none"
                onDownload={() => {}}
                isDownloadDisabled={true}
                type="text"
                onClose={() => goToStep('initial')}
              >
                <div className="grid grid-cols-2 gap-4">
                  {FRAMEWORKS.map((framework) => (
                    <button
                      key={framework}
                      onClick={() => handleFrameworkSelect(framework)}
                      className={`p-3 border-2 border-neutral-700 dark:border-neutral-200 font-mono text-sm ${
                        selectedFramework === framework ? 
                        'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900' : 
                        'bg-white dark:bg-neutral-900 dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5'
                      }`}
                    >
                      {framework}
                      {framework === 'fleek' && (
                        <svg className="inline-block ml-1 w-2 h-4" data-name="katman 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13.96 29.76">
                          <path
                            d="M12.92,8.66l-4.86,7.41,3.7-.79c.07.12.15.24.22.36L.42,29.76h-.42l4.75-9.17-3.49.74c-.11-.16-.12-.18-.23-.34l4.71-7.27-3.54.75c-.11-.18-.11-.18-.22-.36L13.53,0h.42l-4.69,9.05,3.42-.73c.11.16.12.18.23.34Z"
                            className={selectedFramework === framework ? 
                              'fill-white dark:fill-neutral-900' : 
                              'fill-neutral-700 dark:fill-white'   
                            }
                          />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </OutputBox>
              <div className="flex gap-4 mt-4">
                <button
                  onClick={() => {
                    setSelectedFramework(null);
                    setSelectedClients([]);
                  }}
                  className="w-full h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-sm hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5"
                >
                  Clear
                </button>
                <button
                  onClick={() => {
                    if (selectedFramework) {
                      goToStep('initial');
                    }
                  }}
                  disabled={!selectedFramework}
                  className="w-full h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-sm hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 disabled:opacity-50"
                >
                  Done
                </button>
              </div>
            </div>

            <div className="flex flex-col w-full">
              <OutputBox 
                title="select_clients"
                downloadType="none"
                onDownload={() => {}}
                isDownloadDisabled={true}
                type="text"
                onClose={() => goToStep('initial')}
              >
                <div className="grid grid-cols-3 gap-4">
                  {availableClients.map((client) => (
                    <button
                      key={client}
                      onClick={() => toggleClient(client)}
                      className={`p-3 border-2 border-neutral-700 dark:border-neutral-200 font-mono text-sm ${
                        selectedClients.includes(client) ? 
                        'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900' : 
                        'bg-white dark:bg-neutral-900 dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5'
                      }`}
                      disabled={!selectedFramework}
                    >
                      {client}
                    </button>
                  ))}
                </div>
              </OutputBox>
              <div className="flex gap-4 mt-4">
                <button
                  onClick={() => setSelectedClients([])}
                  className="w-full h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-sm hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5"
                  disabled={!selectedFramework}
                >
                  Clear
                </button>
                <button
                  onClick={() => {
                    if (selectedFramework && selectedClients.length > 0) {
                      goToStep('initial');
                    }
                  }}
                  disabled={!selectedFramework || selectedClients.length === 0}
                  className="w-full h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-sm hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 disabled:opacity-50"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="w-full max-w-[1200px] mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OutputBox 
          title="character_json"
          downloadType="json"
          onDownload={() => downloadCharacter('json')}
          isDownloadDisabled={!character}
          type="text"
          onClose={() => resetGenerator()}
        >
         {loading ? (
           <div className="w-full h-full animate-pulse flex flex-col p-4">
             <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-sm mb-3 w-3/4" />
             <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-sm mb-3 w-full" />
             <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-sm mb-3 w-5/6" />
             <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-sm mb-3 w-4/6" />
             <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-sm mb-3 w-full" />
             <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-sm mb-3 w-3/4" />
             <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-sm mb-3 w-5/6" />
             <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-sm mb-3 w-2/3" />
             <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-sm mb-3 w-4/5" />
             <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-sm mb-3 w-full" />
             <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-sm mb-3 w-3/4" />
             <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-sm w-2/3" />
           </div>
          ) : character ? (
            <pre className="font-mono text-[14px] dark:text-white">
              {JSON.stringify(character, (key, value) => key === 'type' ? undefined : value, 2)}
            </pre>
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <div className="font-mono text-[14px] text-neutral-400 dark:text-neutral-500">
              Character data will appear here...
              </div>
            </div>
          )}
        </OutputBox>

        <OutputBox
  title="agent_pfp"
  downloadType="png"
  onDownload={(format) => downloadCharacter(format)}
  isDownloadDisabled={!generatedImage || imageLoading}
  type="image"
  onClose={() => resetGenerator()}
>
         <div className="w-full h-full flex items-center justify-center">
         {loading ? (
    <div className="animate-pulse flex items-center justify-center">
      <div className={`${skeletonSize} bg-neutral-200 dark:bg-neutral-700 rounded`} />
    </div>
  ) : imageLoading ? (
    <div className="text-center font-mono text-[14px] text-neutral-400 dark:text-neutral-500">
      Generating image...
    </div>
  ) : generatedImage ? (
    <img 
      src={pixelMode && pixelatedImage ? pixelatedImage : generatedImage} 
      alt="Generated character portrait" 
      className="max-w-full max-h-full object-contain"
    />
  ) : (
    <div className="text-center font-mono text-[14px] text-neutral-400 dark:text-neutral-500">
      Character PFP will appear here...
    </div>
  )}
         </div>
       </OutputBox>
     </div>
   </div>
  );
}
