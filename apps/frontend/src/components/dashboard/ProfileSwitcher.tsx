import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Button,
} from "@/components/primitives";
import { cn } from "@/lib/utils";
import {
  useProfiles,
  useActiveProfile,
  useCurrentNetwork,
  useSetActiveProfile,
  useSetAutoSwitch,
  useCaptureNetwork,
} from "@/pages/Settings/useProfileQueries";

function Dot({ color }: { color?: string | null }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: color || "var(--accent)" }}
    />
  );
}

export function ProfileSwitcher() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: profiles } = useProfiles();
  const { data: active } = useActiveProfile();
  const { data: network } = useCurrentNetwork();
  const setActive = useSetActiveProfile();
  const setAutoSwitch = useSetAutoSwitch();
  const capture = useCaptureNetwork();

  const activeProfile = profiles?.find((p) => p.id === active?.activeProfileId);
  // An unrecognized network is one with a detectable gateway MAC that no profile claims.
  const unrecognized =
    !!network?.signature.gatewayMac && network.matchedProfileId === null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-s-2 rounded-r-pill border px-s-3 py-s-1 text-fs-label transition-colors",
            "border-[var(--hairline)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)]",
            unrecognized && "border-[var(--warn)]"
          )}
          aria-label="Switch profile"
        >
          <Dot color={activeProfile?.color} />
          <span className="max-w-[10rem] truncate font-medium text-[var(--text-hi)]">
            {activeProfile?.name ?? "No profile"}
          </span>
          {unrecognized ? (
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--warn)]"
              title="Unrecognized network"
              aria-hidden
            />
          ) : null}
          <span aria-hidden className="text-[var(--text-dim)]">
            ▾
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-s-0">
        <div className="px-s-3 pb-s-1 pt-s-3 text-fs-label uppercase tracking-[0.12em] text-[var(--text-dim)]">
          Profiles
        </div>
        <div className="max-h-72 overflow-y-auto py-s-1">
          {(profiles ?? []).map((p) => {
            const isActive = p.id === active?.activeProfileId;
            return (
              <button
                key={p.id}
                type="button"
                disabled={setActive.isPending}
                onClick={() => {
                  if (!isActive) setActive.mutate(p.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-s-2 px-s-3 py-s-2 text-left text-fs-body transition-colors",
                  isActive
                    ? "bg-[var(--surface-3)] text-[var(--text-hi)]"
                    : "text-[var(--text-md)] hover:bg-[var(--surface-3)]"
                )}
              >
                <span className="flex min-w-0 items-center gap-s-2">
                  <Dot color={p.color} />
                  <span className="truncate">{p.name}</span>
                </span>
                <span className="shrink-0 font-mono text-fs-label text-[var(--text-lo)]">
                  {isActive ? "● " : ""}
                  {p.serviceCount}
                </span>
              </button>
            );
          })}
          {profiles && profiles.length === 0 ? (
            <p className="px-s-3 py-s-2 text-fs-label text-[var(--text-lo)]">
              No profiles yet.
            </p>
          ) : null}
        </div>

        {unrecognized && activeProfile ? (
          <div className="border-t border-[var(--hairline)] px-s-3 py-s-2">
            <p className="mb-s-1 text-fs-label text-[var(--warn)]">
              Unrecognized network
            </p>
            <Button
              variant="tonal"
              size="sm"
              className="w-full"
              disabled={capture.isPending}
              onClick={() => capture.mutate(activeProfile.id)}
            >
              Assign this network to {activeProfile.name}
            </Button>
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-[var(--hairline)] px-s-3 py-s-2">
          <span className="text-fs-label text-[var(--text-md)]">
            Auto-switch
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={active?.autoSwitch ?? false}
            disabled={setAutoSwitch.isPending}
            onClick={() => setAutoSwitch.mutate(!(active?.autoSwitch ?? false))}
            className={cn(
              "relative h-4 w-7 rounded-full transition-colors",
              active?.autoSwitch
                ? "bg-[var(--accent)]"
                : "bg-[var(--surface-3)]"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
                active?.autoSwitch ? "translate-x-3.5" : "translate-x-0.5"
              )}
            />
          </button>
        </div>

        <div className="border-t border-[var(--hairline)] px-s-2 py-s-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-[var(--text-md)]"
            onClick={() => {
              setOpen(false);
              navigate("/settings/profiles");
            }}
          >
            Manage profiles →
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
