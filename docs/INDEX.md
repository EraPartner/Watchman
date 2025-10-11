# Watchman Documentation Index

Welcome to the Watchman documentation! All project documentation is centralized in this `/docs` directory for easy
access and maintenance.

## 📚 Documentation Structure

### Getting Started

- **[../README.md](../README.md)** - Project overview and quick start guide
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Development setup and guidelines
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deployment instructions

### Architecture & Design

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture and design decisions
- **[PROJECT-STRUCTURE.md](./PROJECT-STRUCTURE.md)** - Detailed project structure guide
- **[API-DOCUMENTATION.md](./API-DOCUMENTATION.md)** - API endpoints and specifications

### Project History & Planning

- **[CHANGELOG.md](./CHANGELOG.md)** - Version history and changes
- **[REORGANIZATION.md](./REORGANIZATION.md)** - Recent project restructuring details
- **[CLEANUP-COMPLETE.md](./CLEANUP-COMPLETE.md)** - Cleanup summary
- **[TODO.md](./TODO.md)** - Future enhancements and roadmap

### Security & Best Practices

- **[SECURITY.md](./SECURITY.md)** - Security features and best practices
- **[SECURITY-ENHANCEMENTS 2.md](./SECURITY-ENHANCEMENTS 2.md)** - Additional security documentation

### Optimization & Maintenance

- **[OPTIMIZATIONS.md](./OPTIMIZATIONS.md)** - Performance optimizations
- **[CLEANUP-SUMMARY.md](./CLEANUP-SUMMARY.md)** - Code cleanup notes

### Community & Support

- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - How to contribute to the project
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues and solutions

## 🗂️ Project Organization

The Watchman project follows a modern monorepo structure:

```
Watchman/
├── apps/                    # Applications
│   ├── frontend/           # React frontend
│   └── backend/            # Node.js backend
├── docs/                   # 📖 All documentation (you are here!)
├── tools/                  # Development scripts
├── packages/               # Shared packages
└── tests/                  # Tests
```

## 🔍 Quick Links

### For Developers

- [Development Setup](./DEVELOPMENT.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [API Documentation](./API-DOCUMENTATION.md)
- [Contributing Guidelines](./CONTRIBUTING.md)

### For Deployers

- [Deployment Guide](./DEPLOYMENT.md)
- [Security Configuration](./SECURITY.md)
- [Troubleshooting](./TROUBLESHOOTING.md)

### For Project Maintainers

- [Project Structure](./PROJECT-STRUCTURE.md)
- [Changelog](./CHANGELOG.md)
- [TODO & Roadmap](./TODO.md)
- [Optimizations](./OPTIMIZATIONS.md)

## 📝 Documentation Standards

All documentation follows these principles:

- **Clear and concise** - Easy to understand
- **Up-to-date** - Reflects current state
- **Centralized** - Everything in `/docs`
- **Well-organized** - Logical structure
- **Cross-referenced** - Links between docs

## 🤝 Contributing to Docs

Found an issue or want to improve documentation? See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on updating
docs.

---

**Last updated:** October 11, 2025  
**Project structure:** Monorepo with npm workspaces
