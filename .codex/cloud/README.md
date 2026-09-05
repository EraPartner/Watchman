# Codex cloud environment

Choose Node.js 24 and set the environment lifecycle commands to:

```bash
# Setup script
bash .codex/cloud/setup.sh

# Maintenance script
bash .codex/cloud/maintenance.sh
```

Setup installs the portable global working agreement and exact npm lockfile dependencies for the
root toolchain, backend, and frontend. It deliberately excludes the Electron desktop workspace,
which cloud cannot package or launch. Native dependency install scripts still run, while the root
Git-hook `prepare` script is an explicit no-op in cloud.

The dependency fingerprint includes Node, npm, the root lockfile, and the selected manifests. It is
stored under `~/.codex/watchman-cloud-state/`. On a cached branch resume, maintenance repeats the
portable agreement setup but skips npm entirely when those inputs and the required workspace links
are unchanged.

npm and its dependency lifecycle scripts run with a sanitized environment. They receive only
`HOME`, `PATH`, `CODEX_SESSION_ENV`, and standard proxy or certificate variables; other cloud setup
secrets are not exposed to package code.

npm denies Git dependencies by default. Immediately before the scoped install,
`scripts/verify-git-dependencies.mjs` requires the sole Git dependency to be the exact reviewed
Roon transport commit in both the workspace manifest and lockfile. Only that verified `npm ci`
invocation temporarily enables Git fetching; any additional Git dependency aborts before npm runs.

The setup does not create `apps/backend/.env` or start external services. Add disposable test
environment variables in the cloud environment when required. In particular, never reuse a
production `WATCHMAN_MASTER_KEY`.

The scoped install and cache behavior have a focused offline test:

```bash
bash .codex/cloud/tests/install-dependencies.test.sh
```

Do not copy the host hooks. They protect the local Mac and use host paths. Run container, macOS,
hardware-backed signing, and local-service integration checks in a local session.

## Pull request lifecycle

Use the platform-managed **Open pull request** action to create a pull request. A
pull-request-linked cloud task may inspect comments and checks, make in-scope follow-up changes,
and let the connected GitHub integration update the same branch. When the user explicitly asks to
merge, the integration may do so only after required checks and approvals pass and no blocking
review remains. Never use an admin bypass or directly update a protected branch.

## Generated working agreement

`.codex/cloud/AGENTS.md` is generated. Its authored sources are
`dotfiles/Other/codex/global-agents.md` and `dotfiles/Other/codex/cloud/AGENTS.md`.
The generator preserves portable global sections and combines them with the cloud-specific
agreement. Edit those canonical sources, then run
`python3 dotfiles/Other/codex/generate-cloud-policy.py` from the parent fleet directory.
Do not edit generated agreements or their vendored `policy/` inputs independently.

The local fleet check is
`python3 dotfiles/Other/codex/generate-cloud-policy.py --check`. It compares generated outputs,
vendored inputs, and checker copies against the canonical sources across all four fleet targets;
missing targets fail. Use `--project PROJECT` to check an explicitly selected target.

Each repository can independently run `python3 .codex/cloud/check-instructions.py` from its root.
CI requires this check in its existing vendored/cloud-tooling job. This verifies that the generated
agreement matches the repository's vendored inputs; it cannot establish freshness against an
absent sibling dotfiles checkout. Use the fleet check for that stronger guarantee. Project-level
`AGENTS.md` instructions continue to apply separately.
