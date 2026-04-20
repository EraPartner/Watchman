import { useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { useKinds } from "../../Settings/useConfigQueries";
import {
  CATEGORY_ORDER,
  getKindMeta,
  type KindCategory,
} from "../kindCategories";
import { KindCard } from "../KindCard";

interface KindPickerStepProps {
  onSelect: (kind: string) => void;
  onBack: () => void;
}

interface Entry {
  kind: string;
  label: string;
  blurb: string;
  category: KindCategory;
  icon: ReturnType<typeof getKindMeta>["icon"];
}

export function KindPickerStep({ onSelect, onBack }: KindPickerStepProps) {
  const { data: kinds, isLoading } = useKinds();
  const [query, setQuery] = useState("");

  const entries: Entry[] = useMemo(() => {
    if (!kinds) return [];
    return kinds.map((k) => {
      const meta = getKindMeta(k.kind);
      return {
        kind: k.kind,
        label: k.label,
        blurb: meta.blurb,
        category: meta.category,
        icon: meta.icon,
      };
    });
  }, [kinds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.kind.toLowerCase().includes(q) ||
        e.label.toLowerCase().includes(q) ||
        e.blurb.toLowerCase().includes(q)
    );
  }, [entries, query]);

  const byCategory = useMemo(() => {
    const map = new Map<KindCategory, Entry[]>();
    for (const e of filtered) {
      const arr = map.get(e.category) ?? [];
      arr.push(e);
      map.set(e.category, arr);
    }
    return map;
  }, [filtered]);

  return (
    <section className="setup-pick" aria-labelledby="setup-pick-heading">
      <header className="setup-pick__header">
        <button type="button" className="setup-back" onClick={onBack}>
          <ArrowLeft size={14} strokeWidth={1.8} aria-hidden />
          Back
        </button>
        <p className="setup-eyebrow">Step 02 · Pick</p>
        <h2 id="setup-pick-heading" className="setup-h1">
          Which service are you adding?
        </h2>
        <p className="setup-sub">
          Pick a kind. You can add more afterwards — Watchman supports many instances of any kind.
        </p>

        <label className="setup-search">
          <Search size={14} strokeWidth={1.8} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search router, bitcoin, roon…"
            aria-label="Search service kinds"
          />
        </label>
      </header>

      {isLoading && <p className="setup-muted">Loading kinds…</p>}

      {!isLoading && filtered.length === 0 && (
        <p className="setup-muted">No kinds match “{query}”.</p>
      )}

      <div className="setup-pick__groups">
        {CATEGORY_ORDER.map((cat) => {
          const items = byCategory.get(cat);
          if (!items || items.length === 0) return null;
          return (
            <section key={cat} className="setup-pick__group">
              <h3 className="setup-group-title">{cat}</h3>
              <div className="setup-pick__grid">
                {items.map((e) => (
                  <KindCard
                    key={e.kind}
                    kind={e.kind}
                    label={e.label}
                    icon={e.icon}
                    blurb={e.blurb}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
