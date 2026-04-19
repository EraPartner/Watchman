import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/primitives";
import { useSetupStatus, useCreateService } from "./Settings/useConfigQueries";
import ServiceEditor from "./Settings/ServiceEditor";

type Step = "welcome" | "admin" | "service" | "done";

export default function SetupWizard() {
  const { data: status, isLoading } = useSetupStatus();
  const navigate = useNavigate();
  const createMut = useCreateService();
  const [step, setStep] = useState<Step>("welcome");

  if (isLoading) return <p className="p-6">Loading…</p>;
  if (status && !status.needsSetup) {
    navigate("/settings/services");
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--surface-0)] flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded border p-6 space-y-4">
        {step === "welcome" && (
          <>
            <h1 className="text-2xl font-semibold">Welcome to Watchman</h1>
            <p className="text-sm text-muted-foreground">
              Let's configure your dashboard. We'll set up admin access and add
              your first monitored service.
            </p>
            <div className="flex justify-end">
              <Button variant="accent" onClick={() => setStep("admin")}>
                Continue
              </Button>
            </div>
          </>
        )}

        {step === "admin" && (
          <>
            <h1 className="text-2xl font-semibold">Admin credentials</h1>
            {status?.adminConfigured ? (
              <p className="text-sm">
                Admin credentials are configured via environment variables.
              </p>
            ) : (
              <div className="text-sm text-red-500 space-y-2">
                <p>
                  Admin is not configured. Set{" "}
                  <code>AUTH_USERNAME</code> and{" "}
                  <code>AUTH_PASSWORD_HASH</code> in your <code>.env</code>,
                  then restart the backend.
                </p>
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep("welcome")}>
                Back
              </Button>
              <Button
                variant="accent"
                onClick={() => setStep("service")}
                disabled={!status?.adminConfigured}
              >
                Continue
              </Button>
            </div>
          </>
        )}

        {step === "service" && (
          <>
            <h1 className="text-2xl font-semibold">Add your first service</h1>
            <ServiceEditor
              onCancel={() => setStep("admin")}
              submitting={createMut.isPending}
              onSubmit={async (input) => {
                await createMut.mutateAsync(input);
                setStep("done");
              }}
            />
          </>
        )}

        {step === "done" && (
          <>
            <h1 className="text-2xl font-semibold">All set</h1>
            <p className="text-sm text-muted-foreground">
              Your service is live. You can add more at any time.
            </p>
            <div className="flex justify-end">
              <Button
                variant="accent"
                onClick={() => navigate("/settings/services")}
              >
                Go to dashboard
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
