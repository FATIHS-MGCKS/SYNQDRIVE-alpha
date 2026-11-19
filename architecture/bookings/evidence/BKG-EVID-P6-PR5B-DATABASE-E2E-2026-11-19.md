# P6-PR5B — Database-backed rental booking handover HTTP E2E

**Date:** 2026-11-19 (Europe/Berlin)  
**Epistemic:** CONFIRMED (preflight unit + build) / CONFIRMED (disposable Postgres HTTP @ `321f0e3a`) / NOT_CLAIMED (Production)  
**Review remediation:** F1–F4 independent review (same date); CI green 2026-11-19 — [run 44522469037](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/actions/runs/44522469037)

## Certification scope (F4 — mandatory distinction)

| Tier | Meaning | P6-PR5B claim |
|------|---------|---------------|
| **DATABASE_HANDOVER_E2E_VERIFIED** | Disposable Postgres + Nest HTTP for pickup/return on **seeded CONFIRMED** bookings + Prisma reload asserts | **YES** — job `P6-PR5B rental booking disposable PostgreSQL`; 11/11 Jest @ `321f0e3a` |
| **FULL_RENTAL_LIFECYCLE_DATABASE_E2E_VERIFIED** | Wizard → pricing → eligibility → confirm → payment → documents → handover over HTTP/Postgres | **NOT_CLAIMED** — suite does not create bookings via wizard HTTP |
| **P6-PR5 workflow (prior)** | In-memory / unit harness for wizard, payment intent, invoice consistency | **Unchanged** — see [`BKG-EVID-P6-PR5-WORKFLOW-CERTIFICATION-2026-11-19.md`](BKG-EVID-P6-PR5-WORKFLOW-CERTIFICATION-2026-11-19.md) |

Explicit non-claims: Stripe capture, Redis/Bull queue durability, async document generation workers, Driving Intelligence assessment completion.

## Isolation (fail-closed, F2)

| Gate | Implementation |
|------|------------------|
| Opt-in env | `RENTAL_BOOKING_LIFECYCLE_POSTGRES_INTEGRATION=1` |
| Preflight before Prisma | `assertP6Pr5bDisposablePostgresPreflight()` then `assertP6Pr5bPostgresReachable()` in `beforeAll` |
| Unreachable DB with opt-in | `beforeAll` throws — **no** per-test `return` skip paths |
| Regression | `p6-pr5b-disposable-postgres-preflight.spec.ts` — unreachable host on `:1` rejects |
| Host allowlist | `127.0.0.1`, `localhost`, `postgres` |
| DB name allowlist | `p6_pr5b_test_*`, `synqdrive_p6_pr5b_rental_e2e`, `synqdrive_ci_ephemeral` |
| Production forbid | URL patterns: `production`, `staging`, `app.synqdrive`, `srv1374778`, `hstgr.cloud`, `mein-vps` |
| Migrations | `prisma-migrate-deploy-resilient.sh` against **newly created** disposable DB only (`CREATE DATABASE` in CI script) |

## Handover HTTP coverage (when CI green)

| Area | LIVE tests |
|------|------------|
| License / entitlement | 403 without ACTIVE RENTAL; TRIAL blocked |
| Tenant isolation | Cross-org booking 404 |
| Pickup gate | Blocked without document bundle |
| Handover FSM | CONFIRMED → ACTIVE → COMPLETED via HTTP; vehicle RENTED → AVAILABLE |
| Idempotency | Duplicate pickup — single protocol row |
| RDA trigger | `enqueueForBooking` on RETURN; mock `NO_ANCHOR_TRIP` |
| RDA failure | Enqueue reject does not roll back COMPLETED |

## RDA honesty tiers

| Tier | P6-PR5B claim |
|------|---------------|
| Trigger invoked | Yes (HTTP return handover) |
| Job durably enqueued | **NOT_CLAIMED** |
| Worker processed job | **NOT_CLAIMED** |
| Assessment completed | **NOT_CLAIMED** |

## CI execution (F1)

| Item | Value |
|------|-------|
| Workflow | `.github/workflows/p6-pr5b-rental-booking-postgres-ci.yml` |
| Job name | `P6-PR5B rental booking disposable PostgreSQL` |
| Command | `bash backend/scripts/test/rental-booking-lifecycle-postgres-ci.sh` |
| Success proof | Jest summary **11 passed** (4 preflight + 7 HTTP); script fails on mismatch or missing Postgres |

## Certification verdict

| Layer | Verdict |
|-------|---------|
| UNIT_VERIFIED | Yes — preflight + fail-closed reachability spec |
| INTEGRATION_VERIFIED | Partial — handover HTTP subset; P6-PR5 unchanged |
| DATABASE_HANDOVER_E2E_VERIFIED | **YES** (GitHub Actions @ `321f0e3a`) |
| FULL_RENTAL_LIFECYCLE_DATABASE_E2E_VERIFIED | **NOT_CLAIMED** |
| DATABASE_E2E_VERIFIED (legacy label) | Use **DATABASE_HANDOVER_E2E_VERIFIED** — do not conflate with full lifecycle |
| ASYNC_WORKER_VERIFIED | **NOT_CLAIMED** |
| PRODUCTION_VALIDATED | **NOT_CLAIMED** |

## Validation commands

```bash
cd backend && npm test -- --testPathPatterns=p6-pr5b-disposable-postgres-preflight
cd backend && npm run build
cd backend && npm run test:bookings:p6-pr5b:postgres:ci
bash architecture/scripts/validate-module-registry.sh
bash architecture/bookings/scripts/validate-graph.sh
```

## Nest HTTP test harness

`p6-pr5b-bookings-http-nest.harness.ts` mounts `BookingsController` with real `BookingsHandoverService`, pickup gate, and document completeness on Prisma (no full `BookingsModule` graph). Pickup eligibility enforcement is stubbed so CI focuses on handover persistence and document gates.

## Remaining limitations

- Wizard → confirm → payment intent not exercised over HTTP/Postgres (P6-PR5 unit harness).
- Full document workers, Stripe, and live eligibility gatekeeper subgraph remain out of scope.
- Ephemeral DB may apply targeted SQL parity (`users.language` etc.) after `prisma migrate deploy` resilience — disposable DB only.

## Independent review remediation log (append-only)

| SHA | Note |
|-----|------|
| `321f0e3a` | CI 11/11 green: vehicle `station_id` seed, stations-v2 test defaults off, invoice `sentAt`, handover draft stub, negative-test FK order |

## REGISTRY_REVIEWED (F3)

| Module | Before | After | AUTHORITY_ACTIVE promotion | Result |
|--------|--------|-------|----------------------------|--------|
| Bookings | `AUDIT_IN_PROGRESS` | `AUDIT_IN_PROGRESS` | **NONE** | **CORRECTED** — prior evidence incorrectly stated `AUTHORITY_ACTIVE`; canonical registry [`SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../../SYNQDRIVE_RENTAL_ARCHITECTURE.md) row unchanged |