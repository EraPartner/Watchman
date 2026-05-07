export type SetupStep =
  | "welcome"
  | "pick"
  | "configure"
  | "review";

interface ProgressRailProps {
  step: SetupStep;
}

interface RailItem {
  id: SetupStep;
  index: string;
  label: string;
  hint: string;
}

const ITEMS: readonly RailItem[] = [
  { id: "welcome", index: "01", label: "Welcome", hint: "Orient" },
  { id: "pick", index: "02", label: "Pick", hint: "Choose a service" },
  { id: "configure", index: "03", label: "Configure", hint: "Enter credentials" },
  { id: "review", index: "04", label: "Review", hint: "Confirm & finish" },
];

function statusOf(current: SetupStep, target: SetupStep): "done" | "active" | "todo" {
  const order = ITEMS.map((i) => i.id);
  const ci = order.indexOf(current);
  const ti = order.indexOf(target);
  if (ti < ci) return "done";
  if (ti === ci) return "active";
  return "todo";
}

export function ProgressRail({ step }: ProgressRailProps) {
  return (
    <nav aria-label="Setup progress" className="setup-rail">
      <ol className="setup-rail__list">
        {ITEMS.map((item) => {
          const status = statusOf(step, item.id);
          return (
            <li
              key={item.id}
              className="setup-rail__item"
              data-status={status}
            >
              <span className="setup-rail__dot" aria-hidden />
              <span className="setup-rail__text">
                <span className="setup-rail__index">{item.index}</span>
                <span className="setup-rail__label">{item.label}</span>
                <span className="setup-rail__hint">{item.hint}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
