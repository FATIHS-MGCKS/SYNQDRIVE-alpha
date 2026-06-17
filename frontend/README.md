# SynqDrive Frontend

React + Vite + TypeScript client for the SynqDrive rental and master admin surfaces.

## Stack

- React 19
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui + Radix UI

## Setup

```bash
npm install
```

Copy environment variables from the project root / backend docs. Typical local dev:

- API is proxied to the backend via Vite (`/api` → backend port, often `3001`)
- Mapbox and other provider tokens belong in env files — **never commit secrets**

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Typecheck + production build (output to `backend/public`) |
| `npm run lint` | ESLint |

## Structure

```
src/
  rental/          # Rental operator UI (dashboard, fleet, bookings, settings, …)
  master/          # Internal master / architecture / changelog views
  lib/api.ts       # Typed API client (org-scoped REST)
  components/      # Shared UI patterns
```

Settings and admin pages live under `src/rental/components/` (e.g. stations, users, data authorization). The API layer in `src/lib/api.ts` mirrors backend routes and DTOs.

## Notes

- Multi-tenant: most rental calls require an active organization context (`useRentalOrg`).
- Do not commit `.env`, API keys, or personal tokens.
