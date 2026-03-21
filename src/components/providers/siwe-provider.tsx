'use client';

import { createContext, useContext, type ReactNode, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  createAuthenticationAdapter,
  RainbowKitAuthenticationProvider,
  type AuthenticationStatus,
} from '@rainbow-me/rainbowkit';
import { useAccount, useChainId } from 'wagmi';
import { createSiweMessage } from 'viem/siwe';

const SiweStatusContext = createContext<AuthenticationStatus>('unauthenticated');
export function useSiweStatus() { return useContext(SiweStatusContext); }

export function SiweProvider({ children }: { children: ReactNode }) {
  const fetchingStatusRef = useRef(false);
  const verifyingRef = useRef(false);
  const [status, setStatus] = useState<AuthenticationStatus>('loading');
  const prevAddressRef = useRef<string | undefined>(undefined);
  const prevChainIdRef = useRef<number | undefined>(undefined);
  const { address, isConnected } = useAccount();
  const walletChainId = useChainId();

  // Debounced sign-out: multiple triggers (address change + chain change)
  // collapse into a single logout call to prevent nonce race conditions
  const signOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signOutSession = useCallback(() => {
    setStatus('unauthenticated');
    // Debounce: if multiple triggers fire within 200ms, only one logout executes
    if (signOutTimerRef.current) clearTimeout(signOutTimerRef.current);
    signOutTimerRef.current = setTimeout(async () => {
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* noop */ }
      signOutTimerRef.current = null;
    }, 200);
  }, []);

  // Detect wallet address OR chain changes and invalidate session
  useEffect(() => {
    // Skip initial mount — let the session check handle it
    if (prevAddressRef.current === undefined) {
      prevAddressRef.current = address;
      prevChainIdRef.current = walletChainId;
      return;
    }

    const addressChanged = address !== prevAddressRef.current;
    const chainChanged = walletChainId !== prevChainIdRef.current;

    if (addressChanged) prevAddressRef.current = address;
    if (chainChanged) prevChainIdRef.current = walletChainId;

    if (addressChanged || chainChanged) {
      signOutSession();
    }
  }, [address, isConnected, walletChainId, signOutSession]);

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
