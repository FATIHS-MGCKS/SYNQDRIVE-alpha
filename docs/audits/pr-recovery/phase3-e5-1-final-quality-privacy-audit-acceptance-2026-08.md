# Phase 3 — E5.1 Final Quality, Privacy & Audit Acceptance (2026-08)

Branch: `integration/evaluations-e5-quality-privacy-authorization-audit-2026-08`
Draft PR: #1025 (OPEN + DRAFT — not merged, not marked ready)
Preconditions: `E5_1A_COMPLETED`, `E5_1B_COMPLETED` (both verified as ancestors).

This is an integrated acceptance pass. No new capability work was required (no
final gate exposed a defect); all changes prior to this doc are runtime-frozen.

## 1. Lineage

| Ref | SHA |
|-----|-----|
| CURRENT_MAIN_SHA | `960365a9b095a54f4656947ac2067a104e56bd8a` |
| PRE_FINAL_HEAD (local = remote = PR headRefOid) | `121e127bc9d2cde874562220fd854f448c26350d` |
| E5.1A quality/test commit `61cf4094` | ancestor: PASS |
| E5.1B runtime/test commit `a6004466` | ancestor: PASS |
| TESTED_CODE_SHA (runtime frozen for this acceptance) | `121e127bc9d2cde874562220fd854f448c26350d` |

PR state at acceptance: `{ state: OPEN, isDraft: true, baseRefName: main }`.

## 2. Quality Truth (final audit)

Verified in `e5/domain/evaluations-quality.domain.ts` + `e5/evaluations-quality.service.ts`:
- Business-event recency (`businessEventRecency.newestAt/oldestAt`) is modeled
  separately from pipeline/data freshness. Freshness is `buildUnknownFreshness`
  → state `UNKNOWN` (no authoritative ingestion/sync watermark exists on current
  main). Business recency is never presented as freshness.
- No universal freshness threshold is applied without authority; the FRESHNESS
  dimension is `UNKNOWN`, never `COMPLETE`.
- Historical periods do not use a current snapshot as historical freshness
  (freshness is structurally UNKNOWN regardless of period).
- `status` is mirrored verbatim per section; overall roll-up uses
  `rollupQualityStatus`, which is AVAILABLE only when every input is AVAILABLE and
  never upgrades PARTIAL/STALE.

BUSINESS_RECENCY_AS_FRESHNESS_COUNT = 0; UNPROVEN_FRESHNESS_AVAILABLE_COUNT = 0;
QUALITY_STATUS_UPGRADE_COUNT = 0.

## 3. Provenance (final audit)

Each composite section declares `requiredSourceClasses` and PROVENANCE is
`COMPLETE` only when all required classes are present (`provenanceState`), never
from `lineage.length > 0`. Finance requires both `FINANCE_INVOICE` and
`FINANCE_PAYMENT`, reconciling with the E3 Invoice + Payment authorities
(`financeFreshness` on `OrgInvoice`, `paymentsFreshness` on `OrgInvoicePayment`).

FALSE_COMPLETE_PROVENANCE_COUNT = 0.

## 4. Privacy (final audit)

Verified in `privacy/evaluations-privacy.policy.ts` + `.resolver.ts` +
`e4/evaluations-insights.service.ts`:
- Pseudonyms are keyed HMAC-SHA-256 `person-v1-<16 hex>` (digest only), no
  original-ID fragment, tenant/person/version domain-separated, non-reversible,
  no reverse-lookup API.
- Person-level access requires a proven authority: `full` = `customers.read` or
  admin; `pseudonymous` = `evaluations.read`; otherwise `none` (fail closed).
  `invoices.read` grants nothing person-level (only present in negative tests /
  comments).
- No unauthorized fields leave the server (tier gating applied server-side before
  any driverRef is emitted; `none` → UNAVAILABLE with empty factors).

REVERSIBLE_OR_LEAKY_PSEUDONYM_COUNT = 0;
UNPROVEN_PERSON_LEVEL_PERMISSION_GRANT_COUNT = 0;
SERVER_SENT_UNAUTHORIZED_FIELD_COUNT = 0.

