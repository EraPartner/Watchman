# Security Policy

## Security model — read this first

Watchman is built for a **single user on a trusted network**. By deliberate
design it has **no authentication, no CSRF protection, and no rate limiting**
(see [ADR-017](./docs/adr/) and
[ADR-025 — trusted-network security model](./docs/adr/)).

**Consequence:** anyone who can reach the backend port can read everything and
reconfigure every monitored service. Therefore:

- **Do not expose the backend beyond your trusted network.** Bind it to a private
  interface and/or firewall the port (default `3001`). Do not port-forward it or
  put it on the public internet.
- Browser cross-origin access is gated by an **origin allow-list** (shared by CORS
  and the WebSocket upgrade): desktop `watchman://`, loopback, and anything in
  `CORS_ALLOWED_ORIGINS`. A web deployment on a non-loopback origin must set
  `CORS_ALLOWED_ORIGINS` explicitly.

This model is a feature, not a gap — but it only holds if the network boundary is
real. If you need multi-user or untrusted-network access, Watchman is not
currently designed for that.

## Secret handling

- Secrets live **only** in `.env.local` (gitignored) and are **encrypted at rest**
  in the DuckDB config store using `WATCHMAN_MASTER_KEY`.
- Secrets and PII are **never logged** — pino redaction is configured; keep it intact.
- All inputs are validated server-side (Zod). Service configs follow least privilege.

## Supported versions

This is a solo-maintained project. Security fixes target the **latest release**
and the current `main` branch only. Older versions are not patched.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Use GitHub's **private vulnerability reporting**:
[Security → Report a vulnerability](https://github.com/EraPartner/Watchman/security/advisories/new)
on this repository. (If private reporting isn't enabled, open a minimal public
issue asking for a private contact channel — without vulnerability details.)

Because the project is solo-maintained, response is best-effort. Please include:

- affected component and version / commit,
- a clear description and impact,
- reproduction steps or a proof of concept,
- any suggested remediation.

Given the trusted-network threat model above, please note in your report whether
the issue is exploitable **within** that model (e.g. it would affect a correctly
firewalled, single-user deployment) — those are the highest priority.
