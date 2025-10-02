// A small auth guard that prevents children from mounting until the user is authenticated.
import React, { ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { Navigate } from "react-router-dom";

const AuthGuard = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();

  // While auth status is being determined, render a simple loader.
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Not authenticated — redirect to login. Children won't mount, so dashboard won't start.
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default AuthGuard;
