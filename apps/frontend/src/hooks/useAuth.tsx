// Minimal client-side auth hook that uses the backend cookie-based auth endpoints.
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../services/ApiClient";

type User = { username: string } | null;

export function useAuth() {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch current auth status from backend
  const fetchMe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await apiClient.getAuthMe().catch(() => null);
      if (!body || !body.authenticated) {
        setUser(null);
      } else {
        setUser(body.user || { username: body.user?.username || "unknown" });
      }
    } catch (err: any) {
      console.error("Failed to fetch /api/auth/me", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Perform login by POSTing credentials. Backend sets a httpOnly cookie on success.
  async function login(username: string, password: string, remember = false) {
    setLoading(true);
    setError(null);
    try {
      const body = await apiClient
        .login(username, password, remember)
        .catch((e) => ({ error: String(e) }));
      if (!body || body.error) {
        setError(body?.error || "Login failed");
        setUser(null);
        setLoading(false);
        return { success: false, error: body?.error || "Login failed" };
      }

      // Use apiClient.getAuthMe to refresh state (this will use cookie or fallback token)
      await fetchMe();
      return { success: true, user: body?.user || null };
    } catch (err: any) {
      console.error("Login request failed", err);
      setError("Network error");
      setLoading(false);
      return { success: false, error: "Network error" };
    } finally {
      setLoading(false);
    }
  }

  // Logout - call backend to clear cookie
  async function logout() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.logout();
      if (res && res.error) {
        setError(res.error || "Logout failed");
        return { success: false };
      }
      setUser(null);
      return { success: true };
    } catch (err: any) {
      console.error("Logout failed", err);
      setError("Network error");
      return { success: false };
    } finally {
      setLoading(false);
    }
  }

  return {
    user,
    isAuthenticated: !!user,
    loading,
    error,
    login,
    logout,
    refresh: fetchMe,
  } as const;
}
