---
title: "Session: Infrastructure and Dependency Hardening"
type: review
status: complete
date: 2026-08-19
tags: [session, review, infrastructure, dependencies, devcontainer, codex-cloud, security]
description: Runtime-verified dependency modernization and lifecycle hardening across local, cloud, container, and CI paths
aliases: [infrastructure hardening session, dependency lifecycle review]
---

# Session: Infrastructure and Dependency Hardening

> [!abstract] Summary
> Modernized the frontend dependency stack, made local and cloud installs deterministic, reduced
> agent-container dependency load, and closed lifecycle paths that could bypass the reviewed Git
> dependency boundary.

## Changes

- Added verified full and portable clean installs. Both require that the Roon transport is the
  sole Git dependency and pin it to commit
  `2ee60008a4cdb90c34ff3de58bb4b949067f1d20` before npm temporarily permits Git fetching.
- Normal development and most CI jobs use `npm run deps:ci:portable`, which excludes Electron;
  desktop packaging and the full dependency audit use `npm run deps:ci`.
- Routed the macOS installer, development helpers, continuous integration, release jobs, and
  Electron clean-start workflow through that verified install.
- Added Codex cloud setup and maintenance caching. Package lifecycle processes receive a reduced
  environment and cached resumes reinstall only when Node, npm, the lockfile, or selected
  manifests change.
- Reduced the agent-container install to the root, backend, and frontend workspaces. Electron
  dependencies and desktop packaging remain host-only.
- Baked safe-chain at a reviewed version into the root-owned image, moved trusted binaries before
  the writable global-tool path, and made missing or failed wrapper setup abort startup.
- Updated React Router to v7, Tailwind/PostCSS to v4, and the related TypeScript, Vite, lint, test,
  and React code required by the current toolchain.

## Validation

- Backend: 64 files and 620 tests passed; lint, typecheck, and production build passed.
- Frontend: 44 files and 526 tests passed; lint, typecheck, and production build passed.
- npm audit reported zero known vulnerabilities.
- The focused cloud dependency test covered cache reuse, lockfile invalidation, missing workspace
  links, setup-secret filtering, proxy forwarding, and fail-before-npm handling for an added Git
  dependency.
- A real apple/container first-run lifecycle installed only the selected workspaces and passed the
  post-create, post-start, and binary-pin gates. Provider login was intentionally left to the user.
- Codex Security scan `23f28ca6-e128-42c3-befe-5b44c03c16e3` reviewed the frozen 38-path patch and
  reported no findings. The later installer, CI, and documentation convergence changes received a
  separate final review.

## Documentation Impact

Updated the setup, deployment, devcontainer, scripts, architecture, common-task, onboarding, and
root guidance to use the verified install path and React Router v7. There was no API contract,
service flow, middleware, persistence, or WebSocket change, so OpenAPI, inline architecture
diagrams beyond command labels, and `docs/flow-visualizer.html` did not require structural changes.

## Related

- [[docs/guides/setup|Setup Guide]]
- [[docs/guides/deployment|Deployment Guide]]
- [[docs/guides/devcontainer|Devcontainer Guide]]
- [[docs/reference/scripts|Scripts Reference]]
- [[docs/architecture/frontend-architecture|Frontend Architecture]]
