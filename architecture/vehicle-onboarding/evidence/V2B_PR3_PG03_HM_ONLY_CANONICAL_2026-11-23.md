# V2B-PR3 — PG-03 HM_ONLY canonical PostgreSQL certification

**Status:** IMPLEMENTED (repository); CI-gated via `V2B_HM_ONLY_CANONICAL_PG=1` on disposable PostgreSQL (VO-5B workflow gate).

**Prerequisite:** V2B-PR2 merged ([#2510](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2510) @ `4fb755fed6b664b16b85be005a98557a91a9e8f5`).

## Scope

- Real `HmOnlyCanonicalRegistrationService` against isolated Prisma/PostgreSQL (no Prisma mocks).
- Reuses `createHmOnlyCanonicalPgHarness`, VO-4 production fail-closed readiness, VO-5B registry outbox processor.
- **Not in scope:** production flag arm (`VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED` remains default OFF), Stripe mutations, OWN-3 activation, V2B-PR4.

## Test matrix (PG-03 A–N)

| ID | Topic |
|----|--------|
| A | Happy path: vehicle, HM mirror REGISTERED, completed case, source link, single `VEHICLE_ACTIVATED` outbox |
| B | Idempotent re-register |
| C | Concurrent register (dual `PrismaClient`) |
| D | Billing outbox processor idempotency (no duplicate quantity events) |
| E–L | Security regressions (tenant, clearance, missing mirror, duplicate VIN, serviceEventId, battery substantiation, OFFBOARDED VIN, missing entitlement) |
| M | REGISTERED HM idempotent resume (no duplicate outbox) |
| N | Activation fault `AFTER_MIRROR_UPDATE` rollback + successful retry via canonical register |

## Gates

- Env: `V2B_HM_ONLY_CANONICAL_PG=1`
- CI: `backend/scripts/test/vo5b-vehicle-onboarding-postgres-ci.sh` → `npm run test:vehicle-onboarding:v2b-hm-only-pg03:postgres`
- Workflow: `.github/workflows/vehicle-onboarding-vo5b-postgres-ci.yml`

## OWNER decisions

OWN-1..OWN-6 remain **OWNER_APPROVAL_REQUIRED**; PG-03 does not claim production certification or flag activation.