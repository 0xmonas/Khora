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
          <h3 className="font-mono text-lg mb-4 dark:text-white">Warning</h3>
          <p className="font-mono text-sm mb-6 dark:text-white">
            The Fleek has different authentication requirements and workflows. Are you sure you want to continue?
          </p>
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
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }