import { ArrowLeft } from "lucide-react";
import ServiceEditor from "../../Settings/ServiceEditor";
import { useCreateService, useKinds } from "../../Settings/useConfigQueries";
import { getKindMeta } from "../kindCategories";
import type { ServiceInstanceInput } from "../../../services/configApi";

interface ConfigureStepProps {
  kind: string;
  onDone: (id: string) => void;
  onBack: () => void;
}

export function ConfigureStep({ kind, onDone, onBack }: ConfigureStepProps) {
  const { data: kinds } = useKinds();
  const createMut = useCreateService();
  const meta = getKindMeta(kind);
  const Icon = meta.icon;
  const schema = kinds?.find((k) => k.kind === kind);

  const handleSubmit = async (input: ServiceInstanceInput) => {
    const created = await createMut.mutateAsync(input);
    onDone(created.id);
  };

  return (
    <section className="setup-configure" aria-labelledby="setup-configure-heading">
      <header className="setup-configure__header">
        <button type="button" className="setup-back" onClick={onBack}>
          <ArrowLeft size={14} strokeWidth={1.8} aria-hidden />
          Back
        </button>
        <p className="setup-eyebrow">Step 03 · Configure</p>
        <div className="setup-configure__title-row">
          <span className="setup-configure__badge">
            <Icon size={20} strokeWidth={1.6} aria-hidden />
          </span>
          <h2 id="setup-configure-heading" className="setup-h1">
            {schema?.label ?? kind}
          </h2>
        </div>
        <p className="setup-sub">{meta.blurb}</p>
        {schema?.description && (
          <p className="setup-help">{schema.description}</p>
        )}
      </header>

      <div className="setup-configure__form">
        <ServiceEditor
          presetKind={kind}
          hideKind
          hideCancel
          onSubmit={handleSubmit}
          onCancel={onBack}
          submitting={createMut.isPending}
        />
      </div>
    </section>
  );
}
