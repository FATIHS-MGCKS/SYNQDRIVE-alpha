# Phase 3 E1 — Evaluations Metric, Time & KPI Contracts

## 1. Baseline

- Current `origin/main` before branch creation:
  `2d721a902feb56101eb9992249f1859ff64024cb`
- Phase-2.6 runbook baseline:
  `2d721a902feb56101eb9992249f1859ff64024cb`
- Baseline delta: none
- Branch: `integration/evaluations-e1-contracts-2026-08`
- Method: `REIMPLEMENT_ON_CURRENT_MAIN`; no merge or cherry-pick

The Phase-2.6 suite and evaluation ADRs are available on recovery authority branch
`origin/audit/repository-pr-recovery-evaluations-phase2-6-2026-08`, but are not
present on current `main`. They were read through immutable Git objects. The
separately named Book I–IV documentation suite is not present; the ratified ADRs,
Phase-2.5 authority matrix, and Phase-2.6 runbook are therefore the available
authority chain.

## 2. E1 change-set scope and evidence

| Change-set | Current-main disposition | Historical evidence |
|---|---|---|
| `cs-evaluations-metric-registry-baseline` | `ALREADY_SATISFIED_BY_CURRENT_MAIN`; integrity validation extended only | PR #752, commit `850b20bc632e514acba32e05e38b92c864840779` |
| `cs-evaluations-calculation-versioning-baseline` | `ALREADY_SATISFIED_BY_CURRENT_MAIN`; formula migration documentation clarified | PR #752, commit `312ee93f5315af7c8a4474a5014976a68584a7c6` |
| `cs-evaluations-timezone-period-model` | Reimplemented as shared contract and pure resolver | PR #754, commit `f23e6bdab173c9e4705f56316737a2497d147ae1` |
| `cs-evaluations-unified-kpi-contract` | Reimplemented as discriminated shared response contract | PR #755, commit `59cbd9f1f8f2e5f55601b5f2385f9fc5701c49b2` |

Historical controller, service, finance-query, and UI wiring changes were not
ported because they belong outside E1 or violate its no-new-route gate.

## 3. Current-main inventory

| Capability | Current-main implementation | Decision |
|---|---|---|
| Metric category/kind/unit/value/aggregation contracts | `shared/evaluations-metrics/evaluations-metric.contract.ts` plus backend build mirror | Reuse and extend typed units only |
| Metric definitions and registry | 74 definitions and eager duplicate/version checks | Reuse; harden invariant validation |
| Calculation version/provenance | Shared version resolver, provenance builders, persistence compatibility | Reuse; no backfill or formula change |
| KPI status/value response | Not present | Add canonical shared discriminated contract |
| Business period/timezone authority | Organization/station timezone fields and pricing calendar helpers; no evaluations contract | Reuse platform timezone primitive; add pure evaluations resolver |
| Money | Server ISO-4217 utilities and domain cent fields; no shared evaluations value object | Add transport-only `{amountMinor,currency}` foundation |
| Comparison/coverage/freshness | No canonical evaluations types | Add response metadata contracts |
| Frontend evaluations types | Shared metric registry re-export; no period/response contract | Extend re-export only; no UI/business calculation |
| Applied filters | Generic calculation provenance metadata only | No E2 filter architecture added |

## 4. Implemented contract decisions

- Metric statuses are `AVAILABLE`, `PARTIAL`, `STALE`, `UNAVAILABLE`, `ERROR`,
  and `NOT_APPLICABLE`.
- Available/partial/stale responses carry explicit values. Unavailable/error/not
  applicable responses carry `null`, never a placeholder zero.
- Scalar response values are discriminated by `valueType` at compile time and at the
  runtime boundary; invalid type/value combinations fail validation.
- Money responses are discriminated by `valueType=MONEY`, require
  `unit=CURRENCY_MINOR`, and carry an integer minor amount plus explicit uppercase
  currency from the shared ISO-4217 allowlist.
- Registry 1.1.0 preserves the existing semantic `unit` and adds `transportUnit`;
  MONEY uses `CURRENCY_MINOR` on the wire without rewriting existing display units.
- Coverage, source freshness, and comparison are separate typed concepts.
- Comparison status/value states are discriminated; percentage delta is null for a
  zero baseline, never Infinity/NaN, and comparison current period must equal the
  metric period. Direct builder output is runtime-validated before return.
- UTC `[start,endExclusive)` bounds carry the effective IANA timezone and authority
  source.
- Timezone precedence follows EVAL-ADR-002. Unauthorized report timezone overrides
  fail closed; authority metadata is runtime-validated and browser timezone is not an
  input.
- Calendar boundaries are DST-aware. Rolling windows are explicit elapsed
  durations ending at `asOf`; gap/overlap disambiguation is explicit and tested.
- Calculation versions remain semver formula identifiers. A v1→v2 formula change
  requires registry and override changes together; existing v1 provenance remains
  v1 and no E1 backfill occurs.

