import { ArrowRight, Check, Plus } from "lucide-react";
import { Button } from "../../../components/primitives";
import { useServices } from "../../Settings/useConfigQueries";
import { getKindMeta } from "../kindCategories";

interface ReviewStepProps {
  addedIds: string[];
  onAddAnother: () => void;
  onFinish: () => void;
}

export function ReviewStep({ addedIds, onAddAnother, onFinish }: ReviewStepProps) {
  const { data: services } = useServices();
  const added = (services ?? []).filter((s) => addedIds.includes(s.id));

  return (
    <section className="setup-review" aria-labelledby="setup-review-heading">
      <p className="setup-eyebrow">Step 04 · Review</p>
      <h2 id="setup-review-heading" className="setup-h1">
        {added.length === 0
          ? "Nothing added yet"
          : `Configured ${added.length} service${added.length === 1 ? "" : "s"}`}
      </h2>
      <p className="setup-sub">
        Add another kind, or finish and head to the dashboard. Services start polling immediately.
      </p>

      {added.length > 0 && (
        <ul className="setup-review__list">
          {added.map((svc) => {
            const meta = getKindMeta(svc.kind);
            const Icon = meta.icon;
            return (
              <li key={svc.id} className="setup-review__row">
                <span className="setup-review__icon">
                  <Icon size={18} strokeWidth={1.6} aria-hidden />
                </span>
                <span className="setup-review__body">
                  <span className="setup-review__label">{svc.instanceId}</span>
                  <span className="setup-review__kind">{svc.kind}</span>
                </span>
                <span className="setup-review__chip" data-state={svc.enabled ? "on" : "off"}>
                  <Check size={12} strokeWidth={2.2} aria-hidden />
                  {svc.enabled ? "Enabled" : "Disabled"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="setup-cta-row">
        <Button variant="ghost" onClick={onAddAnother}>
          <Plus size={14} strokeWidth={1.8} aria-hidden />
          Add another
        </Button>
        <Button variant="accent" size="lg" onClick={onFinish}>
          Finish
          <ArrowRight size={16} strokeWidth={1.8} aria-hidden />
        </Button>
      </div>
    </section>
  );
}
