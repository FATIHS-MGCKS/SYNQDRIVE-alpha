# Phase 3 E1 — A/B Baseline Validation (E1.2 final evidence)

This E1.2 run supersedes the E1.1 preliminary baseline. It was executed from two
clean, isolated Git worktrees with independent `npm ci` installs and no shared
build artifacts, running each command one process at a time.

## Scope

Evidence-only closure of PR #1018. No new features, routes, database changes, or
E2–E9 scope. Comparison establishes whether any current failure is caused by E1.

## Revisions

- A — main baseline (`origin/main`): `2d721a902feb56101eb9992249f1859ff64024cb`
- B — E1 candidate head: `9595f6e449fdf33c8b7a3f5e9a645c5b8d4ddded`
- Merge base: `2d721a902feb56101eb9992249f1859ff64024cb` (main has not moved since E1)
- Branch: `integration/evaluations-e1-contracts-2026-08`

## Environment (both sides identical)

| Property | Value |
|---|---|
| Node | v22.14.0 |
| npm | 10.9.8 |
| git | 2.43.0 |
| OS | Linux 6.12.94+ x86_64 GNU/Linux |
| Architecture | x86_64 |
| Timezone | UTC |
| CI env | unset |
| backend `package-lock.json` sha256 | `0d4a732d…4eb01f` (identical A/B) |
| frontend `package-lock.json` sha256 | `f16a28f1…df6f88` (identical A/B) |
| backend `package.json` sha256 | main `b61d14da…354bb` / E1 `76b979bc…f4f18c` (E1 adds test pattern + period alias) |
| frontend `package.json` sha256 | `fbb2d8ee…477077` (identical A/B) |

No secrets or tokens are included; secret-bearing variables were recorded only as
`SET`/`UNSET`.

## Command matrix and results

| Command | Working dir | main exit | E1 exit | main ms | E1 ms | Classification |
|---|---|---:|---:|---:|---:|---|
| `npx tsc --noEmit -p tsconfig.json` | backend | 2 | 2 | 37737 | 35485 | PRE_EXISTING_IDENTICAL |
| `npx tsc --noEmit -p tsconfig.build.json` | backend | 0 | 0 | 39990 | 40353 | PASS |
| `npm run lint:all` | backend | 1 | 1 | 18157 | 17985 | PRE_EXISTING_IDENTICAL |
| `npm run prisma:validate` | backend | 0 | 0 | 576 | 568 | PASS |
| `npm run build` | backend | 0 | 0 | 49934 | 50906 | PASS |
| `npm run test:evaluations` | backend | 1 | 1 | 29496 | 31645 | PRE_EXISTING_IDENTICAL |
| `npx tsc -b` | frontend | 0 | 0 | 31435 | 31982 | PASS |
| `npm run lint:all` | frontend | 1 | 1 | 14320 | 14111 | PRE_EXISTING_IDENTICAL |
| `npm run build` | frontend | 0 | 0 | 45462 | 45057 | PASS |
| `npm run test:evaluations` | frontend | 0 | 0 | 929 | 915 | PASS |
| `npm run test:legal-documents` | frontend | 0 | 0 | 1872 | 1890 | PASS |
| focused E1 jest suite | backend | n/a | 0 | — | ~11000 | E1_ONLY_PASS (6 suites, 115 tests) |

Every command returns the same exit code on A and B.

## Failure fingerprints and normalized equivalence

Normalization removed absolute worktree paths, durations, timestamps, PIDs, and
collapsed whitespace. Error codes, files, lines, test names, and messages were
preserved.

### BE_TYPECHECK — `PRE_EXISTING_IDENTICAL`

Normalized stdout byte-identical between A and B. Four diagnostics:

```
src/modules/billing/stripe-webhook.characterization.spec.ts(37,15): error TS2554: Expected 4 arguments, but got 3.
src/modules/billing/stripe-webhook.characterization.spec.ts(68,28): error TS2554: Expected 4 arguments, but got 3.
src/modules/billing/stripe-webhook.service.spec.ts(40,15): error TS2554: Expected 4 arguments, but got 3.
src/modules/workflows/workflow-dry-run.service.spec.ts(214,9): error TS2345: ... ActionExecutionContext missing actionDefinitionId, actionIdempotencyKey
```

