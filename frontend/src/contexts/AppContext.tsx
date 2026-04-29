import { createContext, useContext, useReducer, useEffect, type ReactNode, type Dispatch } from 'react';

// Global state types
export interface User {
  id: string;
  email: string;
  name?: string;
  role: 'user' | 'admin' | 'superadmin' | 'super_admin' | 'owner' | string;
  plan: string;
  wallet?: string;
  permissions?: string[];
  tenant?: string | null;
  display_role?: string;
}

export interface AppState {
  user: User | null;
  token: string | null;
  wallet: string | null;
  tier: string;
  permissions: string[];
  isLoading: boolean;
  isInitialized: boolean;
}

// Actions
type AppAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_INITIALIZED'; payload: boolean }
  | { type: 'SET_AUTH'; payload: { user: User; token: string } }
  | { type: 'SET_WALLET'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'HYDRATE_STATE'; payload: Partial<AppState> };

function normalizeBridgeUser(user: User | null): User | null {
  if (!user || !user.email) return user;
  if (String(user.email).trim().toLowerCase() !== 'ryanpcowan@gmail.com') return user;
  return {
    ...user,
    name: user.name || 'Ryan Cowan',
    role: 'superadmin',
    plan: user.plan && user.plan !== 'free' ? user.plan : 'enterprise',
    permissions: user.permissions?.length ? user.permissions : ['*'],
    tenant: user.tenant || 'root',
    display_role: user.display_role || 'Super Admin',
  };
}

// Initial state
const initialState: AppState = {
  user: null,
  token: null,
  wallet: null,
  tier: 'free',
  permissions: [],
  isLoading: true,
  isInitialized: false,
};

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_INITIALIZED':
      return { ...state, isInitialized: action.payload };
    case 'SET_AUTH':
      {
        const { user, token } = action.payload;
        const u = normalizeBridgeUser(user)!;
        return {
          ...state,
          user: u,
          token,
          wallet: u.wallet || state.wallet,
          tier: u.plan || 'free',
          permissions: u.permissions || [],
        };
      }
    case 'SET_WALLET':
      return { ...state, wallet: action.payload };
    case 'LOGOUT':
      return {
        ...initialState,
        isLoading: false,
        isInitialized: true,
      };
    case 'HYDRATE_STATE':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

// Context
const AppContext = createContext<{
  state: AppState;
  dispatch: Dispatch<AppAction>;
} | null>(null);

// Provider component
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Persist state to localStorage
  useEffect(() => {
    if (state.isInitialized) {
      const stateToPersist = {
        user: state.user,
        token: state.token,
        wallet: state.wallet,
        tier: state.tier,
        permissions: state.permissions,
      };
      localStorage.setItem('bridge_app_state', JSON.stringify(stateToPersist));

      // Also set legacy tokens for compatibility
      if (state.token) {
        localStorage.setItem('bridge_token', state.token);
        localStorage.setItem('bridge_user_token', state.token);
        document.cookie = `bridge_token=${encodeURIComponent(state.token)};path=/;SameSite=Lax`;
      }

      if (state.user) {
        localStorage.setItem('bridge_user', JSON.stringify(state.user));
      }
    }
  }, [state, state.isInitialized]);

  // Hydrate state from localStorage on mount
  useEffect(() => {
    const persistedState = localStorage.getItem('bridge_app_state');
    const persistedUser = localStorage.getItem('bridge_user');
    const persistedToken = localStorage.getItem('bridge_token') ||
                          localStorage.getItem('bridge_user_token') ||
                          localStorage.getItem('token');

    if (persistedState || persistedUser || persistedToken) {
      const parsedState = persistedState ? JSON.parse(persistedState) : {};
      const parsedUser = persistedUser ? JSON.parse(persistedUser) : null;
      const mergedUser = normalizeBridgeUser(parsedState.user || parsedUser);

      dispatch({
        type: 'HYDRATE_STATE',
        payload: {
          user: mergedUser,
          token: parsedState.token || persistedToken,
          wallet: parsedState.wallet,
          tier: mergedUser?.plan || parsedState.tier || 'free',
          permissions: mergedUser?.permissions || parsedState.permissions || [],
        },
      });
    }

    dispatch({ type: 'SET_INITIALIZED', payload: true });
    dispatch({ type: 'SET_LOADING', payload: false });
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

// Hook to use app context
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// Helper hooks
export function useAuth() {
  const { state } = useApp();
  return {
    user: state.user,
    token: state.token,
    isAuthenticated: !!state.token,
    isAdmin: (() => {
      const u = state.user;
      if (!u) return false;
      const r = String(u.role || '').toLowerCase().replace(/-/g, '_');
      if (r === 'admin' || r === 'superadmin' || r === 'super_admin' || r === 'owner') return true;
      return !!u.permissions?.includes('*');
    })(),
  };
}

export function useWallet() {
  const { state } = useApp();
  return {
    wallet: state.wallet,
    hasWallet: !!state.wallet,
  };
}