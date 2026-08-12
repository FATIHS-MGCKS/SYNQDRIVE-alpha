# Phase 3 — E5 Post-Merge Verification (2026-08)

Independent final merge audit + squash merge + post-merge verification for
Evaluations Recovery E5 (Quality, Privacy, Authorization & Audit).

## Revision identity

| Ref | SHA |
|-----|-----|
| PRE_MERGE_MAIN_SHA (E4 foundation) | `960365a9b095a54f4656947ac2067a104e56bd8a` |
| E5_TESTED_CODE_SHA (runtime/test freeze, E5.2.1) | `568d9220bb652d692cd46cfddbe25a9b00e93d34` |
| E5_PR_HEAD_SHA (audited PR head) | `406560316ea22fd05afc96d95edf905c5bd192c9` |
| E5_MERGE_SHA (squash commit) | `a704fdcca76f03703a0816f71a4d11ffdbaf4292` |
| POST_MERGE_MAIN_SHA | `a704fdcca76f03703a0816f71a4d11ffdbaf4292` |
| squash parent | `960365a9b095a54f4656947ac2067a104e56bd8a` (== PRE_MERGE_MAIN_SHA) |
| source branch retained | YES (`integration/evaluations-e5-quality-privacy-authorization-audit-2026-08` @ `406560316`) |

- E4 foundation: `origin/main` was exactly the E4 SHA before merge (no drift).
- Tested-code ancestry: `568d9220` is an ancestor of the PR head; the only commits after the freeze are docs-only (`docs/audits/pr-recovery/**`). RUNTIME/TEST/CONFIG_CHANGE_AFTER_TESTED_SHA_COUNT = 0.
- Squash structure: exactly one parent = PRE_MERGE_MAIN_SHA → SQUASH_PARENT_MISMATCH_COUNT = 0.
- Squash content: 44 files, identical to the audited PR diff → SURPRISE_MERGED_FILE_COUNT = 0.
- Merge commit is reachable from `origin/main` (main == merge commit).

## Merge evidence

| Field | Value |
|-------|-------|
| PR | #1025 |
| state before | OPEN + DRAFT |
| Ready transition | `gh pr ready 1025` → isDraft=false, state=OPEN, base=main, head unchanged |
| mergedAt | 2026-08-12T08:39:03Z |
| merge method | SQUASH (`gh pr merge 1025 --squash`) |
| admin bypass | NO (`--admin` not used) |
| source branch | retained (not deleted) |

## Scope audit (allowed E5 governance only)

Full diff (44 files) = evaluations-analytics privacy/audit/e4/e5 + `.env.example` +
minimal additive `app.module.ts` (register `EvaluationsQualityModule`) + minimal
additive `business-audit.constants.ts` (E5C action/entity codes) + tests + docs.
No E6 UI, E7 recommendations, E8 prediction, E9 forecast UI, unrelated refactors,
production scripts, or secret mutation.

E6_SCOPE_LEAK_COUNT = 0; E7 = 0; E8 = 0; E9 = 0; UNRELATED_SCOPE_LEAK_COUNT = 0.

## Pre-merge results (on E5_PR_HEAD_SHA `406560316`)

| Area | Result |
|------|--------|
| E1 (status/PARTIAL/calcVersion/period/timezone) | PASS (within broad evaluations run) |
| E2 (tenant/station/RBAC) | PASS |
| E3 (Finance invoice+payment authority, money) | PASS |
| E4 (cost/util/detection/driver tenant safety) | PASS |
| E5 (A/B/C/1A/1B/2/2.1 + privacy policy/resolver) | PASS |
| PostgreSQL adversarial | 4 suites / 28 tests PASS (POSTGRES_FAILED = 0) |
| broad `evaluations \| business-audit \| shared/auth` | 585 tests: 580 passed, 4 skipped, 1 failed |
| backend typecheck / E5 lint / nest build / prisma validate | PASS |
| frontend typecheck / build | PASS |

The single failure is `shared/auth/fleet-service.permissions.matrix.spec.ts`
(station visibility) — PRE_EXISTING_IDENTICAL (branch changes nothing under
`shared/auth`/fleet; fails identically on main). NEW_E5_FAILURE_COUNT = 0; UNKNOWN_COUNT = 0.

Exact-head CI: CHECK_RUN_HEAD_SHA = `406560316` = E5_PR_HEAD_SHA. Red jobs
(Backend integration, Lint `lint:all`, Migration tests, Playwright E2E Vehicle
Detail, Security/dependency scan, Typecheck) fail identically on
`960365a9` → PRE_EXISTING_IDENTICAL. No E5-attributable red check.

## Post-merge results (on E5_MERGE_SHA `a704fdcc`, via detached worktree/checkout)

| Area | Result |
|------|--------|
| POST_MERGE_SUITE_COUNT / TEST_COUNT | 53 suites / 585 tests (broad) |
| POST_MERGE_PASSED / FAILED / SKIPPED | 580 / 1 / 4 |
| POST_MERGE_POSTGRES_TEST_COUNT | 4 suites / 28 tests, all PASS |
| backend typecheck | PASS (0) |
| targeted E5 lint | PASS (0) |
| Nest build | PASS |
| Prisma validate | PASS (validation only — NOT a migration) |
| frontend typecheck | PASS |
| frontend production build | PASS |

The one post-merge failure is the same `fleet-service` pre-existing test —
baseline A/B (A = `960365a9`, B = `a704fdcc`) → PRE_EXISTING_IDENTICAL.
NEW_POST_MERGE_E5_FAILURE_COUNT = 0; UNKNOWN_COUNT = 0.

## Quality / Freshness / Validity / Provenance / Lineage

- Freshness: business-event recency modeled separately; pipeline freshness UNKNOWN
  (no ingestion/sync watermark); historical periods never use a current snapshot.
