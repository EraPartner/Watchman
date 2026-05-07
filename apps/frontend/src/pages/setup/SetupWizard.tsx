import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProgressRail, type SetupStep } from "./ProgressRail";
import { WelcomeStep } from "./steps/WelcomeStep";
import { KindPickerStep } from "./steps/KindPickerStep";
import { ConfigureStep } from "./steps/ConfigureStep";
import { ReviewStep } from "./steps/ReviewStep";
import { useSetupDismissal } from "../../hooks/useSetupDismissal";
import "./setup.css";

export default function SetupWizard() {
  const navigate = useNavigate();
  const { dismiss } = useSetupDismissal();

  const [step, setStep] = useState<SetupStep>("welcome");
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);

  const handleSkip = useCallback(() => {
    dismiss();
    navigate("/", { replace: true });
  }, [dismiss, navigate]);

  const handleFinish = useCallback(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  const handlePick = useCallback((kind: string) => {
    setSelectedKind(kind);
    setStep("configure");
  }, []);

  const handleConfigured = useCallback((id: string) => {
    setAddedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setSelectedKind(null);
    setStep("review");
  }, []);

  return (
    <div className="setup-shell">
      <div className="setup-shell__grain" aria-hidden />
      <aside className="setup-shell__rail">
        <div className="setup-brand">
          <span className="setup-brand__mark" aria-hidden />
          <span className="setup-brand__name">Watchman</span>
        </div>
        <ProgressRail step={step} />
      </aside>

      <main className="setup-shell__main">
        <div key={step} className="setup-stage">
          {step === "welcome" && (
            <WelcomeStep
              onStart={() => setStep("pick")}
              onSkip={handleSkip}
            />
          )}
          {step === "pick" && (
            <KindPickerStep
              onSelect={handlePick}
              onBack={() =>
                setStep(addedIds.length > 0 ? "review" : "welcome")
              }
            />
          )}
          {step === "configure" && selectedKind && (
            <ConfigureStep
              kind={selectedKind}
              onDone={handleConfigured}
              onBack={() => setStep("pick")}
            />
          )}
          {step === "review" && (
            <ReviewStep
              addedIds={addedIds}
              onAddAnother={() => setStep("pick")}
              onFinish={handleFinish}
            />
          )}
        </div>
      </main>
    </div>
  );
}
