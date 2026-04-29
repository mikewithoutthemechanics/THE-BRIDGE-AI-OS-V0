/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AppProvider, useApp, useAuth, useWallet } from './contexts/AppContext';
import { useAuthProvider } from './contexts/AuthProvider';
import { useWalletProvider } from './contexts/WalletProvider';
import { useRouter, RouteConfig } from './contexts/RouterProvider';

// Import all page components
import Marketplace from './pages/Marketplace';
import AdminControl from './pages/AdminControl';
import AIEngine from './pages/AIEngine';
import Workflows from './pages/Workflows';
import TaskLoop from './pages/TaskLoop';
import Documentation from './pages/Documentation';
import MasterAdmin from './pages/MasterAdmin';
import OrchestrationHub from './pages/OrchestrationHub';
import HumanAPI from './pages/HumanAPI';
import MultiagentOrchestration from './pages/MultiagentOrchestration';

function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-10">
      <h1 className="text-3xl font-bold text-cyan-400 mb-4">Pricing</h1>
      <p className="text-slate-300 max-w-xl mb-8">Enterprise and platform tiers. No forced redirect — choose a plan or continue to the app.</p>
      <div className="flex gap-4">
        <button type="button" className="px-6 py-3 rounded-lg bg-cyan-600" onClick={() => { window.location.href = '/join'; }}>Get started</button>
        <button type="button" className="px-6 py-3 rounded-lg border border-slate-600" onClick={() => { window.location.assign('/app'); }}>Open app</button>
      </div>
    </div>
  );
}

function OnboardingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-10">
      <h1 className="text-3xl font-bold text-cyan-400 mb-4">Onboarding</h1>
      <p className="text-slate-300 max-w-xl mb-8">Continue setup in the guided flow (HTML) or sign in below.</p>
      <div className="flex gap-4 flex-wrap">
        <button type="button" className="px-6 py-3 rounded-lg bg-cyan-600" onClick={() => { window.location.href = '/onboarding.html'; }}>Full onboarding</button>
        <button type="button" className="px-6 py-3 rounded-lg border border-slate-600" onClick={() => { window.location.assign('/join'); }}>Sign in</button>
      </div>
    </div>
  );
}

function WalletsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-10">
      <h1 className="text-3xl font-bold text-cyan-400 mb-4">Wallets &amp; rails</h1>
      <p className="text-slate-300 max-w-xl mb-6">Treasury actions use the same session as the gateway. Open wallet UI for transfers and withdrawals.</p>
      <div className="flex flex-col gap-3 max-w-md">
        <button type="button" className="px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-left hover:border-cyan-500" onClick={() => { window.location.href = '/wallet.html'; }}>Bridge wallet (multi-chain)</button>
        <button type="button" className="px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-left hover:border-cyan-500" onClick={() => { window.location.href = '/treasury-dashboard.html'; }}>Treasury dashboard</button>
        <button type="button" className="px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-left hover:border-cyan-500" onClick={() => { window.location.href = '/payment.html'; }}>Stripe / Paystack checkout</button>
      </div>
    </div>
  );
}

// Route configuration - defines all routes and their access requirements
const routes: RouteConfig[] = [
  // Public routes
  { path: '/', component: Marketplace, title: 'Bridge AI OS' },
  { path: '/landing', component: Marketplace, title: 'Bridge AI OS' },
  { path: '/docs', component: Documentation, title: 'Documentation' },
  { path: '/pricing', component: PricingPage, title: 'Pricing' },
  { path: '/onboarding', component: OnboardingPage, title: 'Onboarding' },

  // Auth routes (redirect authenticated users)
  { path: '/join', component: AuthHub, title: 'Join Bridge AI' },
  { path: '/auth-callback', component: AuthCallback, title: 'Completing Authentication' },

  // Protected routes (require authentication)
  { path: '/app', component: AppDashboard, requiresAuth: true, title: 'Dashboard' },
  { path: '/engine', component: AIEngine, requiresAuth: true, title: 'AI Engine' },
  { path: '/workflows', component: Workflows, requiresAuth: true, title: 'Workflows' },
  { path: '/loop', component: TaskLoop, requiresAuth: true, title: 'Task Loop' },
  { path: '/orchestration', component: OrchestrationHub, requiresAuth: true, title: 'Orchestration Hub' },
  { path: '/human', component: HumanAPI, requiresAuth: true, title: 'Human API' },
  { path: '/multiagent', component: MultiagentOrchestration, requiresAuth: true, title: 'Multiagent Orchestration' },
  { path: '/wallets', component: WalletsPage, requiresAuth: true, title: 'Wallets' },

  // Admin routes (require admin role)
  { path: '/admin', component: AdminControl, requiresAuth: true, requiresAdmin: true, title: 'Admin Control' },
  { path: '/master', component: MasterAdmin, requiresAuth: true, requiresAdmin: true, title: 'Master Admin' },
];

function PageWrapper({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -15, filter: 'blur(4px)' }}
      transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

// Loading screen component
function LoadingScreen({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
        <p className="text-cyan-400 text-lg">{message}</p>
      </div>
    </div>
  );
}

