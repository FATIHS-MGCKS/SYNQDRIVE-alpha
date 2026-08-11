# Phase 3 E1 — Contract Correction Test Report (E1.1 + E1.2)

Tested code revision: `9595f6e449fdf33c8b7a3f5e9a645c5b8d4ddded`
(branch `integration/evaluations-e1-contracts-2026-08`).

## Focused E1 contract suite

Command:

```bash
cd backend
npx jest --runInBand \
  src/modules/evaluations-metrics/evaluations-metric.registry.spec.ts \
  src/modules/evaluations-metrics/evaluations-metric-response.spec.ts \
  src/modules/evaluations-metrics/evaluations-period.resolver.spec.ts \
  src/modules/evaluations-metrics/evaluations-shared-contract-mirror.sync.spec.ts \
  src/modules/evaluations-metrics/evaluations-metric-calculation-versions.sync.spec.ts \
  src/modules/pricing/tariff-instant.util.spec.ts
```

Result: **PASS — 6 suites, 115 tests, 0 skipped**.

Targeted evaluations umbrella (`npm run test:evaluations`) on the E1 head:
**246 passed**, 2 pre-existing `TireCriticalDetector` failures in an untouched
file (identical on `origin/main`). Frontend evaluations
(`npm run test:evaluations`): **36 passed**.

## E1.1 finding gates

| Gate | Coverage | Result |
|---|---|---|
| Comparison single source | Canonical `EvaluationsComparisonType`; registry uses the same type; no canonical `none`/`mom`/`yoy`/`prev_period`; MTD maps to `PREVIOUS_COMPARABLE_PERIOD`; no-comparison is `[]`; deprecated timezone alias only | PASS |
| Registry-aware validation | Response checked against definition: `metricId`, `metricKind`, `valueType`, `transportUnit`, `calculationVersion`, `supportedComparisons`; unknown id fails closed | PASS |
| — unknown metric | `assertValidRegisteredEvaluationsMetricResponse` throws on unregistered id | PASS |
| — wrong valueType | MONEY-as-COUNT rejected | PASS |
| — wrong metricKind | DERIVED-as-ML_FORECAST rejected | PASS |
| — wrong calculationVersion | version drift rejected | PASS |
| — unsupported comparison | `YEAR_OVER_YEAR` on mom-only metric rejected | PASS |
| Time dependency direction | `shared/time/platform-time.constants.ts` owns `PLATFORM_DEFAULT_TIMEZONE`; shared IANA util imports it; no evaluations import in shared time | PASS |
| Period reference invariant | `start <= reference < endExclusive` and `start < endExclusive` enforced | PASS |
| Timezone | Invalid IANA and unauthorized override rejected; PLATFORM_FALLBACK bound to `Europe/Berlin` | PASS |
| DST forward/backward | 23h/25h Berlin days; gap-forward and overlap-earlier comparison shift | PASS |
| Value-type COUNT | non-negative safe integer | PASS |
| Value-type DATETIME | UTC ISO-8601 instant | PASS |
| Value-type Duration | finite, non-negative | PASS |
| Value-type Distance | finite, non-negative | PASS |
| Value-type Percent/Ratio | PERCENT 0..100, RATIO 0..1 | PASS |
| DataCoverage | ratio == available/expected within 1e-9; zero/zero null; available + excluded <= expected; non-negative integer counts | PASS |
| Money EUR | valid | PASS |
| Money USD | valid (currency authority is `Money.currency`) | PASS |
| Money invalid currency | missing/invalid/non-ISO rejected; non-finite amount rejected | PASS |
| Mirror / contract sync | shared vs `backend/src/synq` byte-identical incl. period, response, money, platform-time | PASS |

## Build and static gates (E1 head)

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.build.json` (backend prod typecheck) | PASS |
| `npm run build` (backend) | PASS |
| `npx tsc -b` (frontend typecheck) | PASS |
| `npm run build` (frontend) | PASS |
| `npm run prisma:validate` | PASS (pre-existing SetNull warning) |
| `npx tsc --noEmit -p tsconfig.json` (backend all-source) | FAIL — `PRE_EXISTING_IDENTICAL` (4 Stripe/workflow fixtures) |
| `npm run lint:all` (backend) | FAIL — `PRE_EXISTING_IDENTICAL` (51 problems, untouched files) |
| `npm run lint:all` (frontend) | FAIL — `PRE_EXISTING_IDENTICAL` (449 problems, untouched files) |

## Scope gates

| Gate | Result |
|---|---|
| No-new-routes (`@Controller`/`@Get`/`@Post`/`@Patch`/`@Put`/`@Delete` added) | PASS — 0 added |
| No-DB-change (`prisma/schema.prisma`, migrations, DB scripts) | PASS — 0 changes |
| Scope leak (E2 persistence/tenant, E3 finance/FX/receivables, E4 analytics engine, E5 RBAC/audit, E6 UI IA, E7 recommendations, E8/E9 forecasts) | PASS — none |

## A/B causality

Full isolated A/B against `origin/main@2d721a90`:
`NEW_E1_FAILURE = 0`, `UNKNOWN = 0`. Details in
`phase3-e1-ab-baseline-validation-2026-08.md` and `.json`.

## Acceptance

- All E1.1 finding gates: **PASS**
- Focused contract suite: **PASS (115/115)**
- Production build/typecheck gates: **PASS**
- Scope gates: **PASS**
- `NEW_E1_FAILURE`: **0**; `UNKNOWN`: **0**
- Repository-wide red gates: reproducibly `PRE_EXISTING_IDENTICAL`

Status: **E1_READY_FOR_FINAL_MERGE_AUDIT**.
