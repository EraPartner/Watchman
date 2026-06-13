import type { ReactNode } from "react";
import { TopNav } from "@/components/dashboard/TopNav";
import { TooltipProvider } from "@/components/primitives";

export interface SettingsLayoutProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function SettingsLayout({
  eyebrow,
  title,
  description,
  actions,
  children,
}: SettingsLayoutProps) {
  return (
    <TooltipProvider>
      <div className="relative min-h-screen text-[var(--text-hi)]">
        <TopNav />
        <main className="relative mx-auto max-w-screen-xl px-s-8 py-s-10">
          <header className="mb-s-10 flex items-end justify-between gap-s-6">
            <div className="space-y-s-3">
              {eyebrow ? (
                <p className="font-mono text-fs-label uppercase tracking-[0.18em] text-[var(--accent)]">
                  {eyebrow}
                </p>
              ) : null}
              <h1 className="text-[clamp(2rem,1.6rem+1.4vw,3rem)] font-[700] leading-[0.98] tracking-[-0.03em] text-[var(--text-hi)]">
                {title}
              </h1>
              {description ? (
                <div className="flex items-center gap-s-3">
                  <span
                    aria-hidden
                    className="inline-block h-px w-12 shrink-0 bg-[var(--accent)]"
                  />
                  <p className="max-w-2xl text-fs-body text-[var(--text-md)]">
                    {description}
                  </p>
                </div>
              ) : null}
            </div>
            {actions ? (
              <div className="flex items-center gap-s-2">{actions}</div>
            ) : null}
          </header>
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}
