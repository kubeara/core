# Kubeara Console App

React + TypeScript console application for deploying infrastructure templates.

## Getting started

```bash
npm install
cp .env.example .env   # optional: set VITE_API_URL for an external API
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

In development, a seeded test account is available (see the login page hint).

### API URL

All HTTP requests go through `apiFetch()` / React Query hooks in `src/api/`. Set the base URL in `.env`:

```bash
# Same origin (default) — Vite dev middleware serves /api/*
VITE_API_URL=

# External backend
VITE_API_URL=https://api.example.com
```

Paths stay relative (`/api/auth/me`, `/api/servers`, etc.); only the origin changes.

### Docker runtime config

In Docker/Nginx deployments, `VITE_API_URL` is injected at container startup into `/env.js`
and read by the app at runtime (`window.__KUBEARA_CONFIG__.VITE_API_URL`), so the same image
can be reused across environments.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite dev server with API middleware |
| `npm run build` | Typecheck and build static assets to `dist/` |
| `npm run start` | Preview production build (port 3000) |
| `npm run lint` | Run ESLint |

## Git hooks

- **pre-commit**: lint-staged, full-project lint, then build
- **commit-msg**: conventional commits via commitlint
