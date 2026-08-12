# Phase 3 – E5A Data Quality, Freshness & Lineage — Test Report (2026-08)

- `TESTED_CODE_SHA` = `07e7e59aa2f3b2d4bb0c638ec285ca82d81a22c4`
- `E5_BASE_MAIN_SHA` = `960365a9b095a54f4656947ac2067a104e56bd8a`
- Branch `integration/evaluations-e5-quality-privacy-authorization-audit-2026-08`. No schema change.

## Suites & counts

| Suite | Tests | Result |
|---|---|---|
| `e5/domain/evaluations-quality.domain.spec.ts` | 15 | PASS |
| `e5/evaluations-quality.service.spec.ts` | 5 | PASS |
| `e5/evaluations-quality.postgres.integration.spec.ts` (live DB) | 3 | PASS |
| **E5A total** | **23** | **PASS** |

Full evaluations regression (E1+E2+E3+E4+E5): `npx jest src/modules/evaluations-metrics src/modules/evaluations-analytics src/modules/evaluations-finance` → 34 passed suites, **415 passed, 4 skipped, 0 failed**.

## Mandatory coverage (STEP 18)

- fresh source → FRESH; stale source → STALE; missing source → UNKNOWN (never healthy) — domain + service.
- PARTIAL coverage preserved (missing sources / ratio<1 → COMPLETENESS PARTIAL); truly complete coverage → COMPLETE — domain + service.
- historical period vs current snapshot: freshness measured against period end for historical, `evaluatedAt` for current — domain + service.
- event/business time vs ingestion time: source business timestamps used, not `createdAt` — repository + matrix.
- unavailable source ≠ zero; quality wrapper does not upgrade status — service.
- cross-tenant lineage: ORG_A finance freshness never reflects ORG_B invoices (live DB) — integration.
- station-scoped lineage: no org-wide freshness/lineage read; no lineage emitted — service.
- deterministic result; E4 PARTIAL preservation — domain + service.

## Real PostgreSQL tests

Env-gated (`EVALUATIONS_E4_POSTGRES_INTEGRATION=1`) against a live Postgres (`prisma db push`ed schema), reusing the E4 tenant fixture harness:
- ORG_A finance freshness ignores a newer ORG_B invoice (tenant isolation).
- maintenance/damage freshness reflects only same-tenant rows.
- a tenant with no in-window source → `newestMs = null` (UNKNOWN upstream), never fabricated.

## Regression (no regression)

- E1: metric status/PARTIAL, calculationVersion sync, period/timezone, money, registry, mirror — PASS.
- E2: tenant/station scope, HTTP security, entity-reference — PASS.
- E3: money, fx, finance controller, receivables/multi-currency — PASS.
- E4: cost provenance, utilization PARTIAL/false-zero, detection coverage, historical telemetry, real-Postgres adversarial — PASS.

## Quality gates

| Gate | Result |
|---|---|
| Backend typecheck (`tsc -p tsconfig.build.json --noEmit`) | PASS |
| Backend build (`nest build`) | PASS |
| Prisma validate | Valid; no schema diff |
| Lint (E5 files) | PASS |
| Frontend typecheck (`tsc -b`) | PASS |

Pre-existing global-red CI gates (Typecheck-with-specs `billing`/`workflows`, `lint:all`, integration/migration `vehicle_trips`, dependency scan, Playwright) remain `PRE_EXISTING_IDENTICAL`/`ENVIRONMENT_SPECIFIC` vs `E5_BASE_MAIN_SHA`; none touch evaluations. `NEW_E5_FAILURE_COUNT = 0`, `UNKNOWN_COUNT = 0`.

## Counters (all 0)

| Counter | Value |
|---|---|
| PARALLEL_QUALITY_TRUTH_COUNT | 0 |
| UNSUPPORTED_GLOBAL_QUALITY_SCORE_COUNT | 0 |
| CURRENT_STATE_AS_HISTORICAL_QUALITY_COUNT | 0 |
| FALSE_FULL_COVERAGE_COUNT | 0 |
| QUALITY_FALSE_ZERO_COUNT | 0 |
| QUALITY_STATUS_UPGRADE_COUNT | 0 |
| CROSS_TENANT_LINEAGE_LEAKAGE_COUNT | 0 |
| STATION_LINEAGE_SCOPE_LEAKAGE_COUNT | 0 |
| QUALITY_METADATA_PII_DUPLICATION_COUNT | 0 |
| NON_DETERMINISTIC_QUALITY_COUNT | 0 |
| E6_SCOPE_LEAK_COUNT | 0 |
| E7_SCOPE_LEAK_COUNT | 0 |
| E8_SCOPE_LEAK_COUNT | 0 |
| E9_SCOPE_LEAK_COUNT | 0 |
| NEW_E5_FAILURE_COUNT | 0 |
| UNKNOWN_COUNT | 0 |

## Deferred

E5B (privacy/GDPR), E5C (roles/permissions, audit logging), E6–E9 — not started.
