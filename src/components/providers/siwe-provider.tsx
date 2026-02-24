'use client';

import { createContext, useContext, type ReactNode, useEffect, useMemo, useState, useRef } from 'react';
import {
  createAuthenticationAdapter,
  RainbowKitAuthenticationProvider,
  type AuthenticationStatus,
} from '@rainbow-me/rainbowkit';
import { createSiweMessage } from 'viem/siwe';
import { useAccount } from 'wagmi';

const SiweStatusContext = createContext<AuthenticationStatus>('unauthenticated');
export function useSiweStatus() { return useContext(SiweStatusContext); }

export function SiweProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthenticationStatus>('loading');
  const { isConnected, address } = useAccount();
  const prevConnected = useRef(isConnected);

  // Check session when wallet connects or address changes
  useEffect(() => {
    if (!isConnected) {
      // Wallet not connected — if we were previously authenticated, logout server session
      if (prevConnected.current) {
        fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      }
      setStatus('unauthenticated');
      prevConnected.current = false;
      return;
    }

    prevConnected.current = true;

    // Wallet connected — verify SIWE session matches current address
    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (cancelled) return;

        if (data.address && address && data.address.toLowerCase() === address.toLowerCase()) {
          // Session matches connected wallet
          setStatus('authenticated');
        } else if (data.address) {
          // Session exists but for a different address — clear it
          await fetch('/api/auth/logout', { method: 'POST' });
          if (!cancelled) setStatus('unauthenticated');
        } else {
          setStatus('unauthenticated');
        }
      } catch {
        if (!cancelled) setStatus('unauthenticated');
      }
    })();

    return () => { cancelled = true; };
  }, [isConnected, address]);

  const adapter = useMemo(
    () =>
      createAuthenticationAdapter({
        getNonce: async () => {
          const res = await fetch('/api/auth/nonce');
          const data = await res.json();
          return data.nonce;
        },

        createMessage: ({ nonce, address: addr, chainId }) => {
          return createSiweMessage({
            address: addr as `0x${string}`,
            chainId,
            domain: window.location.host,
            nonce,
            uri: window.location.origin,
            version: '1',
            statement: 'Sign in to Khora Agent.',
          });
        },

        verify: async ({ message, signature }) => {
          const res = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, signature }),
          });
          await res.json();

          if (res.ok) {
            setStatus('authenticated');
            return true;
          }

          return false;
        },

        signOut: async () => {
          await fetch('/api/auth/logout', { method: 'POST' });
          setStatus('unauthenticated');
        },
      }),
    [],
  );

  return (
    <SiweStatusContext.Provider value={status}>
      <RainbowKitAuthenticationProvider adapter={adapter} status={status}>
        {children}
      </RainbowKitAuthenticationProvider>
    </SiweStatusContext.Provider>
  );
}
