// Minimal client-side auth hook that uses the backend cookie-based auth endpoints.
import { useState, useEffect, useCallback } from 'react';

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
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!res.ok) {
        setUser(null);
        setLoading(false);
        return;
      }
      const body = await res.json();
      if (body && body.authenticated) {
        setUser(body.user || { username: body.user?.username || 'unknown' });
      } else {
        setUser(null);
      }
    } catch (err: any) {
      console.error('Failed to fetch /api/auth/me', err);
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
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ username, password, remember })
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body?.error || 'Login failed');
        setUser(null);
        setLoading(false);
        return { success: false, error: body?.error || 'Login failed' };
      }

      // Success - call /api/auth/me to refresh client state (server sets cookie)
      await fetchMe();
      return { success: true, user: body?.user || null };
    } catch (err: any) {
      console.error('Login request failed', err);
      setError('Network error');
      setLoading(false);
      return { success: false, error: 'Network error' };
    } finally {
      setLoading(false);
    }
  }

  // Logout - call backend to clear cookie
  async function logout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || 'Logout failed');
        return { success: false };
      }
      setUser(null);
      return { success: true };
    } catch (err: any) {
      console.error('Logout failed', err);
      setError('Network error');
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