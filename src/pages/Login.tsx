import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const Login = () => {
  const { login, isAuthenticated, loading, error } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // If already authenticated, redirect to home
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!username || !password) {
      setFormError("Please enter username and password");
      return;
    }

    const res = await login(username, password, remember);
    if (res.success) {
      navigate("/");
    } else {
      setFormError(res.error || "Login failed");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-md bg-card p-6 rounded shadow">
        <h2 className="text-2xl font-semibold mb-4">Sign in</h2>
        <form onSubmit={onSubmit}>
          <label className="block mb-2">
            <span className="text-sm text-muted-foreground">Username</span>
            <input
              className="mt-1 block w-full rounded border bg-transparent px-3 py-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="block mb-2">
            <span className="text-sm text-muted-foreground">Password</span>
            <input
              type="password"
              className="mt-1 block w-full rounded border bg-transparent px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          <label className="flex items-center gap-2 text-sm mb-4">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me
          </label>

          {(formError || error) && (
            <div className="text-sm text-red-600 mb-2">
              {formError || error}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
            <a className="text-sm text-muted-foreground" href="/">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
