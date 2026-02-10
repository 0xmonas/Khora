'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  createAuthenticationAdapter,
  RainbowKitAuthenticationProvider,
  type AuthenticationStatus,
} from '@rainbow-me/rainbowkit';
import { createSiweMessage } from 'viem/siwe';
import { useAccount } from 'wagmi';

export function SiweProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthenticationStatus>('loading');
  const { isConnected } = useAccount();

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      setStatus(data.address ? 'authenticated' : 'unauthenticated');
    } catch {
      setStatus('unauthenticated');
    }
  }, []);

  // Check session on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Auto-logout when wallet disconnects
  useEffect(() => {
    if (!isConnected && status === 'authenticated') {
      fetch('/api/auth/logout', { method: 'POST' }).then(() => {
        setStatus('unauthenticated');
      });
    }
  }, [isConnected, status]);

  const adapter = useMemo(
    () =>
      createAuthenticationAdapter({
        getNonce: async () => {
          const res = await fetch('/api/auth/nonce');
          const data = await res.json();
          return data.nonce;
        },

        createMessage: ({ nonce, address, chainId }) => {
          return createSiweMessage({
            address: address as `0x${string}`,
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
    <RainbowKitAuthenticationProvider adapter={adapter} status={status}>
      {children}
    </RainbowKitAuthenticationProvider>
  );
}
