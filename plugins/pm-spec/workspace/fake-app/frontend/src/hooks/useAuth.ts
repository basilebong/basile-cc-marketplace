import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { api } from "../api/client";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useAuthProvider(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const data = await api.get<User>("/users/me/");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      fetchUser();
    } else {
      setIsLoading(false);
    }
  }, [fetchUser]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ access: string; refresh: string }>(
      "/auth/token/",
      { email, password }
    );
    localStorage.setItem("access_token", data.access);
    localStorage.setItem("refresh_token", data.refresh);
    await fetchUser();
  }, [fetchUser]);

  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
    // TODO: call backend to blacklist refresh token
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