// Auth Hub component (login/register)
function AuthHub() {
  const { loginWithPassword, startOAuth } = useAuthProvider();
  const { connect } = useWalletProvider();
  const { navigate } = useRouter(routes);
  const { state } = useApp();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await loginWithPassword(email, password, mode);
      navigate('/app');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleOAuth = async (provider: 'google' | 'github') => {
    try {
      await startOAuth(provider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleWallet = async () => {
    try {
      await connect();
      navigate('/app');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-8 border border-slate-700/50">
          <h1 className="text-2xl font-bold text-center text-white mb-8">
            {mode === 'login' ? 'Welcome Back' : 'Join Bridge AI'}
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                required
              />
            </div>
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                required
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm text-center">{error}</div>
            )}

            <button
              type="submit"
              disabled={state.isLoading}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg font-semibold hover:from-cyan-600 hover:to-blue-600 transition-all disabled:opacity-50"
            >
              {state.isLoading ? 'Signing In...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-cyan-400 hover:text-cyan-300 text-sm"
            >
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>

          <div className="mt-8 space-y-3">
            <button
              onClick={() => handleOAuth('google')}
              disabled={state.isLoading}
              className="w-full py-3 bg-white text-gray-900 rounded-lg font-semibold hover:bg-gray-100 transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              <span>Continue with Google</span>
            </button>
            <button
              onClick={handleWallet}
              disabled={state.isLoading}
              className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50"
            >
              {state.isLoading ? 'Connecting...' : 'Connect Wallet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Auth callback handler
function AuthCallback() {
  const { finishOAuthCallback } = useAuthProvider();
  const { navigate } = useRouter(routes);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      finishOAuthCallback(code)
        .then(() => {
          navigate('/app');
        })
        .catch((error) => {
          console.error('OAuth callback failed:', error);
          navigate('/join');
        });
    } else {
      navigate('/join');
    }
  }, []);

  return <LoadingScreen message="Completing authentication..." />;
}

// App Dashboard (protected)
function AppDashboard() {
  const { user, token } = useAuth();
  const { wallet } = useWallet();
  const { state: { tier } } = useApp();
  const { logout } = useAuthProvider();
  const { navigate } = useRouter(routes);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Global Navigation Header */}
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-cyan-400">Bridge AI OS</h1>
            <span className="text-sm text-slate-400">v4.2</span>
          </div>

          <div className="flex items-center space-x-4">
            {user && (
              <div className="text-sm text-slate-300">
                <div className="font-semibold">{user.name || user.email}</div>
                <div className="text-xs text-slate-400">{user.email}</div>
                <div className="text-xs text-slate-400">
                  Plan: {user.plan || tier}
                  {(user.display_role || user.role) ? ` · ${user.display_role || user.role}` : ''}
                </div>
                {wallet && (
                  <div className="text-xs text-purple-400">
                    Wallet: {wallet.slice(0, 6)}...{wallet.slice(-4)}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={logout}
              className="px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700/50">
            <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <button
                onClick={() => navigate('/engine')}
                className="w-full py-2 bg-cyan-600/20 text-cyan-400 rounded-lg hover:bg-cyan-600/30 transition-colors"
              >
                AI Engine
              </button>
              <button
                onClick={() => navigate('/workflows')}
                className="w-full py-2 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 transition-colors"
              >
                Workflows
              </button>
              <button
                onClick={() => navigate('/loop')}
                className="w-full py-2 bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600/30 transition-colors"
              >
                Task Loop
              </button>
            </div>
          </div>

          {/* System Status */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700/50">
            <h3 className="text-lg font-semibold text-white mb-4">System Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Authentication:</span>
                <span className="text-green-400">✓ Active</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Wallet:</span>
                <span className={wallet ? "text-green-400" : "text-yellow-400"}>
                  {wallet ? '✓ Connected' : '○ Not Connected'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tier:</span>
                <span className="text-cyan-400">{tier}</span>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700/50">
            <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
            <div className="text-sm text-slate-400">
              <p>No recent activity</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Main App Shell component
function AppShell() {
  const { state } = useApp();
  const { validateSession } = useAuthProvider();
  const { currentRoute, navigate, isAllowed, redirectTo } = useRouter(routes);

  // Initialize authentication on app start
  useEffect(() => {
    if (state.isInitialized && state.token && !state.user) {
      validateSession();
    }
  }, [state.isInitialized, state.token, state.user]);

  // Handle route guards
  useEffect(() => {
    if (!isAllowed && redirectTo) {
      navigate(redirectTo);
    }
  }, [isAllowed, redirectTo, navigate]);

  // Show loading screen until initialized
  if (!state.isInitialized || state.isLoading) {
    return <LoadingScreen message="Initializing Bridge AI OS..." />;
  }

  // Show access denied for guarded routes
  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-4">Access Denied</h1>
          <p className="text-slate-400 mb-8">You don't have permission to access this page.</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // Render current route
  if (currentRoute) {
    const RouteComponent = currentRoute.component;
    return (
      <AnimatePresence mode="wait">
        <PageWrapper>
          <motion.div key={currentRoute.path}>
            <RouteComponent />
          </motion.div>
        </PageWrapper>
      </AnimatePresence>
    );
  }

  // Fallback
  return <LoadingScreen message="Loading page..." />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </BrowserRouter>
  );
}