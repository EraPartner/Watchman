import { useState } from "react";
import { TooltipProvider } from "@/components/primitives";
import { DashboardGrid } from "./DashboardGrid";
import { ServiceTile } from "@/components/tile/ServiceTile";
import { ServiceDetailSheet } from "@/components/detail/ServiceDetailSheet";
import { BENTO_LAYOUT } from "@/config/bentoLayout";
import { getRenderer } from "@/services/renderers";
import type { ServiceKind } from "@/services/renderers/types";

interface OpenCtx {
  kind: ServiceKind;
  instanceId?: string;
}

export default function BentoDashboard() {
  const [openCtx, setOpenCtx] = useState<OpenCtx | null>(null);

  const entries = BENTO_LAYOUT.filter((e) => getRenderer(e.kind));

  return (
    <TooltipProvider>
      <main className="min-h-screen bg-[var(--surface-0)] px-s-8 py-s-10 text-[var(--text-hi)]">
        <header className="mb-s-8 space-y-s-2">
          <p className="text-fs-label uppercase tracking-[0.12em] text-[var(--text-lo)]">
            Watchman · Bento
          </p>
          <h1 className="text-fs-h1 font-[700] tracking-[-0.02em]">
            Service dashboard
          </h1>
        </header>

        <DashboardGrid>
          {entries.map((entry) => (
            <ServiceTile
              key={entry.kind}
              kind={entry.kind}
              size={entry.size}
              onOpenDetail={({ kind, instanceId }) =>
                setOpenCtx({ kind, instanceId })
              }
            />
          ))}
        </DashboardGrid>

        <ServiceDetailSheet
          kind={openCtx?.kind}
          instanceId={openCtx?.instanceId}
          open={!!openCtx}
          onOpenChange={(o) => (o ? null : setOpenCtx(null))}
        />
      </main>
    </TooltipProvider>
  );
}
