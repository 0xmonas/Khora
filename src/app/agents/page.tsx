'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

export default function AgentsPage() {
  const router = useRouter();
  const [tokenId, setTokenId] = useState('');
  const [network, setNetwork] = useState<'mainnet' | 'testnet'>('testnet');
  const [error, setError] = useState('');

  const chain = network === 'mainnet' ? 'shape' : 'shape-sepolia';

  const handleSearch = () => {
    const id = Number(tokenId);
    if (!Number.isInteger(id) || id < 0) {
      setError('Enter a valid Token ID');
      return;
    }
    setError('');
    router.push(`/agent/${chain}/${id}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          {/* Title */}
          <div className="text-center space-y-2">
            <h1 className="font-mono text-lg font-bold text-neutral-900 dark:text-white">
              BOOA Agent Cards
            </h1>
            <p className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
              View any BOOA agent card by token ID
            </p>
          </div>

          {/* Search form */}
          <div className="border-2 border-neutral-700 dark:border-neutral-300 p-4 space-y-4">
            {/* Network toggle */}
            <div>
              <label className="font-mono text-[9px] uppercase tracking-wider text-neutral-400 mb-1.5 block">
                Network
              </label>
              <div className="flex">
                <button
                  type="button"
                  onClick={() => setNetwork('mainnet')}
                  className={`flex-1 py-2 border-2 border-neutral-700 dark:border-neutral-200 font-mono text-xs transition-colors ${
                    network === 'mainnet'
                      ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900'
                      : 'bg-white dark:bg-neutral-900 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  Shape
                </button>
                <button
                  type="button"
                  onClick={() => setNetwork('testnet')}
                  className={`flex-1 py-2 border-2 border-l-0 border-neutral-700 dark:border-neutral-200 font-mono text-xs transition-colors ${
                    network === 'testnet'
                      ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900'
                      : 'bg-white dark:bg-neutral-900 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  Shape Sepolia
                </button>
              </div>
            </div>

            {/* Token ID input */}
            <div>
              <label className="font-mono text-[9px] uppercase tracking-wider text-neutral-400 mb-1.5 block">
                Token ID
              </label>
              <input
                type="number"
                min="0"
                value={tokenId}
                onChange={(e) => { setTokenId(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="0"
                className="w-full p-2.5 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="font-mono text-[10px] text-red-500">{error}</p>
            )}

            {/* Search button */}
            <button
              onClick={handleSearch}
              disabled={!tokenId}
              className="w-full h-11 border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 font-mono text-xs hover:bg-neutral-600 dark:hover:bg-neutral-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              VIEW AGENT CARD
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
