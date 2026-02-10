'use client';

import { useGenerator } from '@/components/features/generator/GeneratorContext';
import { OutputBox } from '../OutputBox';
import { MintButton } from '../MintButton';

export function OutputSection() {
  const {
    agent,
    loading,
    downloadAgent,
    imageLoading,
    pixelatedImage,
    currentStep,
    reset,
  } = useGenerator();

  // Only show pixelated image — never show raw Gemini output
  const imageToShow = pixelatedImage;

  // Don't render anything before generation starts
  if (currentStep === 'input' && !loading) return null;

  return (
    <div className="w-full max-w-[1200px] mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent Data Box */}
        <OutputBox
          title="agent_data"
          type="text"
          onClose={() => reset()}
        >
          {loading ? (
            <div className="w-full h-full animate-pulse flex flex-col p-4 space-y-4">
              {/* Label + value pairs mimicking real data layout */}
              <div className="flex items-center gap-2">
                <div className="h-2.5 bg-neutral-300 dark:bg-neutral-600 w-12" />
                <div className="h-2.5 bg-neutral-200 dark:bg-neutral-700 w-32" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2.5 bg-neutral-300 dark:bg-neutral-600 w-16" />
                <div className="h-2.5 bg-neutral-200 dark:bg-neutral-700 w-28" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2.5 bg-neutral-300 dark:bg-neutral-600 w-10" />
                <div className="h-2.5 bg-neutral-200 dark:bg-neutral-700 w-40" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2.5 bg-neutral-300 dark:bg-neutral-600 w-12" />
                <div className="h-2.5 bg-neutral-200 dark:bg-neutral-700 w-8" />
              </div>
              {/* Personality list block */}
              <div className="pt-1 space-y-2.5">
                <div className="h-2.5 bg-neutral-300 dark:bg-neutral-600 w-20" />
                <div className="ml-3 h-2 bg-neutral-200 dark:bg-neutral-700 w-3/4" />
                <div className="ml-3 h-2 bg-neutral-200 dark:bg-neutral-700 w-5/6" />
                <div className="ml-3 h-2 bg-neutral-200 dark:bg-neutral-700 w-2/3" />
              </div>
              {/* Skills / domains */}
              <div className="flex items-center gap-2">
                <div className="h-2.5 bg-neutral-300 dark:bg-neutral-600 w-12" />
                <div className="h-2.5 bg-neutral-200 dark:bg-neutral-700 flex-1" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2.5 bg-neutral-300 dark:bg-neutral-600 w-16" />
                <div className="h-2.5 bg-neutral-200 dark:bg-neutral-700 flex-1" />
              </div>
            </div>
          ) : agent ? (
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
          ) : null}
        </OutputBox>

        {/* Agent PFP Box */}
        <OutputBox
          title="agent_pfp"
          type="image"
          onClose={() => reset()}
        >
          <div className="w-full h-full flex items-center justify-center">
            {loading || imageLoading ? (
              <div className="animate-pulse flex items-center justify-center w-full h-full">
                <div className="w-3/4 aspect-square max-w-[280px] bg-neutral-200 dark:bg-neutral-700" />
              </div>
            ) : imageToShow ? (
              <img
                src={imageToShow}
                alt="Generated agent PFP"
                className="max-w-full max-h-full object-contain"
              />
            ) : null}
          </div>
        </OutputBox>
      </div>

      {/* Mint + Download Buttons */}
      {currentStep === 'complete' && agent && (
        <div className="space-y-3 mt-6">
          <MintButton />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <DownloadButton label="PNG" onClick={() => downloadAgent('png')} disabled={!imageToShow} />
            <DownloadButton label="SVG" onClick={() => downloadAgent('svg')} disabled={!imageToShow} />
            <DownloadButton label="ERC-8004" onClick={() => downloadAgent('erc8004')} />
            <DownloadButton label="OpenClaw" onClick={() => downloadAgent('openclaw')} />
            <DownloadButton label="JSON" onClick={() => downloadAgent('json')} />
          </div>
        </div>
      )}
    </div>
  );
}

function DownloadButton({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono text-sm dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}
