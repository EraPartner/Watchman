import { ArrowRight, Gauge, Radar, ShieldCheck } from "lucide-react";
import { Button } from "../../../components/primitives";

interface WelcomeStepProps {
  onStart: () => void;
  onSkip: () => void;
}

export function WelcomeStep({ onStart, onSkip }: WelcomeStepProps) {
  return (
    <section className="setup-welcome" aria-labelledby="setup-welcome-heading">
      <p className="setup-eyebrow">Watchman · First run</p>
      <h1 id="setup-welcome-heading" className="setup-headline">
        A quiet console
        <br />
        for the boxes
        <span className="setup-headline__accent"> that run your life.</span>
      </h1>
      <p className="setup-lede">
        Connect the services you already run at home — nodes, bridges, routers, media —
        and Watchman will poll, chart, and ping you when something slips.
      </p>

      <ul className="setup-props">
        <li>
          <span className="setup-props__icon"><Radar size={18} strokeWidth={1.5} /></span>
          <div>
            <h3>Unified signal</h3>
            <p>One dashboard across 13 service kinds.</p>
          </div>
        </li>
        <li>
          <span className="setup-props__icon"><Gauge size={18} strokeWidth={1.5} /></span>
          <div>
            <h3>Live & historical</h3>
            <p>WebSocket updates, durable time-series.</p>
          </div>
        </li>
        <li>
          <span className="setup-props__icon"><ShieldCheck size={18} strokeWidth={1.5} /></span>
          <div>
            <h3>Secrets encrypted</h3>
            <p>AES-256-GCM at rest. Redacted on read.</p>
          </div>
        </li>
      </ul>

      <div className="setup-cta-row">
        <Button variant="accent" size="lg" onClick={onStart}>
          Begin setup
          <ArrowRight size={16} strokeWidth={1.8} aria-hidden />
        </Button>
        <button type="button" className="setup-skip" onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </section>
  );
}
