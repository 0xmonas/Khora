'use client';

import { useState, useEffect } from 'react';

export function ConnectPrompt() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <p className="font-mono text-sm text-neutral-500 dark:text-neutral-400">
        Connect your wallet to start generating agents
      </p>
      <WalletConnectButton />
    </div>
  );
}

function WalletConnectButton() {
  const [ConnectButton, setConnectButton] = useState<any>(null);

  useEffect(() => {
    import('@rainbow-me/rainbowkit').then((mod) => {
      setConnectButton(() => mod.ConnectButton);
    });
  }, []);

  if (!ConnectButton) {
    return (
      <button className="h-12 px-8 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono text-sm dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors">
        Connect
      </button>
    );
  }

  return (
    <ConnectButton.Custom>
      {({ openConnectModal, mounted }: any) => (
        <button
          onClick={openConnectModal}
          disabled={!mounted}
          className="h-12 px-8 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono text-sm dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors"
        >
          Connect Wallet
        </button>
      )}
    </ConnectButton.Custom>
  );
}
