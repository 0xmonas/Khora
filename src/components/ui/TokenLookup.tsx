'use client';

import { useState } from 'react';
import { HIDE_TESTNETS } from '@/utils/constants/chains';

const font = { fontFamily: 'var(--font-departure-mono)' };

interface TokenLookupProps {
  onSubmit: (tokenId: string, chain: 'shape' | 'shape-sepolia') => void;
  loading?: boolean;
  error?: string;
  buttonLabel?: string;
  loadingLabel?: string;
}

export function TokenLookup({
  onSubmit,
  loading = false,
  error = '',
  buttonLabel = 'LOAD AGENT',
  loadingLabel = 'LOADING...',
}: TokenLookupProps) {
  const [tokenId, setTokenId] = useState('');
  const [network, setNetwork] = useState<'mainnet' | 'testnet'>(HIDE_TESTNETS ? 'mainnet' : 'testnet');

  const chain = network === 'mainnet' ? 'shape' : 'shape-sepolia';

  const handleSubmit = () => {
    if (!tokenId) return;
    onSubmit(tokenId, chain);
  };

  return (
    <div className="w-full max-w-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background shadow-sm p-5 space-y-5">
      {/* Network toggle — hidden in production */}
      {!HIDE_TESTNETS && (
        <div>
          <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block" style={font}>
            Network
          </label>
          <div className="flex">
            <button
              type="button"
              onClick={() => setNetwork('mainnet')}
              className={`flex-1 py-2 rounded-l-md border border-neutral-200 dark:border-neutral-800 text-xs transition-colors ${
                network === 'mainnet'
                  ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black'
                  : 'bg-white dark:bg-neutral-900 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
              style={font}
            >
              Shape
            </button>
            <button
              type="button"
              onClick={() => setNetwork('testnet')}
              className={`flex-1 py-2 rounded-r-md border border-l-0 border-neutral-200 dark:border-neutral-800 text-xs transition-colors ${
                network === 'testnet'
                  ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black'
                  : 'bg-white dark:bg-neutral-900 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
              style={font}
            >
              Shape Sepolia
            </button>
          </div>
        </div>
      )}

      {/* Token ID */}
      <div>
        <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block" style={font}>
          Token ID
        </label>
        <input
          type="number"
          min="0"
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="0"
          className="w-full p-2.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-foreground outline-none focus:border-neutral-400 dark:focus:border-neutral-600 placeholder:text-neutral-400 dark:placeholder:text-neutral-600"
          style={font}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-[10px] text-red-500" style={font}>{error}</p>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!tokenId || loading}
        className="w-full h-11 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black text-xs uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
        style={font}
      >
        {loading ? loadingLabel : buttonLabel}
      </button>
    </div>
  );
}
