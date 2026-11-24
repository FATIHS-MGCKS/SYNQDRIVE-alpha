# V2B-PR3 — PG-03 HM_ONLY canonical PostgreSQL certification

**Status:** IMPLEMENTED (repository); CI-gated via `V2B_HM_ONLY_CANONICAL_PG=1` on disposable PostgreSQL (VO-5B workflow gate).

**PR:** [#2515](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2515) (draft) @ `060d60efab23ead504050f3ca1010911c5b9725d` (manifest regen for Production DB guard)

**Prerequisite:** V2B-PR2 merged ([#2510](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2510) @ `4fb755fed6b664b16b85be005a98557a91a9e8f5`).

## Scope

- Real `HmOnlyCanonicalRegistrationService` against isolated Prisma/PostgreSQL (no Prisma mocks).
- Reuses `createHmOnlyCanonicalPgHarness`, VO-4 production fail-closed readiness, VO-5B registry outbox processor.
- **Not in scope:** production flag arm (`VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED` remains default OFF), Stripe mutations, OWN-3 activation, V2B-PR4.

## CI post-mortem (run 45260164891 @ `1e6c4349b`)

- **Root cause:** `buildHmOnlyAdminBaselineDraft` omitted `version: 1` → admin capture `UNSUPPORTED_CONTRACT_VERSION`.
- **Secondary:** HM provider identity supplies make only; canonical path lacked governed operator **model/year** capture → readiness/activation could not complete on real PG.
- **Fixture:** PG-03-H duplicate VIN used two HM mirrors with same `(vin, package_type, source_mode)` → Prisma unique violation (fixture defect).

## Run 45264247811 @ `94b074c45` (post-repair)

- **14 / 17 PASS**, **3 FAIL** (real test assertions/fixtures, not infra):
  - **A:** wrong assertion — `providerSourceLinkId` is `VehicleDataSourceLink.id`, not case source ref id
  - **D1:** billing idempotency key used `outbox.id` instead of `outbox.eventId`
  - **J2:** fake `actorUserId` FK violation on battery reference audit rows

## Closeout @ `796a6474c`

- Integer-only year validation (no `Math.trunc`)
- **PG-03-P** legacy `HM_LEGACY_REGISTRATION_BLOCKING_CANONICAL` on PostgreSQL
- Connection identity assertions aligned to contract
- `actorUserId: null` in PG tenant access (matches VO postgres harness)
- D1 uses `eventId` + `VEHICLE_CONNECTED` count
- **18** PG integration cases (A–P incl. D1/D2, J/J2, O, N)

## CI @ `796a6474c` / `060d60ef`

| Gate | SHA | Result |
|------|-----|--------|
| VO-5B PostgreSQL (`v2b-hm-only-pg03`) | `796a6474` → `060d60ef` | **PASS** (18/18 on disposable PG) |
| Production DB guard bundle | `796a6474` | FAIL (stale manifest after `package.json` pin) |
| Production DB guard bundle | `060d60ef` | **PASS** (`update-production-database-guard-bundle-manifest.sh`) |
| Vehicle Detail — Backend unit tests | `060d60ef` | FAIL — hosted runner lost communication (~51m; step stuck `in_progress`; no Jest failure in stored logs) |
| Trip FSM — Backend R12 hardening unit | `060d60ef` | FAIL — same infrastructure class (~46m) |

**Merge readiness:** **NO_GO** — OWN-1..OWN-6 and production flag remain owner-gated; unrelated workflow reds at `060d60ef` treated as **infra flake** (diff vs green `796a6474` is manifest-only; VO-5B green on same SHA). Re-run Vehicle Detail + Trip FSM unit jobs (or empty CI retrigger) before claiming full-matrix green.

## Repair (same PR #2515)

- Admin baseline draft now includes `VEHICLE_ADMIN_BASELINE_DRAFT_VERSION`.
- `updateIdentityOperatorModelYear` capture API + DTO `model`/`year` on canonical HM register.
- PG-03 cases expanded/strengthened (17 cases): ICE happy path, billing D1/D2, BEV substantiation J/J2, operator identity O, capture-based rollback N.

## Test matrix (PG-03)

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