## 5. Compatibility

- Existing metric IDs, 74 definitions, legacy maps, routes, and current API
  responses remain intact.
- Backend mirrors under `backend/src/synq/` preserve the current PM2/Nest build
  topology; frontend aliases consume the repository shared source. A targeted sync
  test requires every evaluations contract mirror to remain byte-identical to its
  shared authority.
- New response and period contracts are additive and are not yet bound to existing
  business-query routes.
- No permanent duplicate KPI authority or page-owned calculation was introduced.

## 6. Scope, migration, and security gates

- New API routes: **NO**
- New controllers or route decorators: **NO**
- Database migration: **NO**
- Prisma schema change: **NO**
- New business/finance query: **NO**
- Forecast/recommendation implementation: **NO**
- Evaluations UI rewrite: **NO**
- Registry definitions contain metadata only and no customer, driver, email,
  telephone, or VIN data.
- Period/timezone inputs grant no organization/station authority and contain no
  client-controlled `orgId`. E2 remains responsible for tenant enforcement.
- Contract/registry/resolver code performs no DB, Redis, queue, or provider access.

## 7. Files and architecture

Implementation is limited to shared contracts, backend build mirrors, the pure
period resolver, invariant tests, shared alias wiring, architecture records, and
the required SynqDrive Changes/Architektur entries.

- Changes view: updated
- Architektur view: updated
- Architecture records:
  - `docs/architecture/analytics/evaluations-metric-response-contract.md`
  - `docs/architecture/analytics/evaluations-timezone-period-model.md`
  - existing registry and calculation-version records updated

## 8. Validation results

| Gate | Result |
|---|---|
| Targeted metric response/status/money/comparison tests | PASS |
| Targeted period/timezone/DST tests | PASS |
| Metric registry/version/provenance regression | PASS — combined E1 contract and mirror-sync suite 96/96 |
| Platform timezone primitive regression | PASS — 10/10 |
| Backend evaluations regression | BASELINE BLOCKER — 219 passed, 2 existing TireCriticalDetector fixture failures |
| Backend production typecheck | PASS — `tsconfig.build.json` |
| Backend all-source typecheck | BASELINE BLOCKER — 4 existing Stripe/workflow test-fixture errors |
| Backend build | PASS |
| Backend targeted E1 lint | PASS |
| Backend configured lint | PASS with one pre-existing warning |
| Backend full lint | BASELINE BLOCKER — 36 errors/15 warnings in untouched files |
| Frontend typecheck/build | PASS |
| Frontend targeted E1 lint | PASS |
| Frontend configured/full lint | BASELINE BLOCKER — errors in untouched document/UI files |
| Frontend evaluations regression | PASS — 36/36 |
| Frontend full unit suite | BASELINE BLOCKER — 2235 passed, 7 failed in untouched health/task files; 1 pre-existing skip and 1 todo |
| Backend full unit suite | BASELINE BLOCKER — existing failures, then Node heap exhaustion at 4 GiB |
| Prisma validate | PASS with pre-existing referential-action warning |
| No-new-routes/diff audit | PASS |
| CI | BASELINE BLOCKER — 24 checks completed: 15 passed, 7 failed, 2 skipped; no failure references an E1-owned file |

The E1-owned targeted suites pass without skipped tests. Baseline failures were
verified to be in files with no `origin/main...HEAD` diff. They were not modified
because E1 explicitly forbids unrelated cleanup and silent business-expectation
changes.

## 9. Residual issues and rollback

- Residual issues:
  - Current main is not globally green for all-source typecheck, full lint, or full
    unit tests. These are external E1 acceptance blockers even though every E1
    target, production build, and production typecheck passes.
      - PR #1018 CI fails in untouched global areas: existing Stripe/workflow
        all-source type errors, repository-wide lint debt, the legacy
        `vehicle_trips` migration chain, legal-document integration/dependency
        gates, and a Vehicle Detail Playwright expectation. The relevant production
        builds, unit/security/component tests, accessibility, Prisma validation, and
        dependency scan in the Vehicle Detail workflow pass.
  - Runtime adoption of the new response contract is intentionally deferred to
    later owning packages.
- Rollback: revert the isolated E1 commits and redeploy the prior release. No
  database restoration, feature-flag change, or data backfill is required.

## 10. Recommendation

`E1_BLOCKED`: keep the PR in draft. Do not mark ready or merge until the current-main
baseline gates and CI are green or the post-implementation audit explicitly accepts
the documented external blockers.

## 11. E1.1 Post-Implementation Correction Pass

E1.1 corrects only findings from the independent E1 contract audit. Tested code
revision: `ac2fd40e9cb5d9a377e09b34070a3f8a37f3e2b7`.

### 11.1 Comparison single source

- `EvaluationsComparisonType` is the only registry/period/response taxonomy:
  `PREVIOUS_COMPARABLE_PERIOD`, `PREVIOUS_FULL_PERIOD`, `YEAR_OVER_YEAR`,
  `TARGET`.
