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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ConnectButton, setConnectButton] = useState<any>(null);

  useEffect(() => {
    import('@rainbow-me/rainbowkit').then((mod) => {
      setConnectButton(() => mod.ConnectButton);
    });
  }, []);

  if (!ConnectButton) {
    return (
      <button className="h-12 px-8 rounded-md bg-neutral-900 dark:bg-neutral-100 font-mono text-sm text-white dark:text-black hover:opacity-90 transition-opacity">
        Connect
      </button>
    );
  }

  return (
    <ConnectButton.Custom>
      {({ openConnectModal, mounted }: { openConnectModal: () => void; mounted: boolean }) => (
        <button
          onClick={openConnectModal}
          disabled={!mounted}
          className="h-12 px-8 rounded-md bg-neutral-900 dark:bg-neutral-100 font-mono text-sm text-white dark:text-black hover:opacity-90 transition-opacity"
        >
          Connect Wallet
        </button>
      )}
    </ConnectButton.Custom>
  );
}
