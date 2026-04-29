import { useApp } from './AppContext';
import { User } from './AppContext';

export class AuthService {
  private baseUrl = '';

  constructor() {
    // Use relative URLs for API calls
    this.baseUrl = '';
  }

  async loginWithPassword(email: string, password: string, mode: 'login' | 'register' = 'login') {
    const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
    const payload = mode === 'register'
      ? { email, password, name: email.split('@')[0] }
      : { email, password };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.token) {
      throw new Error(data.error || 'Authentication failed');
    }

    return {
      token: data.token,
      user: data.user || {
        id: data.id || '',
        email,
        role: data.role || 'user',
        plan: data.plan || 'free',
        permissions: data.permissions || [],
      },
    };
  }

  async finishOAuthCallback(code: string) {
    const response = await fetch('/auth/exchange-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok || !data.token) {
      throw new Error(data.error || 'OAuth exchange failed');
    }

    return {
      token: data.token,
      user: data.user || {},
    };
  }

  async validateSession(token: string): Promise<User | null> {
    try {
      const response = await fetch('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.ok && data.user) {
          const u = data.user;
          return {
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            plan: u.plan,
            permissions: u.permissions,
            tenant: u.tenant,
            display_role: u.display_role,
          };
        }
      }

      // Fallback to JWT parsing
      const payload = this.parseJwtPayload(token);
      if (payload) {
        return {
          id: payload.sub || '',
          email: payload.email || '',
          name: payload.name,
          role: payload.role || 'user',
          plan: payload.plan || 'free',
          permissions: payload.permissions || [],
          tenant: payload.tenant,
          display_role: payload.display_role,
        };
      }

      return null;
    } catch (error) {
      console.warn('Session validation failed:', error);
      return null;
    }
  }

  private parseJwtPayload(token: string) {
    if (!token) return null;
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
      return JSON.parse(atob(padded));
    } catch (_) {
      return null;
    }
  }

  logout() {
    // Clear all auth-related storage
    const tokenKeys = ['bridge_token', 'bridge_user_token', 'token'];
    const userKey = 'bridge_user';
    const stateKey = 'bridge_app_state';

    tokenKeys.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem(userKey);
    localStorage.removeItem(stateKey);

    // Clear cookies
    document.cookie = 'bridge_token=;path=/;max-age=0';
    document.cookie = 'access_token=;path=/;max-age=0';
  }
}

// Auth provider hook
export function useAuthProvider() {
  const { state, dispatch } = useApp();
  const authService = new AuthService();

  const loginWithPassword = async (email: string, password: string, mode: 'login' | 'register' = 'login') => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const result = await authService.loginWithPassword(email, password, mode);
      dispatch({ type: 'SET_AUTH', payload: result });
      return result;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const startOAuth = (provider: 'google' | 'github') => {
    window.location.href = `/auth/${provider}`;
  };

  const finishOAuthCallback = async (code: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const result = await authService.finishOAuthCallback(code);
      dispatch({ type: 'SET_AUTH', payload: result });
      return result;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const validateSession = async () => {
    if (!state.token) return;

    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const user = await authService.validateSession(state.token);
      if (user) {
        dispatch({ type: 'SET_AUTH', payload: { user, token: state.token } });
      } else {
        // Session invalid, logout
        dispatch({ type: 'LOGOUT' });
      }
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const logout = () => {
    authService.logout();
    dispatch({ type: 'LOGOUT' });
  };

  return {
    loginWithPassword,
    startOAuth,
    finishOAuthCallback,
    validateSession,
    logout,
  };
}