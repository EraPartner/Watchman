import { type LucideIcon } from "lucide-react";

interface KindCardProps {
  kind: string;
  label: string;
  icon: LucideIcon;
  blurb: string;
  onSelect: (kind: string) => void;
}

export function KindCard({ kind, label, icon: Icon, blurb, onSelect }: KindCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(kind)}
      className="setup-kind-card"
      aria-label={`Add ${label}`}
    >
      <span className="setup-kind-card__icon">
        <Icon size={20} strokeWidth={1.6} aria-hidden />
      </span>
      <span className="setup-kind-card__body">
        <span className="setup-kind-card__label">{label}</span>
        <span className="setup-kind-card__blurb">{blurb}</span>
      </span>
    </button>
  );
}
