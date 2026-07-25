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
  operator/        # Mobile/tablet field-ops shell at /operator (see operator/README.md)
  master/          # Internal master / architecture / changelog views
  lib/api.ts       # Typed API client (org-scoped REST)
  components/      # Shared UI patterns
```

Settings and admin pages live under `src/rental/components/` (e.g. stations, users, data authorization). The API layer in `src/lib/api.ts` mirrors backend routes and DTOs.

The **Operator** surface (`src/operator/`) is a separate route bundle for mobile/tablet field work (handover, damages, tasks, scan). It reuses rental domain hooks and canonical backend APIs — it is **not** an installable PWA today (no service worker / manifest). See `src/operator/README.md` and `docs/audits/operator-app-production-readiness-2026-07.md`.

## Notes

- Multi-tenant: most rental calls require an active organization context (`useRentalOrg`).
- Do not commit `.env`, API keys, or personal tokens.
