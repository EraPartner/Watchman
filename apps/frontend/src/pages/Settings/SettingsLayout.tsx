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
      <div className="relative min-h-screen bg-[var(--surface-0)] text-[var(--text-hi)]">
        <TopNav />
        <main className="relative mx-auto max-w-screen-xl px-s-8 py-s-10">
          <header className="mb-s-8 flex items-end justify-between gap-s-6">
            <div className="space-y-s-2">
              {eyebrow ? (
                <p className="font-mono text-fs-label uppercase tracking-[0.18em] text-[var(--accent)]">
                  {eyebrow}
                </p>
              ) : null}
              <h1 className="text-fs-h1 font-[700] tracking-[-0.02em]">
                {title}
              </h1>
              {description ? (
                <p className="text-fs-body text-[var(--text-md)]">
                  {description}
                </p>
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