## 5. Audit (final audit)

Only the canonical `BusinessAuditService` is used (`audit/evaluations-audit.service.ts`
wraps it; no parallel audit system). Successful person-level disclosure is
audit-critical: `enqueue` + `flushCritical` must durably persist before release;
on failure the service fails closed (`SENSITIVE_AUDIT_UNAVAILABLE`, no factors).
Denied access stays denied regardless of audit health. Audit metadata is non-PII
(org, actor, action, entity scope token, piiTier, stationScoped, factorCount,
calculationVersion, correlationId). Actor id comes from the resolved server
context only.

PARALLEL_AUDIT_TRUTH_COUNT = 0; SENSITIVE_DISCLOSURE_WITHOUT_DURABLE_AUDIT_COUNT = 0;
AUDIT_PII_DUPLICATION_COUNT = 0; CALLER_SUPPLIED_AUDIT_ACTOR_ACCEPT_COUNT = 0.

## 6. Real DB adversarial evidence

Env-gated `EVALUATIONS_E4_POSTGRES_INTEGRATION=1` against a live PostgreSQL 16
cluster. 4 suites / 23 tests PASS:

| Suite | Tests | Proves |
|-------|-------|--------|
| `evaluations-insights.privacy-audit.integration.spec.ts` | 8 (+1 actor) | cross-tenant person analytics isolation, cross-role authorization, pseudonym tenant isolation, canonical audit persistence, foreign audit isolation, audit-critical failure → no disclosure, same-tenant valid path, denied no PII leak, actor integrity |
| `evaluations-insights.tenant-integrity.integration.spec.ts` | — | cross-tenant relation integrity (driver/cost/utilization) |
| `evaluations-quality.postgres.integration.spec.ts` | — | cross-tenant lineage/freshness isolation |
| `evaluations-entity-reference.db-integration.spec.ts` | — | entity-reference write gate |

## 7. E1–E4 regression

Run via the broad evaluations suite (below). E1 (status/version/period/Money),
E2 (tenant/station/RBAC primitives), E3 (Finance Invoice+Payment authority),
E4 (cost provenance, utilization PARTIAL, detection coverage, driver tenant
safety) — no regression.

## 8. Full E5 regression

- Non-live `src/modules/evaluations-analytics`: 26 suites (25 passed, 1 skipped),
  252 tests (248 passed, 4 skipped [live-gated]).
- Live PostgreSQL integration: 4 suites / 23 tests passed (see §6).
- Broad `evaluations | business-audit | shared/auth`: 51 suites (49 passed,
  1 skipped, 1 failed), 548 tests (543 passed, 4 skipped, 1 failed).
- The single failure is `shared/auth/fleet-service.permissions.matrix.spec.ts`
  (station-scoped visibility) — see §11.

## 9. Registry / contracts

- `E5_CALCULATION_VERSIONS.quality = evaluations-quality-e5-v2` (E5.1A bump). No
  further version change in E5.1B (pseudonym/permission/audit are not metric calc
  versions). E4 driver influence version unchanged.
- Metric registry / calculation-version sync specs pass within the evaluations
  regression; every active metric has a canonical owner and is served.

ACTIVE_BUT_NOT_CANONICALLY_SERVED = 0.

## 10. Scope audit

No E6 (UI redesign), E7 (recommendations/actions), E8 (prediction), or E9
(forecast UI) code was added. A grep for recommend/predict/forecast/suggestion in
the evaluations modules returns only a clarifying comment in
`e4/domain/evaluations-detection.domain.ts` stating detection is deterministic and
NOT AI/prediction.

E6_SCOPE_LEAK_COUNT = 0; E7_SCOPE_LEAK_COUNT = 0; E8_SCOPE_LEAK_COUNT = 0;
E9_SCOPE_LEAK_COUNT = 0.

## 11. Full quality gates