- Registry 1.2.0 contains no `none`, `mom`, `yoy`, or `prev_period` authority.
- No-comparison is an empty list.
- Every former MoM capability was inspected and mapped to
  `PREVIOUS_COMPARABLE_PERIOD`; this preserves comparable MTD windows rather than
  assuming a full previous month.
- No compatibility adapter was added because repository consumers do not use the
  removed registry strings outside the definitions/tests.

### 11.2 Registry-aware response validation

- Shared validation now supports explicit response-versus-definition checks
  without importing the backend registry.
- The backend registered boundary performs the registry lookup and rejects unknown
  ids.
- It enforces metric id, kind, value type, transport unit, calculation version,
  supported comparison, MONEY shape/currency, and status/value semantics.
- E1's registered KPI path does not implicitly admit ad-hoc metrics.

### 11.3 Time dependency direction

- `shared/time/platform-time.constants.ts` owns the platform fallback.
- Backend shared time consumes the shared/core constant and no longer imports an
  Evaluations contract.
- Evaluations keeps only a deprecated compatibility alias to the same authority;
  it does not define another fallback.
- The established fallback remains `Europe/Berlin`, after report, station, and
  organization scope.

### 11.4 Period reference invariant

The period validator now requires valid UTC instants and:

```text
start <= reference < endExclusive
start < endExclusive
```

IANA timezone/source consistency and comparison-period validation remain enforced.
DST gap/overlap behavior remains green.

### 11.5 Value-type hardening

- COUNT: non-negative safe integer.
- DATETIME: UTC ISO-8601 instant.
- Distances/durations: finite and non-negative.
- PERCENT: 0..100.
- RATIO: 0..1.
- SCORE: finite; no invented global range.

No general rules engine or unrelated metric policy was introduced.

### 11.6 DataCoverage invariant

- Counts are non-negative safe integers.
- Available cannot exceed expected.
- Available plus excluded cannot exceed expected when all are known.
- A transported ratio must match `available / expected` within `1e-9`.
- `expected=0, available=0` has explicit `ratio=null` semantics.

### 11.7 Money currency authority

- `Money.currency` is the sole concrete currency authority.
- MONEY definitions use `CURRENCY_MINOR` for both deprecated unit hint and
  transport unit, so registry metadata cannot impose EUR.
- Assigned EUR and USD responses both validate.
- No FX conversion or E3 migration logic was implemented.

### 11.8 Config diff minimization

The original E1 config delta is limited to TypeScript/Jest/Vite/Vitest aliases and
includes required to compile the shared period contracts, plus discovery of the
new E1 tests. The new discovery scope contains only passing E1 suites. E1.1 adds no
config or lockfile change, so no config line was reverted.

### 11.9 A/B baseline comparison

Clean worktree validation compared
`origin/main@2d721a902feb56101eb9992249f1859ff64024cb` with the tested E1.1
revision using identical commands and normalized failure fingerprints.

- Production backend/frontend typechecks and builds pass on both.
- Prisma validates on both with the same warning.
- Full typecheck, full lint, evaluations umbrella, and current dependency audit
  failures reproduce from main with equivalent roots.
- Historical GitHub runs for the exact main SHA reproduce the current E1.1
  TypeScript, lint, legacy migration `P3018`, dependency, and Vehicle Detail
  Playwright failure classes.
- `NEW_E1_FAILURE`: **0**.

Detailed evidence:

- `docs/audits/pr-recovery/phase3-e1-ab-baseline-validation-2026-08.md`
- `docs/audits/pr-recovery/phase3-e1-ab-baseline-validation-2026-08.json`
- `docs/audits/pr-recovery/phase3-e1-contract-correction-test-report-2026-08.md`

### 11.10 Final E1.1 gates and remaining failures

| Gate | E1.1 result |
|---|---|
| Comparison authority | PASS |
| Registry-aware validation | PASS |
| Time dependency direction | PASS |
| Period reference | PASS |
| Value semantics | PASS |
| Coverage arithmetic | PASS |
| Money authority | PASS |
| Focused backend | PASS — 112/112 |
| Frontend evaluations | PASS — 36/36 |
| Backend production typecheck/build | PASS |
| Frontend typecheck/build | PASS |
| Prisma/mirror/no-route/no-DB | PASS |
| A/B `NEW_E1_FAILURE` | PASS — 0 |
| Repository-wide/CI | ACCEPTED_BASELINE — all current failures reproduce identically from main |

Final E1.1 status: `E1_READY_FOR_POST_IMPLEMENTATION_AUDIT`. E1-owned
corrections pass, every current red GitHub failure has a reproducible
`PRE_EXISTING_IDENTICAL` main fingerprint, and `NEW_E1_FAILURE` is zero. The
earlier E1 recommendation in section 10 is superseded by this evidence-backed
E1.1 correction result.
