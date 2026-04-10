import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiClient } from "../services/ApiClient";
import { logger } from "../lib/logger";

type User = {
  id?: string | number;
  username: string;
} | null;

type AuthContextValue = {
  user: User;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (
    username: string,
    password: string,
    remember?: boolean
  ) => Promise<{ success: boolean; user?: User; error?: string }>;
  logout: () => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function useAuthController(): AuthContextValue {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMe = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const body = await apiClient.getAuthMe().catch(() => undefined);
      if (!body || !body.authenticated) {
        setUser(null);
      } else {
        const username =
          body.user?.username ||
          (typeof body.user?.id === "string" ? body.user.id : "unknown");
        setUser({ id: body.user?.id, username });
      }
    } catch (err: unknown) {
      logger.warn("[AUTH] Failed to fetch auth state", err);
      setUser(null);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = useCallback(
    async (username: string, password: string, remember = false) => {
      setLoading(true);
      setError(null);
      try {
        const body = await apiClient.login(username, password, remember);
        if (!body || !body.user) {
          setError("Login failed");
          setUser(null);
          setLoading(false);
          return { success: false, error: "Login failed" };
        }

        await fetchMe({ silent: true });
        return { success: true, user: body?.user || null };
      } catch (err: unknown) {
        logger.warn("[AUTH] Login request failed", err);
        const message = err instanceof Error ? err.message : "Network error";
        setError(message);
        setLoading(false);
        return { success: false, error: message };
      } finally {
        setLoading(false);
      }
    },
    [fetchMe]
  );

  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.logout();
      setUser(null);
      return { success: true };
    } catch (err: unknown) {
      logger.warn("[AUTH] Logout request failed", err);
      const message = err instanceof Error ? err.message : "Network error";
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  return useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      loading,
      error,
      login,
      logout,
      refresh: fetchMe,
    }),
    [user, loading, error, login, logout, fetchMe]
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthController();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
