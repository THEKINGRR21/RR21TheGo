import React, { createContext, useState, useEffect, useContext } from 'react';
import { Platform } from 'react-native';

const API_BASE = 'https://rr21thego.onrender.com/api';
const AUTH_KEY = 'rr21go_auth_subject';

// In-memory cache for native platforms fallback
const memoryStore: Record<string, string> = {};

const localCache = {
  getItem(key: string): string | null {
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem(key);
      } catch {
        return memoryStore[key] || null;
      }
    }
    return memoryStore[key] || null;
  },
  setItem(key: string, value: string): void {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(key, value);
        return;
      } catch {}
    }
    memoryStore[key] = value;
  },
  removeItem(key: string): void {
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(key);
        return;
      } catch {}
    }
    delete memoryStore[key];
  }
};

export interface User {
  id: string;
  authSubject: string;
  email: string;
  displayName: string | null;
  sexAtBirth: 'male' | 'female' | null;
  birthDate: string;
  heightCm: string;
  units: 'metric' | 'imperial';
  timezone: string;
}

export interface Target {
  id: string;
  userId: string;
  effectiveFrom: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  basis: 'estimated' | 'calibrated' | 'manual';
  bmrKcal: number | null;
  tdeeKcal: number | null;
  formula: string | null;
  rationale: string;
}

interface AuthContextType {
  user: User | null;
  target: Target | null;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  isLoading: boolean;
  isInitializing: boolean;
  authSubject: string | null;
  error: string | null;
  loginWithEmail: (email: string) => Promise<void>;
  registerOnboarding: (data: {
    email: string;
    birthDate: string;
    sexAtBirth: 'male' | 'female';
    heightCm: number;
    weightKg: number;
    activity: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extremely_active';
    goal: 'cut' | 'maintain' | 'gain';
    rateWeeklyPct: number;
    leanMassKg?: number;
    goalWeightKg?: number;
    displayName?: string;
  }) => Promise<void>;
  logout: () => void;
  deleteAccount: () => Promise<void>;
  clearError: () => void;
  toggleUnits: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [authSubject, setAuthSubject] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchProfile(subject: string) {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/user/profile`, {
        headers: {
          'Authorization': `Bearer ${subject}`,
        },
      });

      if (res.status === 200) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setTarget(data.target);
        } else {
          setUser(null);
          setTarget(null);
        }
      } else {
        setUser(null);
        setTarget(null);
      }
    } catch (err: any) {
      console.error('Error fetching profile:', err);
      setError('Connection failed. Please check your backend.');
    } finally {
      setIsLoading(false);
    }
  }

  // Attempt to load credentials from cache on mount
  useEffect(() => {
    async function initAuth() {
      try {
        const storedSubject = localCache.getItem(AUTH_KEY);
        if (storedSubject) {
          setAuthSubject(storedSubject);
          await fetchProfile(storedSubject);
        }
      } catch (err) {
        console.error('Failed to initialize auth:', err);
      } finally {
        setIsInitializing(false);
      }
    }
    initAuth();
  }, []);

  async function loginWithEmail(email: string) {
    setIsLoading(true);
    setError(null);
    try {
      // Simulate OAuth/managed identity token generation from the email
      // We generate a deterministic subject for development purposes
      const subject = `dev|${email.trim().toLowerCase()}`;
      localCache.setItem(AUTH_KEY, subject);
      setAuthSubject(subject);
      await fetchProfile(subject);
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  }

  async function registerOnboarding(data: any) {
    if (!authSubject) {
      setError('Not authenticated');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authSubject}`,
        },
        body: JSON.stringify(data),
      });

      const payload = await res.json();
      if (res.status !== 200) {
        throw new Error(payload.error || 'Failed to complete onboarding');
      }

      setUser(payload.user);
      setTarget(payload.target);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  function logout() {
    localCache.removeItem(AUTH_KEY);
    setAuthSubject(null);
    setUser(null);
    setTarget(null);
    setError(null);
  }

  async function deleteAccount() {
    if (!authSubject) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/user/delete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authSubject}`,
        },
      });

      if (res.status === 200) {
        logout();
      } else {
        const payload = await res.json();
        throw new Error(payload.error || 'Failed to delete account');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleUnits() {
    if (!user || !authSubject) return;
    setIsLoading(true);
    setError(null);
    try {
      const newUnits = user.units === 'metric' ? 'imperial' : 'metric';
      const res = await fetch(`${API_BASE}/user/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authSubject}`,
        },
        body: JSON.stringify({ units: newUnits }),
      });

      if (res.status === 200) {
        const data = await res.json();
        setUser(data.user);
      } else {
        const payload = await res.json();
        throw new Error(payload.error || 'Failed to update settings');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  function clearError() {
    setError(null);
  }

  const isAuthenticated = authSubject !== null;
  const isOnboarded = user !== null && target !== null;

  return (
    <AuthContext.Provider
      value={{
        user,
        target,
        isAuthenticated,
        isOnboarded,
        isLoading,
        isInitializing,
        authSubject,
        error,
        loginWithEmail,
        registerOnboarding,
        logout,
        deleteAccount,
        clearError,
        toggleUnits,
      }}
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
