# P6-PR5B — Database-backed rental booking lifecycle E2E

**Date:** 2026-11-19 (Europe/Berlin)  
**Epistemic:** CONFIRMED (preflight unit + build) / CI_PENDING (disposable Postgres HTTP) / NOT_CLAIMED (Production)

## Isolation (fail-closed)

| Gate | Implementation |
|------|------------------|
| Opt-in env | `RENTAL_BOOKING_LIFECYCLE_POSTGRES_INTEGRATION=1` |
| Host allowlist | `127.0.0.1`, `localhost`, `postgres` (CI service) |
| DB name allowlist | `p6_pr5b_test_*`, `synqdrive_p6_pr5b_rental_e2e`, `synqdrive_ci_ephemeral` prefix rules |
| Production forbid | Host/url patterns: `production`, `staging`, `app.synqdrive`, `srv1374778`, `hstgr.cloud`, `mein-vps` |
| Proof artifact | `assertP6Pr5bDisposablePostgresPreflight()` + first LIVE test `records disposable DATABASE_URL isolation proof` |

## Workflow coverage (HTTP + Prisma)

| Step | Covered in P6-PR5B LIVE suite | Notes |
|------|------------------------------|-------|
| 1–4 Wizard / pricing / confirm / payment intent | **Partial (P6-PR5 unit harness)** | Not re-run over HTTP in this PR — prior certification retained |
| 5 Invoice unpaid without payment proof | P6-PR5 unit | Not duplicated |
| 6–7 Documents + pickup gate | LIVE negative + positive handover | Seeded `bookingDocumentBundle` + legal delivery evidence |
| 8–11 Pickup / ACTIVE / return / COMPLETED | LIVE HTTP handover | PostgreSQL row reload after transitions |
| 12 Vehicle RENTED → AVAILABLE | LIVE asserts on `vehicles.status` | |
| 13–14 RDA `BOOKING_COMPLETED` trigger | LIVE spy on `enqueueForBooking` | **Trigger invoked only** — mock returns `{ enqueued: false, reason: 'NO_ANCHOR_TRIP' }` |

## RDA honesty tiers

| Tier | P6-PR5B claim |
|------|----------------|
| Trigger invoked | Yes — HTTP return handover calls mocked `enqueueForBooking` |
| Job durably enqueued | **NOT_CLAIMED** (mock; no Bull/Redis) |
| Worker processed job | **NOT_CLAIMED** |
| Assessment completed | **NOT_CLAIMED** |

Documented: `NO_ANCHOR_TRIP` outcome does not roll back `COMPLETED` booking status (dedicated LIVE test with enqueue rejection).

## Negative cases (LIVE)

| Case | Test |
|------|------|
| Missing ACTIVE RENTAL | 403 on `GET /bookings` |
| TRIAL entitlement | 403 on booking read |
| Cross-organization | 404 foreign booking |
| Missing pickup prerequisites | Handover pickup blocked (no bundle) |
| Duplicate pickup | Idempotent replay — single protocol row |
| RDA enqueue failure | COMPLETED persisted |

## Certification verdict

| Layer | Verdict |
|-------|---------|
| UNIT_VERIFIED | Yes — `p6-pr5b-disposable-postgres-preflight.spec.ts` |
| INTEGRATION_VERIFIED | Partial — P6-PR5 harness + pickup gate (unchanged) |
| DATABASE_E2E_VERIFIED | **CI_PENDING** — requires `test:bookings:p6-pr5b:postgres:ci` |
| ASYNC_WORKER_VERIFIED | **NOT_CLAIMED** |
| PRODUCTION_VALIDATED | **NOT_CLAIMED** |

## Validation commands

```bash
cd backend && npm test -- --testPathPatterns=p6-pr5b-disposable-postgres-preflight
cd backend && npm run build
RENTAL_BOOKING_LIFECYCLE_POSTGRES_INTEGRATION=1 \
  DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/p6_pr5b_test_ci?schema=public \
  npm run test:bookings:p6-pr5b:postgres
# CI wrapper (disposable DB + migrate):
cd backend && npm run test:bookings:p6-pr5b:postgres:ci
```

## Remaining limitations

- Wizard → confirm → payment intent path not exercised over HTTP in disposable Postgres (covered by P6-PR5 in-memory certification).
- Full document generation workers and Stripe remain mocked / out of scope.
- Eligibility gatekeeper business negatives not expanded beyond pickup handover enforcement paths.

## REGISTRY_REVIEWED

| Module | Before | After | Result |
|--------|--------|-------|--------|
| Bookings | AUTHORITY_ACTIVE | AUTHORITY_ACTIVE | UNCHANGED — evidence append only |