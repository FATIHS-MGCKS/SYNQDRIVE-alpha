# Bookings — Production Baseline (read-only)

| Field | Value |
|-------|-------|
| **Captured** | 2026-11-19T08:58:00Z |
| **PRODUCTION_ACCESS** | `VERIFIED_READ_ONLY` |
| **Host** | `srv1374778.hstgr.cloud` (SSH as `synqdrive-admin`) |
| **Active release** | `/opt/synqdrive/current` |
| **Deployed Git SHA** | `1e6a267c8c7951e2a11633e89ab96714844ea846` |
| **Repository `origin/main` at audit** | `41fd912aacbefeb20ec238bc481b5505f943b65e` |
| **Drift** | **Yes** — Production behind main (P6-PR3 and other commits not observed on deployed SHA) |

## Observations (no secrets, no PII)

| Check | Result | Epistemic |
|-------|--------|-----------|
| `bookings.controller.ts` on release tree | Present | CONFIRMED |
| Public health `GET /api/v1/health` | `status: ok` | CONFIRMED |
| PM2 process list (non-root view) | Empty table | UNKNOWN — alternative supervisor possible |
| Bounded `SELECT COUNT(*) FROM bookings` | Not executed | UNKNOWN |

## Non-claims

- No production validation of booking flows.
- No claim that ProductLicenseGuard (P6-PR3) is active on Production until drift is resolved and re-verified.