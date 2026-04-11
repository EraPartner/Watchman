# Coverage Loop Runbook (Safe)

## Objective

Iteratively improve test coverage using `/test-coverage` until the suite is in good shape while preserving stability.

## Pattern and Mode

- Pattern: `sequential`
- Mode: `safe`
- Model strategy: use strong model for planning/analysis, standard model for implementation/test additions.

## Repository Strategy

- Current branch is `main` and worktree is dirty.
- User constraint: no additional copied directories/worktrees.
- Use an in-place isolated branch:
  - Branch: `coverage/loop-2026-04-11`
  - Keep unrelated local changes untouched.
  - Restrict loop changes to test and docs paths only.

## Safety Preconditions

1. Test suites must pass before first iteration.
2. `ECC_HOOK_PROFILE` must not be globally disabled.
3. Explicit stop condition must be active.

## Preflight Status (2026-04-11)

- Frontend tests: pass (`179/179`)
- Backend tests: pass (`93/93`)
- Coverage baseline recorded in:
  - `.claude/plans/coverage-loop-baseline-2026-04-11.json`
- `ECC_HOOK_PROFILE`: unset in current shell (acceptable; default profile applies)
- `ECC_DISABLED_HOOKS`: unset

## Loop Restart Preflight (2026-04-11, safe mode)

- Invocation: `/loop-start sequential --mode safe`
- Isolation constraint enforced: **branch-only strategy**, no additional copied directories/worktrees.
- Branch/worktree verification:
  - `git branch --show-current && git worktree list`
  - Result: current branch `coverage/loop-2026-04-11`, single worktree at repo root.
- Rollback path verification:
  - `git cat-file -t 5dc9b5e`
  - Result: `commit` (baseline commit is available).
- Quality gates verification (current):
  - Frontend coverage gate:
    - Command: `npm run test:coverage --workspace=apps/frontend`
    - Result: ✅ `33/33` files, `181/181` tests passed.
    - Coverage: branches `85.22`, functions `75.53`.
  - Backend functionality gate (**required preflight check**):
    - Command: `node --test tests/*.test.js --test-reporter=spec --test-reporter-destination=stdout` (from `apps/backend`)
    - Result: ✅ `93/93` tests passed.
  - Backend coverage verification:
    - Command: `node --test --experimental-test-coverage tests/*.test.js` (from `apps/backend`)
    - Result: ✅ all files lines `98.29`, branches `93.46`, functions `95.92`.
- Eval baseline artifact check:
  - `.claude/plans/coverage-loop-baseline-2026-04-11.json` exists and references baseline commit `5dc9b5e`.

## Iteration Protocol

For each iteration:

1. Run `/test-coverage` and capture low-coverage targets.
2. Select 1-2 high-value files (business-critical first).
3. Add/adjust tests only (no production refactors unless required for testability).
4. Run targeted tests.
5. Run full workspace tests and coverage.
6. Update coverage baseline artifact.
7. Run `watchman-kb-updater`.
8. Record iteration summary in this runbook.

## Stop Condition

Stop loop when **any** is true:

1. Frontend branch coverage >= `85` and function coverage >= `80`.
2. Critical files reach >= `85` line coverage.
3. Two consecutive iterations improve overall coverage by < `0.5` points.
4. Max iterations reaches `8`.
5. Any quality gate fails and cannot be fixed within one iteration.

## Commands

### Start (isolation)

```bash
git switch coverage/loop-2026-04-11
export ECC_HOOK_PROFILE=standard
```

### Optional guardrail for staged loop scope

```bash
git status -sb
```

### First preflight on loop branch

```bash
node /opt/homebrew/lib/node_modules/npm/bin/npm-cli.js run test --workspace=apps/frontend
node --test tests/*.test.js --test-reporter=spec --test-reporter-destination=stdout
node /opt/homebrew/lib/node_modules/npm/bin/npm-cli.js run test:coverage --workspace=apps/frontend
node --test --experimental-test-coverage tests/*.test.js
```

### Iterate

```bash
/test-coverage
```

### Monitor

```bash
git status -sb
node /opt/homebrew/lib/node_modules/npm/bin/npm-cli.js run test:coverage --workspace=apps/frontend
node --test --experimental-test-coverage tests/*.test.js
```

### Stop and clean up

```bash
git switch main
```

## Iteration Log

### Iteration 1 (2026-04-11)

- Scope: `apps/frontend/src/components/LiveServerDashboard.test.tsx`
- Action: Added high-value tests for multi-instance rendering, stacked tile paths, adguard overview/network cards, and timer-driven last-updated path.
- Verification:
  - Targeted: `npx vitest run apps/frontend/src/components/LiveServerDashboard.test.tsx` ✅ (11/11)
  - Frontend full: `npm run test:coverage --workspace=apps/frontend` ✅ (181/181)
  - Backend regression: `node --test tests/*.test.js --test-reporter=spec --test-reporter-destination=stdout` ✅ (93/93)
- Coverage outcome:
  - Frontend branch: **85.22** (baseline 80.60, +4.62)
  - Frontend functions: **75.53** (baseline 73.38, +2.15)
  - `LiveServerDashboard.tsx` lines: **95.74**
  - `useWebSocket.ts` lines: **88.44**
  - `UpdateBadge.tsx` lines: **85.71**
  - `ServiceLink.tsx` lines: **96.29**

### Stop Decision

Loop stopped after Iteration 1 because runbook stop condition was met:

- Critical files reached >=85 line coverage.
- Frontend branch coverage reached >=85.
