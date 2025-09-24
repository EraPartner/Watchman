# Watchman Dashboard

A unified dashboard for monitoring and managing your self-hosted services.

## Overview

**Watchman** is a web-based dashboard built with React, TypeScript, Vite, shadcn-ui, and Tailwind CSS. It provides a single interface to view the status and key metrics of your self-hosted infrastructure and services.

## Supported Services

This dashboard is designed to connect to and display information from a variety of self-hosted services, including:

- **AdGuard Home**: Network-wide ad and tracker blocking
- **Synology NAS**: Storage, health, and usage monitoring
- **Tor Node**: Status and traffic metrics
- **Bitcoin Core**: Node status, block height, and sync progress
- **qBittorrent**: Torrent client status and activity
- **(Planned)**: Add support for more services as needed

## Features

- Real-time status and health checks for each service
- Unified, responsive UI for desktop and mobile
- Modular component-based architecture for easy extension
- Customizable and themeable with Tailwind CSS

## Getting Started

1. **Clone the repository:**
   ```sh
   git clone <YOUR_GIT_URL>
   cd <YOUR_PROJECT_NAME>
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Start the development server:**
   ```sh
   npm run dev
   ```
4. **Open your browser:**
   Visit [http://localhost:5173](http://localhost:5173) to view the dashboard.

## Project Structure

```
src/
  components/    # UI components (cards, status badges, etc.)
  pages/         # Page components
  data/          # Mock and real service data
  hooks/         # Custom React hooks
  lib/           # Utility functions
  types/         # TypeScript types
```

## Tech Stack

- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/)
- [shadcn-ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](LICENSE)

## Useful NPM scripts

- npm run dev — start frontend dev server (Vite)
- npm run dev:backend — start backend with nodemon (from /backend)
- npm run dev:both — run frontend and backend concurrently
- npm run build — build the frontend
- npm run format — format the repo with Prettier
- npm run format:check — check formatting
- npm run lint — run ESLint
- npm run check:types — run TypeScript type-check (noEmit)
- npm run ci — run lint, format check, and types (suitable for CI)

## Backend environment

The backend loads environment variables from `backend/.env.local` (server uses dotenv). A sample file is provided at `backend/.env.example`. Copy it to `.env.local` and update values for your environment. Keep secrets out of version control.