| Gate | Result |
|------|--------|
| backend production typecheck (`tsc -p tsconfig.build.json --noEmit`) | PASS (0) |
| targeted lint (changed privacy/audit/e4/e5 files) | PASS (0) |
| Nest production build (`nest build`) | PASS |
| Prisma validate | PASS (pre-existing SetNull warning only) |
| frontend typecheck (`tsc -b`) | PASS |
| frontend build (`vite build`) | PASS |

Baseline A/B for the one failing test:
- A = CURRENT_MAIN_SHA (`960365a9`), B = final E5 candidate (`121e127b`).
- `git diff --name-only origin/main...HEAD` touches nothing under `shared/auth`,
  `fleet`, or `station`; the failing spec and its dependencies are identical to
  main. It also fails identically at `PRE_E5_1B_HEAD`.
- Classification: **PRE_EXISTING_IDENTICAL** (unrelated to E5).

NEW_E5_FAILURE_COUNT = 0; UNKNOWN_COUNT = 0.

## 12. Final counters (recomputed from scratch)

| Counter | Value |
|---------|-------|
| PARALLEL_QUALITY_TRUTH_COUNT | 0 |
| PARALLEL_AUTH_SCOPE_COUNT | 0 |
| PARALLEL_AUDIT_TRUTH_COUNT | 0 |
| BUSINESS_RECENCY_AS_FRESHNESS_COUNT | 0 |
| UNPROVEN_FRESHNESS_AVAILABLE_COUNT | 0 |
| CURRENT_STATE_AS_HISTORICAL_QUALITY_COUNT | 0 |
| QUALITY_FALSE_ZERO_COUNT | 0 |
| FALSE_FULL_COVERAGE_COUNT | 0 |
| QUALITY_STATUS_UPGRADE_COUNT | 0 |
| FALSE_COMPLETE_PROVENANCE_COUNT | 0 |
| CROSS_TENANT_LINEAGE_LEAKAGE_COUNT | 0 |
| STATION_LINEAGE_SCOPE_LEAKAGE_COUNT | 0 |
| ORIGINAL_ID_FRAGMENT_IN_PSEUDONYM_COUNT | 0 |
| REVERSIBLE_OR_LEAKY_PSEUDONYM_COUNT | 0 |
| UNPROVEN_PERSON_LEVEL_PERMISSION_GRANT_COUNT | 0 |
| UNNECESSARY_PII_EXPOSURE_COUNT | 0 |
| LINEAGE_AUTHORIZATION_BYPASS_COUNT | 0 |
| CROSS_TENANT_PRIVACY_LEAKAGE_COUNT | 0 |
| CROSS_ROLE_PRIVACY_LEAKAGE_COUNT | 0 |
| SERVER_SENT_UNAUTHORIZED_FIELD_COUNT | 0 |
| SENSITIVE_LOG_PAYLOAD_COUNT | 0 |
| SENSITIVE_DISCLOSURE_WITHOUT_DURABLE_AUDIT_COUNT | 0 |
| AUDIT_PII_DUPLICATION_COUNT | 0 |
| CROSS_TENANT_AUDIT_READ_LEAKAGE_COUNT | 0 |
| CALLER_SUPPLIED_AUDIT_ACTOR_ACCEPT_COUNT | 0 |
| ACTIVE_BUT_NOT_CANONICALLY_SERVED | 0 |
| E6_SCOPE_LEAK_COUNT | 0 |
| E7_SCOPE_LEAK_COUNT | 0 |
| E8_SCOPE_LEAK_COUNT | 0 |
| E9_SCOPE_LEAK_COUNT | 0 |
| NEW_E5_FAILURE_COUNT | 0 |
| UNKNOWN_COUNT | 0 |

## 13. Runtime freeze

No runtime/test changes were made during this acceptance pass. TESTED_CODE_SHA =
`121e127bc9d2cde874562220fd854f448c26350d`. This acceptance evidence is recorded
in a single docs-only commit; `git diff --name-status TESTED_CODE_SHA..HEAD`
contains documentation only.

## Status

E5_READY_FOR_FINAL_MERGE_AUDIT
