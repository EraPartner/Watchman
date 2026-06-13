import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useSetupStatus } from "./pages/Settings/useConfigQueries";
import { useSetupDismissal } from "./hooks/useSetupDismissal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { lazy, Suspense, type ReactNode } from "react";
import { WebSocketProvider } from "./providers/WebSocketProvider";

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined;

  if (status !== undefined && status >= 400 && status < 500) {
    return false;
  }

  return failureCount < 3;
}

const NotFoundPage = lazy(() => import("./pages/NotFound"));
const BentoDashboardPage = lazy(
  () => import("./components/dashboard/BentoDashboard")
);
const SetupWizardPage = lazy(() => import("./pages/setup/SetupWizard"));
const SettingsServicesPage = lazy(() => import("./pages/Settings/Services"));
const SettingsProfilesPage = lazy(() => import("./pages/Settings/Profiles"));
const SettingsAuditPage = lazy(() => import("./pages/Settings/Audit"));
const SettingsBackupPage = lazy(() => import("./pages/Settings/BackupRestore"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

// Intentionally only gates the dashboard: /settings/* stays reachable on an
// unconfigured instance as an alternative to the wizard, and dismissal is a
// client-side convenience for this single-user, trusted-network tool.
function SetupGate({ children }: { children: ReactNode }) {
  const { data, isLoading } = useSetupStatus();
  const { dismissed } = useSetupDismissal();
  if (isLoading) return <PageLoader />;
  if (data?.needsSetup && !dismissed) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-[var(--surface-0)]">
    <div className="text-center text-[var(--text-md)]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)] mx-auto mb-4"></div>
      <p>Loading…</p>
    </div>
  </div>
);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <Toaster theme="dark" position="top-right" />
        <BrowserRouter>
          <ErrorBoundary>
            <div aria-hidden className="atmosphere" />
            <div className="relative z-10">
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route
                    path="/"
                    element={
                      <SetupGate>
                        <BentoDashboardPage />
                      </SetupGate>
                    }
                  />
                  <Route path="/setup" element={<SetupWizardPage />} />
                  <Route
                    path="/settings/services"
                    element={<SettingsServicesPage />}
                  />
                  <Route
                    path="/settings/profiles"
                    element={<SettingsProfilesPage />}
                  />
                  <Route
                    path="/settings/audit"
                    element={<SettingsAuditPage />}
                  />
                  <Route
                    path="/settings/backup"
                    element={<SettingsBackupPage />}
                  />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </div>
          </ErrorBoundary>
        </BrowserRouter>
      </WebSocketProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}

export default App;
