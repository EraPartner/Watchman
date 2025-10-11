# Watchman Project Structure

Last updated: October 11, 2025

## Overview

Watchman is organized as a modern **npm workspaces monorepo** with clear separation between applications, documentation,
tools, and tests.

## Directory Structure

```
Watchman/
│
├── apps/                           # Applications
│   ├── frontend/                   # React frontend application
│   │   ├── src/                   # Frontend source code
│   │   │   ├── components/        # React components
│   │   │   ├── pages/            # Page components
│   │   │   ├── hooks/            # Custom React hooks
│   │   │   ├── services/         # API client services
│   │   │   ├── lib/              # Utilities and helpers
│   │   │   ├── types/            # TypeScript type definitions
│   │   │   └── utils/            # Utility functions
│   │   ├── public/               # Static assets
│   │   ├── index.html            # HTML entry point
│   │   ├── vite.config.ts        # Vite configuration
│   │   ├── tailwind.config.ts    # Tailwind CSS config
│   │   ├── tsconfig.json         # TypeScript config
│   │   ├── postcss.config.js     # PostCSS config
│   │   ├── components.json       # shadcn/ui config
│   │   └── package.json          # Frontend dependencies
│   │
│   └── backend/                   # Node.js backend application
│       ├── services/             # Service modules
│       │   ├── AdGuardService.js
│       │   ├── BitcoinService.js
│       │   ├── RouterService.js
│       │   ├── SynologyService.js
│       │   ├── TorService.js
│       │   └── ...
│       ├── middleware/           # Express middleware
│       │   ├── auth.js          # JWT authentication
│       │   ├── rateLimiting.js  # Rate limiting
│       │   ├── securityHeaders.js
│       │   ├── validation.js
│       │   └── ...
│       ├── config/              # Configuration files
│       │   └── ip-control.json
│       ├── logs/                # Log files
│       │   └── audit/          # Audit logs
│       ├── server.js           # Main server file
│       ├── config.js           # Configuration loader
│       ├── openapi.yaml        # OpenAPI specification
│       └── package.json        # Backend dependencies
│
├── docs/                         # Documentation
│   ├── INDEX.md                 # Documentation index
│   ├── ARCHITECTURE.md          # System architecture
│   ├── API-DOCUMENTATION.md     # API documentation
│   ├── DEVELOPMENT.md           # Development guide
│   ├── DEPLOYMENT.md            # Deployment guide
│   ├── SECURITY.md              # Security documentation
│   ├── TROUBLESHOOTING.md       # Troubleshooting guide
│   ├── CONTRIBUTING.md          # Contribution guidelines
│   ├── TODO.md                  # Future enhancements
│   ├── OPTIMIZATIONS.md         # Performance optimizations
│   └── CLEANUP-SUMMARY.md       # Project cleanup notes
│
├── tools/                        # Development tools & scripts
│   ├── start-dev.sh             # Start development servers
│   ├── start-backend.sh         # Start backend only
│   ├── start-frontend.sh        # Start frontend only
│   └── check-router.js          # Router health check utility
│
├── packages/                     # Shared packages
│   └── shared/                  # Shared utilities (future)
│       └── (for shared code between apps)
│
├── tests/                        # Integration & E2E tests
│   └── (test files)
│
├── .github/                      # GitHub configuration
│   └── workflows/               # GitHub Actions workflows
│       └── ci.yml
│
├── .well-known/                  # Well-known URIs
│   └── (security.txt, etc.)
│
├── dist/                         # Build output (gitignored)
├── node_modules/                 # Dependencies (gitignored)
│
├── .editorconfig                # Editor configuration
├── .prettierrc                  # Prettier configuration
├── .prettierignore              # Prettier ignore rules
├── .gitignore                   # Git ignore rules
├── package.json                 # Root workspace config
├── package-lock.json            # Dependency lock file
├── README.md                    # Project overview
├── LICENSE                      # MIT License
└── PROJECT-STRUCTURE.md         # This file

```

## Key Principles

### 1. **Monorepo with npm Workspaces**

- All applications are in `apps/` directory
- Each app has its own `package.json`
- Shared dependencies are hoisted to root
- Use `npm run <script> --workspace=apps/<app>` for app-specific commands

### 2. **Clear Separation of Concerns**

- **apps/**: Application code
- **docs/**: All documentation
- **tools/**: Scripts and utilities
- **packages/**: Shared libraries (for future use)
- **tests/**: Integration and E2E tests

### 3. **Configuration Co-location**

- Each app contains its own configuration files
- No scattered config files in the root
- Environment-specific configs stay with the app

### 4. **Scalable Structure**

- Easy to add new apps to `apps/`
- Easy to add shared packages to `packages/`
- Clear boundaries between modules

## Working with the Monorepo

### Install Dependencies

```bash
# Install all workspace dependencies
npm install
```

### Run Commands in Workspaces

```bash
# Run in specific workspace
npm run dev --workspace=apps/frontend
npm run dev --workspace=apps/backend

# Or use convenience scripts from root
npm run dev:frontend
npm run dev:backend

# Run in all workspaces
npm run lint --workspaces
```

### Add Dependencies

```bash
# Add to frontend
npm install <package> --workspace=apps/frontend

# Add to backend
npm install <package> --workspace=apps/backend

# Add to root (dev dependencies)
npm install -D <package> -w
```

## Migration Notes

This structure was reorganized on October 11, 2025, to follow modern monorepo best practices:

- Moved from flat structure to workspace-based monorepo
- Separated frontend and backend into `apps/` directory
- Consolidated documentation in `docs/`
- Moved utility scripts to `tools/`
- Removed duplicate configuration files
- Updated all import paths and references

## Future Enhancements

- Add `packages/shared` for common utilities
- Add `packages/types` for shared TypeScript types
- Add `packages/config` for shared configuration
- Implement Turborepo or Nx for better build caching
- Add workspace-specific test configurations
