# Phase 3 E1.1 — Contract Correction Test Report

Tested code revision:
`ac2fd40e9cb5d9a377e09b34070a3f8a37f3e2b7`.

## Targeted contract suite

Command:

```bash
cd backend
npx jest --runInBand \
  src/modules/evaluations-metrics/evaluations-metric.registry.spec.ts \
  src/modules/evaluations-metrics/evaluations-metric-response.spec.ts \
  src/modules/evaluations-metrics/evaluations-period.resolver.spec.ts \
  src/modules/evaluations-metrics/evaluations-shared-contract-mirror.sync.spec.ts \
  src/modules/pricing/tariff-instant.util.spec.ts
```

Result: **PASS — 5 suites, 112 tests, 0 skipped**.

## Covered corrections

| Area | Positive/negative coverage | Result |
|---|---|---|
| Comparison taxonomy | Canonical IDs only; no legacy `none`/`mom`/`yoy`/`prev_period`; MTD comparable windows; explicit YoY resolver; empty no-comparison list | PASS |
| Registry-aware response | Valid registry response; unknown id; MONEY-as-COUNT; DERIVED-as-ML_FORECAST; version drift; unsupported comparison; wrong transport unit; status/value contradiction | PASS |
| Period reference | Before start, at start, immediately before end, at end, after end; invalid instant/timezone; start equal/after end | PASS |
| DST regression | Berlin 23/25-hour days; gap-forward and overlap-earlier comparison shift | PASS |
| Value types | COUNT safe/non-negative integer; DATETIME UTC instant; non-negative duration/distance; PERCENT 0..100; RATIO 0..1; finite generic numeric/SCORE | PASS |
| Data coverage | 100/80/0.8 valid; contradictory ratio; zero/zero null-ratio semantics; available > expected; negative/fractional counts; available + excluded > expected | PASS |
| MONEY | EUR and USD valid; missing/invalid currency; floating, NaN, Infinity amount; no fixed registry EUR authority | PASS |
| Mirror integrity | Metric response/validator/contract, period contract/validator, ISO currency list, and platform-time authority byte-identical | PASS |
| Shared-time dependency | Shared IANA utility contains no Evaluations import | PASS |
| Pricing time regression | Existing tariff timezone behavior on shared primitive | PASS |

## Additional validation

| Command | Result |
|---|---|
| `cd frontend && npm run test:evaluations` | PASS — 36/36 |
| Targeted backend E1.1 ESLint | PASS |
| `cd backend && npx tsc --noEmit -p tsconfig.build.json` | PASS |
| `cd backend && npm run build` | PASS |
| `cd frontend && npx tsc -b` | PASS |
| `cd frontend && npm run build` | PASS |
| `cd backend && npm run prisma:validate` | PASS with pre-existing warning |
| `cd backend && npm run test:evaluations` | 246 passed, 2 `PRE_EXISTING_IDENTICAL` Tire detector failures |
| Backend all-source typecheck | Four `PRE_EXISTING_IDENTICAL` fixture diagnostics |
| Backend full lint | 36 errors/15 warnings, `PRE_EXISTING_IDENTICAL` |
| Frontend full lint | 422 errors/27 warnings, `PRE_EXISTING_IDENTICAL` |

## Scope scans

### No new routes

`git diff --name-only -G'@(Controller|Get|Post|Patch|Delete)\('
origin/main...HEAD -- backend/src` returned no files.

Result: **NO_NEW_ROUTES**.

### No database changes

`git diff --name-only origin/main...HEAD -- backend/prisma
backend/migrations backend/scripts` returned no files.

Result: **NO_DATABASE_MIGRATION**.

### Config causality

The E1 aliases/includes expose only shared evaluations period contracts, and the
backend Jest pattern adds only E1 test suites. All added suites pass. No E1.1
change alters compiler, linter, package-lock, migration, or application discovery
scope.

## Acceptance result

- Correction-specific gates: **PASS**
- Production typecheck/build gates: **PASS**
- Mirror integrity: **PASS**
- `NEW_E1_FAILURE`: **0**
- Repository-wide/CI red gates: **ACCEPTED_BASELINE** because every current
  failure is reproducibly `PRE_EXISTING_IDENTICAL` and no E1-owned file appears
  in a failure fingerprint.
- Final status: **E1_READY_FOR_POST_IMPLEMENTATION_AUDIT**.

