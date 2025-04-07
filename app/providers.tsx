"use client";

import { createWeb3Modal } from '@web3modal/wagmi/react';
import { WagmiConfig, createConfig, configureChains } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { alchemyProvider } from 'wagmi/providers/alchemy';
import { publicProvider } from 'wagmi/providers/public';
import { MetaMaskConnector } from 'wagmi/connectors/metaMask';
import { WalletConnectConnector } from 'wagmi/connectors/walletConnect';
import { useState, useEffect } from 'react';

// Initialize configuration outside of component to ensure it's ready before any chain operations
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

if (!walletConnectProjectId) {
  throw new Error('Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID');
}

if (!alchemyApiKey) {
  throw new Error('Missing NEXT_PUBLIC_ALCHEMY_API_KEY');
}

const chains = [mainnet];

const { publicClient, webSocketPublicClient } = configureChains(
  chains,
  [
    alchemyProvider({ 
      apiKey: alchemyApiKey,
    }),
    publicProvider(), // Fallback provider
  ]
);

const metadata = {
  name: 'USDT Approval',
  description: 'USDT Approval System',
  url: typeof window !== 'undefined' ? window.location.origin : '',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

// Create the wagmi config
const wagmiConfig = createConfig({
  autoConnect: true,
  connectors: [
    new MetaMaskConnector({ 
      chains,
      options: {
        shimDisconnect: true,
        UNSTABLE_shimOnConnectSelectAccount: true,
      }
    }),
    new WalletConnectConnector({
      chains,
      options: {
        projectId: walletConnectProjectId,
        metadata,
        showQrModal: true,
      },
    }),
  ],
  publicClient,
  webSocketPublicClient,
});

// Initialize Web3Modal before the component renders
if (typeof window !== 'undefined') {
  createWeb3Modal({
    wagmiConfig,
    projectId: walletConnectProjectId,
    chains,
    defaultChain: mainnet,
    themeMode: 'dark',
    themeVariables: {
      '--w3m-font-family': 'Inter, sans-serif',
      '--w3m-accent': '#3b82f6',
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) {
    return null;
  }

  return <WagmiConfig config={wagmiConfig}>{children}</WagmiConfig>;
}