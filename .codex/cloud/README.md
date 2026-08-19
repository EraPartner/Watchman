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
