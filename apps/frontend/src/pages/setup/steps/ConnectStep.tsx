import { useCallback, useState } from "react";
import { ArrowRight, Server } from "lucide-react";
import { z } from "zod";
import { Button } from "../../../components/primitives";
import { getDesktopBridge } from "../../../lib/backendUrl";

interface ConnectStepProps {
  onConnected: () => void;
}

const urlSchema = z
  .string()
  .trim()
  .min(1, "Enter a backend URL")
  .regex(
    /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
    "Must be http(s)://host[:port]",
  )
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Invalid URL" },
  );

type ProbeState =
  | { kind: "idle" }
  | { kind: "probing" }
  | { kind: "error"; message: string };

const PROBE_TIMEOUT_MS = 3000;

export function ConnectStep({ onConnected }: ConnectStepProps) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ProbeState>({ kind: "idle" });

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      const parsed = urlSchema.safeParse(url);
      if (!parsed.success) {
        setState({
          kind: "error",
          message: parsed.error.issues[0]?.message ?? "Invalid URL",
        });
        return;
      }

      const bridge = getDesktopBridge();
      if (!bridge?.saveApiUrl || !bridge.reload) {
        setState({
          kind: "error",
          message: "Desktop bridge unavailable. Restart the app.",
        });
        return;
      }

      setState({ kind: "probing" });

      const base = parsed.data.replace(/\/+$/, "");
      try {
        const response = await fetch(`${base}/meta/health`, {
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
          headers: { accept: "application/json" },
        });

        if (!response.ok) {
          setState({
            kind: "error",
            message: `Backend responded ${response.status}. Check the URL.`,
          });
          return;
        }

        await bridge.saveApiUrl(base);
        await bridge.reload();
        onConnected();
      } catch (error: unknown) {
        setState({ kind: "error", message: describeFetchError(error, base) });
      }
    },
    [url, onConnected],
  );

  const isProbing = state.kind === "probing";

  return (
    <section className="setup-connect" aria-labelledby="setup-connect-heading">
      <p className="setup-eyebrow">Watchman · Connect</p>
      <h1 id="setup-connect-heading" className="setup-h1">
        Point the app at your backend.
      </h1>
      <p className="setup-sub">
        Watchman&apos;s backend runs on your always-on box — usually a Raspberry
        Pi on the same LAN. Enter its address to pair this client.
      </p>

      <form className="setup-configure__form setup-connect__form" onSubmit={handleSubmit}>
        <div className="setup-connect__field">
          <label htmlFor="setup-connect-url">
            <span>Backend URL</span>
          </label>
          <div className="setup-connect__input-row">
            <span className="setup-connect__icon" aria-hidden>
              <Server size={16} strokeWidth={1.6} />
            </span>
            <input
              id="setup-connect-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="http://192.168.1.10:3001"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                if (state.kind === "error") setState({ kind: "idle" });
              }}
              disabled={isProbing}
              required
            />
          </div>
          <p className="setup-help">
            HTTP only on LAN. Reserve a DHCP lease on your router so the URL
            stays stable.
          </p>
        </div>

        {state.kind === "error" && (
          <p className="setup-connect__error" role="alert">
            {state.message}
          </p>
        )}

        <div className="setup-cta-row">
          <Button type="submit" variant="accent" size="lg" disabled={isProbing}>
            {isProbing ? "Testing…" : "Test & save"}
            <ArrowRight size={16} strokeWidth={1.8} aria-hidden />
          </Button>
        </div>
      </form>
    </section>
  );
}

function describeFetchError(error: unknown, base: string): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return `No response within ${PROBE_TIMEOUT_MS / 1000}s. Is the backend running at ${base}?`;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Request aborted.";
  }
  if (error instanceof TypeError) {
    return `Can't reach ${base}. Check the IP, port, and that both devices are on the same network.`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error while probing backend.";
}
