# Codex cloud environment

Choose Node.js 24 and set the environment setup command to:

```bash
bash .codex/cloud/setup.sh
```

The setup installs the portable global working agreement and exact npm lockfile dependencies. It
does not create `apps/backend/.env` or start external services. Add disposable test environment
variables in the cloud environment when required. In particular, never reuse a production
`WATCHMAN_MASTER_KEY`.

Do not copy the host hooks. They protect the local Mac and use host paths. Run container, macOS,
hardware-backed signing, and local-service integration checks in a local session.
