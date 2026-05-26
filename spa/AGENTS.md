# Kubeara SPA

React 19 + TypeScript app built with Vite. API routes run in the Vite dev/preview server middleware (`src/server/`).

## Commands

- `npm run dev` — development server (port 3000)
- `npm run build` — typecheck + production bundle
- `npm run start` / `npm run preview` — serve `dist/` with API middleware
- `npm run lint` — ESLint

Requires Node 20+ (see `.nvmrc` for recommended version).

## API configuration

Set `VITE_API_URL` in `.env` (see `.env.example`). All client requests use `apiUrl()` / `apiFetch()` from `src/lib/api-client.ts`.

## Data fetching

Use React Query hooks in `src/api/hooks/` — do not call `fetch` directly from pages/components.

- `use-auth.ts` — session, login, register, logout, password reset
- `use-servers.ts` — server list, detail, CRUD

## Structure

- `src/pages/` — route pages
- `src/components/` — UI components
- `src/api/` — API functions and React Query hooks
- `src/lib/` — shared types and utilities
- `src/server/` — API handlers (Node only; in-memory stores)
