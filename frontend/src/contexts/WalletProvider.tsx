import { useApp } from './AppContext';

export class WalletService {
  private timeoutMs = 15000; // 15 seconds

  async connect(): Promise<string> {
    if (!window.ethereum || !window.ethereum.request) {
      throw new Error('No EIP-1193 wallet provider detected. Please install MetaMask or another Web3 wallet.');
    }

    try {
      // Request accounts with timeout
      const accountsPromise = window.ethereum.request({ method: 'eth_requestAccounts' });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Wallet connection timed out. Please try again.')), this.timeoutMs)
      );

      const accounts = await Promise.race([accountsPromise, timeoutPromise]);
      const address = accounts?.[0];

      if (!address) {
        throw new Error('Wallet address unavailable. Please ensure your wallet is unlocked.');
      }

      return address;
    } catch (error) {
      if (error.code === 4001) {
        throw new Error('Wallet connection rejected by user.');
      }
      if (error.code === -32002) {
        throw new Error('Wallet connection request already pending. Check your wallet.');
      }
      throw error;
    }
  }

  async signMessage(address: string, message: string): Promise<string> {
    if (!window.ethereum?.request) {
      throw new Error('Wallet not available for signing.');
    }

    try {
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, address],
      });

      return signature;
    } catch (error) {
      if (error.code === 4001) {
        throw new Error('Message signing rejected by user.');
      }
      throw new Error('Failed to sign message. Please try again.');
    }
  }

  async activateWallet(address: string): Promise<{ token: string; user: any }> {
    const message = `Bridge AI OS Wallet Login\n${address}\n${Date.now()}`;
    const signature = await this.signMessage(address, message);

    const response = await fetch('/api/auth/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        signature,
        message,
        avatarType: 'wallet-user'
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok || !data.token) {
      throw new Error(data.error || 'Wallet activation failed');
    }

    return {
      token: data.token,
      user: data.user || {},
    };
  }
}

// Wallet provider hook
export function useWalletProvider() {
  const { state, dispatch } = useApp();
  const walletService = new WalletService();

  const connect = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const address = await walletService.connect();
      const result = await walletService.activateWallet(address);

      dispatch({ type: 'SET_WALLET', payload: address });
      dispatch({ type: 'SET_AUTH', payload: {
        user: { ...result.user, wallet: address },
        token: result.token
      } });

      return address;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const disconnect = () => {
    dispatch({ type: 'SET_WALLET', payload: null });
  };

  return {
    connect,
    disconnect,
    isConnecting: state.isLoading,
    address: state.wallet,
    isConnected: !!state.wallet,
  };
}

// Type declarations for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on?: (event: string, handler: (...args: any[]) => void) => void;
      removeListener?: (event: string, handler: (...args: any[]) => void) => void;
    };
  }
}