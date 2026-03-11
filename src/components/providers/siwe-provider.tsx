'use client';

import { createContext, useContext, type ReactNode, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  createAuthenticationAdapter,
  RainbowKitAuthenticationProvider,
  type AuthenticationStatus,
} from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { createSiweMessage } from 'viem/siwe';

const SiweStatusContext = createContext<AuthenticationStatus>('unauthenticated');
export function useSiweStatus() { return useContext(SiweStatusContext); }

export function SiweProvider({ children }: { children: ReactNode }) {
  const fetchingStatusRef = useRef(false);
  const verifyingRef = useRef(false);
  const [status, setStatus] = useState<AuthenticationStatus>('loading');
  const prevAddressRef = useRef<string | undefined>(undefined);
  const { address, isConnected } = useAccount();

  // Sign out the old session so RainbowKit auto-prompts SIWE for new wallet
  const signOutSession = useCallback(async () => {
    setStatus('unauthenticated');
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* noop */ }
  }, []);

  // Detect wallet address changes and invalidate session
  useEffect(() => {
    // Skip initial mount — let the session check handle it
    if (prevAddressRef.current === undefined) {
      prevAddressRef.current = address;
      return;
    }

    // Address actually changed (switched wallet or disconnected)
    if (address !== prevAddressRef.current) {
      prevAddressRef.current = address;

      if (!address || !isConnected) {
        // Wallet disconnected
        signOutSession();
      } else {
        // Wallet switched — sign out old session so SIWE re-prompts
        signOutSession();
      }
    }
  }, [address, isConnected, signOutSession]);

  // Check session on page load + window focus (official RainbowKit pattern)
  useEffect(() => {
    const fetchStatus = async () => {
      if (fetchingStatusRef.current || verifyingRef.current) {
        return;
      }

      fetchingStatusRef.current = true;

      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        setStatus(data.address ? 'authenticated' : 'unauthenticated');
      } catch {
        setStatus('unauthenticated');
      } finally {
        fetchingStatusRef.current = false;
      }
    };

    // 1. page loads
    fetchStatus();

    // 2. window is focused (in case user logs out of another window)
    window.addEventListener('focus', fetchStatus);
    return () => window.removeEventListener('focus', fetchStatus);
  }, []);

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
          verifyingRef.current = true;

          try {
            const res = await fetch('/api/auth/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message, signature }),
            });

            const authenticated = Boolean(res.ok);

            if (authenticated) {
              setStatus('authenticated');
            }

            return authenticated;
          } catch (error) {
            console.error('Error verifying SIWE signature', error);
            return false;
          } finally {
            verifyingRef.current = false;
          }
        },

        signOut: async () => {
          setStatus('unauthenticated');
          await fetch('/api/auth/logout', { method: 'POST' });
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
