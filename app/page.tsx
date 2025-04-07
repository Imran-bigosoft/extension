import { WalletConnectButton } from '@/components/WalletConnectButton';

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-r from-gray-900 to-gray-800">
      <div className="bg-white/10 p-8 rounded-xl backdrop-blur-lg text-center space-y-4 w-full max-w-md mx-4">
        <h1 className="text-3xl font-bold text-white">Web3 Wallet Connect</h1>
        <p className="text-gray-300">Connect your wallet and approve USDT</p>
        <WalletConnectButton />
      </div>
    </main>
  );
}