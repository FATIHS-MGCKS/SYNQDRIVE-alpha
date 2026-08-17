# Phase 3 E1 — Post-Merge Verification

Controlled merge and post-merge verification of the Evaluations E1 recovery. This
report is evidence only and does not start E2.

## 1. E1 merge identity

| Field | Value |
|---|---|
| Pull request | #1018 — Evaluations Recovery E1 — Metric, Time & KPI Contracts |
| Source branch | `integration/evaluations-e1-contracts-2026-08` |
| Source head (`E1_SOURCE_HEAD_SHA`) | `fe16d9462f12e717fb75e5044c6d32e35546e700` |
| Final audited head | `fe16d9462f12e717fb75e5044c6d32e35546e700` (MATCH = true) |
| Pre-merge main (`PRE_MERGE_MAIN_SHA`) | `2d721a902feb56101eb9992249f1859ff64024cb` |
| Merge method | Squash (normal GitHub merge, no admin bypass) |
| Squash commit (`MERGE_SHA`) | `ab554722a2e6e9ed8e4263310bd2bddf9b62445a` |
| Post-merge main (`POST_MERGE_MAIN_SHA`) | `ab554722a2e6e9ed8e4263310bd2bddf9b62445a` |
| Merged at | 2026-08-11T04:27:02Z |
| PR state | MERGED |

Only PR #1018 was integrated. Pre-merge `origin/main` had not drifted from the PR
base, and the source head was unchanged since the E1.2 evidence closure (the final
commit was documentation-only).

## 2. Scope verification (post-merge)

| Item | Result |
|---|---|
| Change-set | E1 contracts, backend mirrors, pure period resolver, shared time authority, tests, docs, and evidence only |
| New API routes | 0 (no added `@Controller`/`@Get`/`@Post`/`@Patch`/`@Put`/`@Delete`) |
| Database migration | NO (no `prisma/schema.prisma`, migration, or DB-script change) |
| E2 entity persistence / tenant enforcement | none |
| E3 finance/FX/receivable logic | none |
| E4 analytics summary engine | none |
| E5 RBAC/audit/data-quality impl | none |
| E6 new UI IA | none |
| E7 recommendation engine | none |
| E8/E9 predictive/forecast runtime | none |
| Secrets | none |

`DATABASE_CHANGE = NO`, `NEW_API_ROUTES = 0`, `SCOPE_LEAK = NONE`.

## 3. Contract verification on `origin/main` (`ab554722`)

Real code on main was read, not just commit metadata.

| Fix | Evidence on main | Result |
|---|---|---|
| Comparison single source | `EVALUATIONS_COMPARISON_TYPES` canonical enum; no `mom`/`yoy`/`prev_period`/`none` in `evaluations-metric.definitions.ts` | PASS |
| Registry-aware validation | `assertValidRegisteredEvaluationsMetricResponse` → `assertValidEvaluationsMetricResponseAgainstDefinition` | PASS |
| Time authority direction | `shared/time/platform-time.constants.ts` owns `PLATFORM_DEFAULT_TIMEZONE`; `backend/src/shared/time/iana-timezone.util.ts` has no Evaluations import | PASS |
| Period reference invariant | `reference < start || reference >= endExclusive` and `start >= endExclusive` guards | PASS |
| Value validation | COUNT non-negative safe integer; PERCENT 0..100; RATIO 0..1; DATETIME UTC instant | PASS |
| DataCoverage invariant | `ratio == availableRecords / expectedRecords`; `available + excluded <= expected` | PASS |
| Money currency authority | ISO-4217 currency required; MONEY registry uses `CURRENCY_MINOR` without a fixed currency | PASS |

No E1.1 correction was lost during the squash.

## 4. Post-merge tests (clean worktree from `origin/main`)

Executed in a fresh detached worktree of `origin/main@ab554722` with its own
`npm ci` install.

| Command | Result |
|---|---|
| `npx jest --runInBand evaluations-metric.registry evaluations-metric-response evaluations-period.resolver evaluations-shared-contract-mirror evaluations-metric-calculation-versions pricing/tariff-instant.util` | PASS — 6 suites, 115 tests |
| `npm run test:evaluations` (frontend) | PASS — 36/36 |
| `npx tsc --noEmit -p tsconfig.build.json` (backend prod typecheck) | PASS |
| `npx tsc -b` (frontend typecheck) | PASS |
| `npm run build` (backend) | PASS |
| `npm run build` (frontend) | PASS |
| `npm run prisma:validate` | PASS (pre-existing SetNull warning) |
| Mirror/drift integrity (`evaluations-shared-contract-mirror.sync.spec.ts`) | PASS |
| `npx tsc --noEmit -p tsconfig.json` (backend all-source) | FAIL — pre-existing baseline (4 Stripe/workflow fixtures) |
| `npm run lint:all` (backend) | FAIL — pre-existing baseline (51 problems) |

The two failing gates reproduce the exact E1.2 A/B fingerprints and reference no
E1-owned file.

## 5. Regression classification

| Class | Count |
|---|---|
| PRE_EXISTING_BASELINE | 3 gate groups (backend all-source typecheck, backend `lint:all`, frontend `lint:all`) plus the two `TireCriticalDetector` fixture tests |
| NEW_POST_MERGE_E1_FAILURE | 0 |
| ENVIRONMENT_SPECIFIC | 0 |
| UNKNOWN | 0 |

Backend all-source typecheck on post-merge main returns the identical four
diagnostics; backend `lint:all` returns the identical `51 problems (36 errors, 15
warnings)`. These match the pre-E1 baseline recorded in
`phase3-e1-ab-baseline-validation-2026-08.md`.

## 6. Historical PR and branch handling

- Historical source PRs closed: 0 (intentionally none; repository-wide recovery is
  not complete and historical PRs may still provide evidence for other change-sets).
- Historical branches deleted: 0.
- E1 source branch `integration/evaluations-e1-contracts-2026-08`: retained (not
  deleted). It may be marked as a later-deletable recovery branch once repository
  recovery is complete.

## 7. Final status

`E1_COMPLETED` — PR #1018 merged via a normal, policy-compliant squash merge with
no admin bypass; post-merge main contains all seven E1.1 fixes; E1 targeted tests
pass; no new DB migration; no new route; no E2–E9 scope leak;
`NEW_POST_MERGE_E1_FAILURE = 0`; `UNKNOWN = 0`.

E2 is not started. It will begin in a separate prompt from the confirmed new
`origin/main` (`ab554722`).
