# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2025-10-11

### 🎉 Major Restructuring - Modern Monorepo Architecture

#### Added

- **npm workspaces** monorepo structure
- New `apps/` directory containing frontend and backend applications
- New `packages/` directory for future shared code
- New `tools/` directory consolidating all development scripts
- Comprehensive workspace-based package.json files
- Modern project documentation structure

#### Changed

- **Frontend** moved from root to `apps/frontend/`
    - `src/` → `apps/frontend/src/`
    - `public/` → `apps/frontend/public/`
    - `index.html` → `apps/frontend/index.html`
    - All config files moved to `apps/frontend/`
- **Backend** moved from `backend/` to `apps/backend/`
    - `backend/` → `apps/backend/`
    - All backend services, middleware, and config preserved
- **Scripts** consolidated to `tools/`
    - `scripts/` → `tools/`
    - `hardware/` → `tools/`
- **Configuration** simplified

    - Removed duplicate config files from root
    - Each app now contains its own configuration
    - Root `package.json` now manages workspaces only

- **Documentation** already well-organized in `docs/`
    - Updated README.md with new structure
    - Updated PROJECT-STRUCTURE.md with workspace details

#### Removed

- Scattered configuration files from root directory
- Duplicate `backend/` folder
- Duplicate `config/` folder
- Duplicate `scripts/` folder
- Dependencies from root package.json (moved to workspaces)

#### Migration Guide

**Old Structure:**

```
Watchman/
├── src/                    # Frontend source
├── backend/               # Backend app
├── scripts/               # Dev scripts
├── hardware/              # Utilities
├── config/                # Mixed configs
├── vite.config.ts         # Frontend config
├── tsconfig.json          # Frontend config
└── package.json           # All dependencies
```

**New Structure:**

```
Watchman/
├── apps/
│   ├── frontend/          # React app with all configs
│   └── backend/           # Node.js app with all configs
├── tools/                 # All scripts
├── docs/                  # All documentation
├── packages/              # Shared code (future)
└── package.json           # Workspace orchestration
```

**Updated Commands:**

| Old Command               | New Command                          |
|---------------------------|--------------------------------------|
| `npm run dev`             | `npm run dev` (unchanged)            |
| `npm run dev:frontend`    | `npm run dev:frontend`               |
| `npm run dev:backend`     | `npm run dev:backend`                |
| `npm run backend:install` | `npm install` (workspaces handle it) |
| `npm run setup`           | `npm install`                        |

#### Benefits

1. **Clear Separation**: Each application is self-contained
2. **Scalability**: Easy to add new apps or shared packages
3. **Modern Standards**: Follows industry best practices for monorepos
4. **Better DX**: Cleaner root directory, easier navigation
5. **Workspace Benefits**: Shared dependencies hoisted, faster installs
6. **CI/CD Ready**: Structure supports independent deployments

---

## Previous Releases

See git history for changes prior to restructuring.
