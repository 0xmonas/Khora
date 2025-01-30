'use client';

import { PrivyProvider } from '@privy-io/react-auth';

export default function Privy({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId="cm6jmuwi5003zfqg5ky1em5ub"
      config={{
        appearance: {
          accentColor: '#6A6FF5',
          theme: '#222224',
          showWalletLoginFirst: false,
          logo: 'https://auth.privy.io/logos/privy-logo-dark.png',
          walletChainType: 'ethereum-only',
          walletList: ['detected_ethereum_wallets'],
        },
        loginMethods: ['email'],
        fundingMethodConfig: {
          moonpay: {
            useSandbox: true,
          },
        },
        embeddedWallets: {
          createOnLogin: 'off',
          requireUserPasswordOnCreate: false,
          showWalletUIs: false,
        },
        mfa: {
          noPromptOnMfaRequired: false,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}