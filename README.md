# Watchman

A centralized dashboard to monitor and control self-hosted services (AdGuard Home, Synology, Tor, Bitcoin, qBittorrent,
and more).

## 📁 Project Structure

This is a modern monorepo structure using npm workspaces:

```
Watchman/
├── apps/                    # Application packages
│   ├── frontend/           # React + TypeScript + Vite frontend
│   └── backend/            # Node.js + Express backend
├── docs/                   # All documentation
├── tools/                  # Development tools & scripts
├── packages/               # Shared packages (future use)
└── tests/                  # Integration & E2E tests
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Git

### Installation

```bash
# Clone the repository
git clone <YOUR_REPO_URL>
cd Watchman

# Install all dependencies (uses npm workspaces)
npm install

# Start both frontend and backend in development mode
npm run dev
```

### Development Commands

```bash
# Start both frontend and backend
npm run dev

# Start frontend only (port 5173)
npm run dev:frontend

# Start backend only (port 3001)
npm run dev:backend

# Build frontend for production
npm run build

# Run linters
npm run lint

# Format code with Prettier
npm run format

# Run tests
npm run test

# Clean all node_modules
npm run clean
```

## 📦 Workspace Structure

This project uses **npm workspaces** to manage multiple packages in a monorepo:

- **apps/frontend**: React application with Vite
- **apps/backend**: Express.js API server
- **packages/shared**: Shared utilities (future use)

Each workspace has its own `package.json` and can be developed independently.

## 🔧 Configuration

- **Frontend config**: `apps/frontend/` (vite.config.ts, tailwind.config.ts, etc.)
- **Backend config**: `apps/backend/config.js`
- **Environment variables**: `.env.local` (root level)
- **Editor config**: `.editorconfig`, `.prettierrc` (root level, applies to all)

## 📚 Documentation

Comprehensive documentation is available in the **`/docs`** directory:

- **[docs/INDEX.md](./docs/INDEX.md)** - Documentation index
- **[docs/PROJECT-STRUCTURE.md](./docs/PROJECT-STRUCTURE.md)** - Detailed structure guide
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Architecture overview
- **[docs/API-DOCUMENTATION.md](./docs/API-DOCUMENTATION.md)** - API documentation
- **[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)** - Development guide
- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** - Deployment guide
- **[docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** - Troubleshooting
- **[docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)** - Contributing guidelines
- **[docs/SECURITY.md](./docs/SECURITY.md)** - Security documentation
- **[docs/CHANGELOG.md](./docs/CHANGELOG.md)** - Change history

### Multi-Instance Support

Monitor multiple instances of the same service:

- **[docs/MULTI-INSTANCE-QUICKSTART.md](./docs/MULTI-INSTANCE-QUICKSTART.md)** - Quick start guide
- **[docs/MULTI-INSTANCE-SERVICES.md](./docs/MULTI-INSTANCE-SERVICES.md)** - Full documentation
- **[docs/MULTI-INSTANCE-EXAMPLE.md](./docs/MULTI-INSTANCE-EXAMPLE.md)** - Configuration examples
- **[docs/MULTI-INSTANCE-IMPLEMENTATION.md](./docs/MULTI-INSTANCE-IMPLEMENTATION.md)** - Implementation details

## 🔐 Security

This project includes comprehensive security features:

- JWT authentication
- Rate limiting
- CSRF protection
- Input sanitization
- Security headers (Helmet)
- Audit logging
- Account lockout protection

See [docs/SECURITY.md](./docs/SECURITY.md) for more details.

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode (frontend)
npm run test --workspace=apps/frontend -- --watch
```

## 📝 License

MIT

## 🤝 Contributing

See [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) for contribution guidelines.
