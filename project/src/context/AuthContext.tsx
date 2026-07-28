import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authAPI, errorMessage, onAuthFailure, tokenStore } from '../services/api';
import type { Role, User } from '../types';

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isInitializing: boolean;
  /** True when the user holds any of the given roles. */
  can: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    window.history.replaceState(null, '', '/');
  }, []);

  useEffect(() => {
    // The api layer calls this when a refresh fails, so an expired session
    // drops straight back to the login screen instead of looping on 401s.
    onAuthFailure.handler = logout;
    return () => {
      onAuthFailure.handler = null;
    };
  }, [logout]);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!tokenStore.access) {
        setIsInitializing(false);
        return;
      }
      try {
        const { data } = await authAPI.me();
        if (!cancelled) setUser(data);
      } catch {
        tokenStore.clear();
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const { data } = await authAPI.login(username, password);
      tokenStore.set(data.access, data.refresh);
      setUser(data.user);
    } catch (error) {
      throw new Error(errorMessage(error, 'Invalid username or password.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const can = useCallback(
    (...roles: Role[]) => (user ? roles.includes(user.role) : false),
    [user],
  );

  return (
    <AuthContext.Provider
      value={{ user, login, logout, isLoading, isInitializing, can }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
