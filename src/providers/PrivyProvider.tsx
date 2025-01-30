'use client';

import { PrivyProvider } from '@privy-io/react-auth';

export default function Privy({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId="cm6jmdzof00hfz210mto8o31u"
      config={{
        appearance: {
          accentColor: '#3300ff',
          theme: '#222224',
          showWalletLoginFirst: false,
          logo: 'https://pbs.twimg.com/profile_images/1883185244074921984/TwMIQacv_400x400.jpg',
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