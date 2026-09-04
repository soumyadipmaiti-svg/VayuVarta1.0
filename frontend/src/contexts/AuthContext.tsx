import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api } from '../api/client';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  phone_number?: string;
  phone_verified?: boolean;
  whatsapp_consent?: boolean;
  created_at?: string;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthCtx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('wgpt_token');
    if (t) {
      api.setToken(t);
      api.me().then(setUser).catch(() => {
        localStorage.removeItem('wgpt_token');
        api.setToken(null);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api.login({ email, password });
    localStorage.setItem('wgpt_token', r.token);
    api.setToken(r.token);
    setUser(r.user);
  };

  const register = async (name: string, email: string, password: string) => {
    await api.register({ name, email, password });
  };

  const logout = () => {
    api.setToken(null);
    localStorage.removeItem('wgpt_token');
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
