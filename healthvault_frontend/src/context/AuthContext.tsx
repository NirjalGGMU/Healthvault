import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { AuthUser, UserRecord, UserRole } from '../types';
import { clearAuth, getStoredUser, setStoredUser } from '../utils/auth';

export const roleHome = (role: UserRole): string =>
  role === 'admin' ? '/admin' : role === 'doctor' ? '/doctor' : '/patient';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
  updateUser: (fields: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const performLogout = useCallback(
    (expired: boolean) => {
      clearAuth();
      setUser(null);
      if (expired) toast.error('Session expired. Please log in again.');
      navigate('/login', { replace: true });
    },
    [navigate]
  );

  // Restore session on first load. The session itself lives in the backend's
  // httpOnly cookie (never readable by JS), so we optimistically render the
  // cached profile, then confirm it against the server; a 401 means the
  // cookie is missing/expired.
  useEffect(() => {
    const stored = getStoredUser();
    if (stored) setUser(stored);

    api
      .get<{ user: UserRecord }>('/users/profile')
      .then(({ data }) => {
        // /users/profile returns the raw Mongo doc (_id), not the AuthUser
        // shape (id) that login/verify-mfa return — normalize it.
        const profileUser: AuthUser = {
          id: data.user._id,
          name: data.user.name,
          email: data.user.email,
          role: data.user.role,
          mfaEnabled: data.user.mfaEnabled,
          avatarUrl: data.user.avatarUrl,
          lastLogin: data.user.lastLogin,
          passwordChangedAt: data.user.passwordChangedAt,
        };
        setStoredUser(profileUser);
        setUser(profileUser);
      })
      .catch(() => {
        clearAuth();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    (authUser: AuthUser) => {
      setStoredUser(authUser);
      setUser(authUser);
      navigate(roleHome(authUser.role), { replace: true });
    },
    [navigate]
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
