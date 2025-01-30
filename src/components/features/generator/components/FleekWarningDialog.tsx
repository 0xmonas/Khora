interface FleekWarningDialogProps {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }
  
  export function FleekWarningDialog({ open, onConfirm, onCancel }: FleekWarningDialogProps) {
    if (!open) return null;
  
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50">
        <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
        <div className="relative w-full max-w-md p-6 bg-white dark:bg-neutral-900 border-2 border-neutral-700 dark:border-neutral-200">
          <h3 className="font-mono text-lg mb-4 dark:text-white">Deploy on Fleek.xyz</h3>
          <div className="font-mono text-sm mb-6 space-y-4 dark:text-white">
            <p>
              Your Eliza agent is ready to be deployed on Fleek.xyz! Here's how to get started:
            </p>
            <ul className="list-disc pl-4 space-y-2">
              <li>Create an account on Fleek.xyz</li>
              <li>Use the generated JSON to deploy your agent</li>
              <li>Configure your agent's settings and permissions</li>
            </ul>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Note: Visit <a href="https://fleek.xyz/guides/eliza-guide/#upload-a-characterfile" target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-900 dark:hover:text-neutral-200">Fleek documentation</a> to learn how to deploy your agent.
            </p>
          </div>
          <div className="flex justify-end gap-4">
            <button
              onClick={onCancel}
              className="p-3 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-sm hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="p-3 border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 font-mono text-sm"
            >
              Continue to Fleek
            </button>
          </div>
        </div>
      </div>
    );
  }