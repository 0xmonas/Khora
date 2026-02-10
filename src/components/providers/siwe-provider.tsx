'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  createAuthenticationAdapter,
  RainbowKitAuthenticationProvider,
  type AuthenticationStatus,
} from '@rainbow-me/rainbowkit';
import { createSiweMessage } from 'viem/siwe';
import { useAccount } from 'wagmi';

export function SiweProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthenticationStatus>('unauthenticated');
  const { isConnected } = useAccount();

  // Check session when wallet is connected
  useEffect(() => {
    if (!isConnected) {
      // No wallet = no auth, skip server call
      setStatus('unauthenticated');
      return;
    }

    // Wallet connected — check if we have an active SIWE session
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (!cancelled) {
          setStatus(data.address ? 'authenticated' : 'unauthenticated');
        }
      } catch {
        if (!cancelled) setStatus('unauthenticated');
      }
    })();

    return () => { cancelled = true; };
  }, [isConnected]);

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
          console.log('[SIWE] getNonce called');
          const res = await fetch('/api/auth/nonce');
          const data = await res.json();
          console.log('[SIWE] nonce received:', data.nonce?.slice(0, 8) + '...');
          return data.nonce;
        },

        createMessage: ({ nonce, address, chainId }) => {
          console.log('[SIWE] createMessage', { address: address?.slice(0, 10), chainId, nonce: nonce?.slice(0, 8) });
          const msg = createSiweMessage({
            address: address as `0x${string}`,
            chainId,
            domain: window.location.host,
            nonce,
            uri: window.location.origin,
            version: '1',
            statement: 'Sign in to Khora Agent.',
          });
          console.log('[SIWE] message created, length:', msg.length);
          return msg;
        },

        verify: async ({ message, signature }) => {
          console.log('[SIWE] verify called, sig:', (signature as string)?.slice(0, 10) + '...');
          const res = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, signature }),
          });
          const data = await res.json();
          console.log('[SIWE] verify response:', res.status, data);

          if (res.ok) {
            setStatus('authenticated');
            return true;
          }

          return false;
        },

        signOut: async () => {
          console.log('[SIWE] signOut called');
          await fetch('/api/auth/logout', { method: 'POST' });
          setStatus('unauthenticated');
        },
      }),
    [],
  );

  useEffect(() => {
    console.log('[SIWE] status:', status, '| isConnected:', isConnected);
  }, [status, isConnected]);

  return (
    <RainbowKitAuthenticationProvider adapter={adapter} status={status}>
      {children}
    </RainbowKitAuthenticationProvider>
  );
}