- Quality roll-up: conservative, never upgrades (AVAILABLE+PARTIAL→PARTIAL, etc.).
- Validity: never fabricated COMPLETE — ERROR/UNAVAILABLE/NOT_APPLICABLE → UNAVAILABLE,
  served → UNKNOWN (no independent validity authority); completeness null-ratio → UNKNOWN.
- Provenance: composite — COMPLETE only when all required source classes present;
  Finance requires OrgInvoice + OrgInvoicePayment.
- Lineage: tenant/station-safe, opaque `org:<org>:<Model>` refs, no PII.

## Privacy / Authorization

- Pseudonym secret: environment-aware fail-closed. Production never uses the dev
  fallback; missing/empty/placeholder/insufficient → pseudonymous path UNAVAILABLE.
- HMAC pseudonym: keyed, domain-separated, stable per org+person+version, distinct
  per person and per tenant, no original-ID fragment.
- DRIVER hard deny: `membershipRole = DRIVER` → tier `none` regardless of
  evaluations.read / customers.read / any combination (real-DB proven).
- Cross-role / cross-tenant: fail closed; no server-sent unauthorized fields.
- Global RBAC / EffectiveAccessEngine unchanged (narrow privacy-policy rule only).

## Audit

- Canonical BusinessAudit only (no parallel store); actor from authenticated
  server context (no caller-supplied actor).
- Successful person-level disclosure is durable-audit-critical (enqueue +
  flushCritical before factors released; fail closed if durable audit fails).
- Denied access stays denied regardless of audit health; audit metadata is
  non-PII (no raw driver id / pseudonym / name / email / payload).

## Final counters (pre- and post-merge)

All of the following = 0:
PARALLEL_QUALITY_TRUTH_COUNT, PARALLEL_AUTH_SCOPE_COUNT, PARALLEL_AUDIT_TRUTH_COUNT,
BUSINESS_RECENCY_AS_FRESHNESS_COUNT, UNPROVEN_FRESHNESS_AVAILABLE_COUNT,
CURRENT_STATE_AS_HISTORICAL_QUALITY_COUNT, QUALITY_FALSE_ZERO_COUNT,
FALSE_FULL_COVERAGE_COUNT, QUALITY_STATUS_UPGRADE_COUNT,
FALSE_COMPLETE_PROVENANCE_COUNT, FABRICATED_VALIDITY_COMPLETE_COUNT,
FALSE_COMPLETE_QUALITY_DIMENSION_COUNT, CROSS_TENANT_LINEAGE_LEAKAGE_COUNT,
STATION_LINEAGE_SCOPE_LEAKAGE_COUNT, QUALITY_METADATA_PII_DUPLICATION_COUNT,
ORIGINAL_ID_FRAGMENT_IN_PSEUDONYM_COUNT, REVERSIBLE_OR_LEAKY_PSEUDONYM_COUNT,
PRODUCTION_PSEUDONYM_DEV_FALLBACK_COUNT, INSECURE_PSEUDONYM_FALLBACK_DISCLOSURE_COUNT,
PSEUDONYM_SECRET_LOG_LEAK_COUNT, PSEUDONYM_SECRET_API_EXPOSURE_COUNT,
DRIVER_PERSON_LEVEL_PERMISSION_GRANT_COUNT, UNPROVEN_PERSON_LEVEL_PERMISSION_GRANT_COUNT,
CROSS_TENANT_PRIVACY_LEAKAGE_COUNT, CROSS_ROLE_PRIVACY_LEAKAGE_COUNT,
SERVER_SENT_UNAUTHORIZED_FIELD_COUNT, LINEAGE_AUTHORIZATION_BYPASS_COUNT,
SENSITIVE_DISCLOSURE_WITHOUT_DURABLE_AUDIT_COUNT, AUDIT_FAILURE_AUTHORIZATION_BYPASS_COUNT,
AUDIT_PII_DUPLICATION_COUNT, DRIVER_DENIAL_AUDIT_PII_LEAK_COUNT,
CROSS_TENANT_AUDIT_READ_LEAKAGE_COUNT, CALLER_SUPPLIED_AUDIT_ACTOR_ACCEPT_COUNT,
SENSITIVE_LOG_PAYLOAD_COUNT, GLOBAL_RBAC_UNRELATED_BEHAVIOR_CHANGE_COUNT,
ACTIVE_BUT_NOT_CANONICALLY_SERVED, E6_SCOPE_LEAK_COUNT, E7_SCOPE_LEAK_COUNT,
E8_SCOPE_LEAK_COUNT, E9_SCOPE_LEAK_COUNT, NEW_E5_FAILURE_COUNT,
NEW_POST_MERGE_E5_FAILURE_COUNT, UNKNOWN_COUNT.

## Baseline failure classification

`fleet-service.permissions.matrix.spec.ts` (local) and CI jobs Typecheck
(`billing/*`+`workflows/*` spec type errors), Lint (`lint:all` repo-wide debt),
Security/dependency scan (transitive dep vulns), Backend integration, Migration
tests, Playwright E2E (Vehicle Detail): all PRE_EXISTING_IDENTICAL (fail identically
on `960365a9`). None E5-attributable.

## Production actions

| Action | Value |
|--------|-------|
| PRODUCTION_DEPLOYMENT_PERFORMED | NO |
| PRODUCTION_MIGRATION_PERFORMED | NO (only `prisma validate`, no migrate/deploy) |
| PRODUCTION_SECRET_CHANGED | NO |

## Recovery safety

| Item | Value |
|------|-------|
| HISTORICAL_DRAFT_PRS_CLOSED | 0 |
| HISTORICAL_BRANCHES_DELETED | 0 |
| E6_STARTED | NO |

## Final decision

E5_COMPLETED
