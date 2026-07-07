import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { AuthUser, UserRole } from '../types';
import {
  clearAuth,
  getStoredUser,
  getToken,
  getTokenRemainingMs,
  isTokenExpired,
  setStoredUser,
  setToken,
} from '../utils/auth';

export const roleHome = (role: UserRole): string =>
  role === 'admin' ? '/admin' : role === 'doctor' ? '/doctor' : '/patient';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  updateUser: (fields: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const performLogout = useCallback(
    (expired: boolean) => {
      clearTimer();
      clearAuth();
      setUser(null);
      if (expired) toast.error('Session expired. Please log in again.');
      navigate('/login', { replace: true });
    },
    [navigate]
  );

  // Auto logout exactly when the JWT expires
  const scheduleAutoLogout = useCallback(
    (token: string) => {
      clearTimer();
      const remaining = getTokenRemainingMs(token);
      if (remaining <= 0) {
        performLogout(true);
        return;
      }
      timerRef.current = window.setTimeout(() => performLogout(true), remaining);
    },
    [performLogout]
  );

  // Restore session on first load
  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (token && stored && !isTokenExpired(token)) {
      setUser(stored);
      scheduleAutoLogout(token);
    } else {
      clearAuth();
    }
    setLoading(false);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    (token: string, authUser: AuthUser) => {
      setToken(token);
      setStoredUser(authUser);
      setUser(authUser);
      scheduleAutoLogout(token);
      navigate(roleHome(authUser.role), { replace: true });
    },
    [navigate, scheduleAutoLogout]
  );

  const logout = useCallback(() => {
    void api.post('/auth/logout').catch(() => undefined); // best-effort activity log
    performLogout(false);
    toast.success('Logged out');
  }, [performLogout]);

  const updateUser = useCallback((fields: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...fields };
      setStoredUser(next);
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, isAuthenticated: user !== null, login, logout, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