### BE_LINT — `PRE_EXISTING_IDENTICAL`

Normalized stdout byte-identical. `51 problems (36 errors, 15 warnings)` in
untouched non-evaluations modules. Only stderr difference is a Node
`MODULE_TYPELESS_PACKAGE_JSON` warning whose `mtime` query differs (noise).

### FE_LINT — `PRE_EXISTING_IDENTICAL`

Normalized stdout byte-identical. `449 problems (422 errors, 27 warnings)`. The
only raw differences were the worktree path prefix in file headers and
formatter column padding, both removed by normalization.

### BE_TEST_EVAL — `PRE_EXISTING_IDENTICAL`

Both A and B fail exactly two tests with the same root cause in an untouched file:

```
FAIL src/modules/business-insights/detectors/tire-critical.detector.spec.ts
  ● TireCriticalDetector › alerts WARNING from canonical summary without re-computing thresholds
  ● TireCriticalDetector › caps CRITICAL estimate at WARNING when not measured
TypeError: Cannot read properties of undefined (reading 'tpmsWarning')
  at tire-critical.detector.ts:82
```

- A: `2 failed, 154 passed, 156 total`
- B: `2 failed, 246 passed, 248 total`

E1 adds 92 passing tests through the newly-included evaluations contract suites;
all of them pass. The two failures are unchanged and identical on both sides.

## Config causality analysis (Step 14)

E1 config deltas versus `origin/main`:

- `backend/package.json`: `test:evaluations` pattern extended with
  `evaluations-period.resolver|evaluations-metric-response|evaluations-shared-contract-mirror`,
  and a Jest `@synq/evaluations-periods` module mapper.
- `backend/tsconfig.json`: `@synq/evaluations-periods/*` path.
- `frontend/tsconfig.app.json`: period path alias + `include` of
  `../shared/evaluations-periods/**/*.ts`.
- `frontend/vite.config.ts`, `frontend/vitest.config.ts`: period alias.

Causality result: the widened `test:evaluations` scope pulled three new suites and
92 additional test cases into the targeted gate; **all of them pass**. The widened
frontend `tsc -b` graph (adds the shared period package) still passes on both
sides. No config change made a previously-hidden failure appear. Therefore no
config-induced `NEW_E1_FAILURE` exists. The config changes are the minimum
required to compile and test the shared period contracts and are retained.

## GitHub CI comparison

Current E1 head (`9595f6e4`) runs versus the same-SHA `origin/main` CI runs:

| Failure | E1 head | main SHA | Classification | Reproduced locally |
|---|---|---|---|---|
| Typecheck | fail | fail | PRE_EXISTING_IDENTICAL | yes |
| Legal lint | fail | fail | PRE_EXISTING_IDENTICAL | yes |
| Security / dependency scan | fail | fail | PRE_EXISTING_IDENTICAL | yes |
| Migration tests P3018 `vehicle_trips` | fail | fail | PRE_EXISTING_IDENTICAL | no (needs PostgreSQL) |
| Backend integration (P3018 precondition) | fail | fail | PRE_EXISTING_IDENTICAL | no (needs PostgreSQL) |
| Vehicle Detail Playwright Overview-tab timeout | fail | fail | PRE_EXISTING_IDENTICAL | no (needs browser) |

E1 head runs: Vehicle Detail `31437769513`, Legal Documents `31437769541`.
Main-SHA runs: Vehicle Detail `30221356279`, Legal Documents `30221356275`.
No GitHub failure references an E1-owned file. The three service-dependent
failures are evidenced as identical on the main-SHA CI runs.

## Summary

- Commands executed (per side): 11 shared + 1 E1-only focused suite
- NEW_E1_FAILURE_COUNT: 0
- PRE_EXISTING_IDENTICAL_COUNT: 4
- PRE_EXISTING_CHANGED_COUNT: 0
- FIXED_BY_E1_COUNT: 0
- NON_DETERMINISTIC_COUNT: 0
- NOT_REPRODUCIBLE_LOCALLY_COUNT: 0
- ENVIRONMENT_SPECIFIC_COUNT: 0
- UNKNOWN_COUNT: 0

Result: no E1-caused failure. Every red gate reproduces identically from
`origin/main`.
