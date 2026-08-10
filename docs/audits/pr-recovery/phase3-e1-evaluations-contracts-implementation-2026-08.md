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
| `cs-evaluations-metric-registry-baseline` | `ALREADY_SATISFIED_BY_CURRENT_MAIN`; integrity validation extended only | PR #755, commit `850b20bc632e514acba32e05e38b92c864840779` |
| `cs-evaluations-calculation-versioning-baseline` | `ALREADY_SATISFIED_BY_CURRENT_MAIN`; formula migration documentation clarified | PR #752, commit `312ee93f5315af7c8a4474a5014976a68584a7c6` |
| `cs-evaluations-timezone-period-model` | Reimplemented as shared contract and pure resolver | PR #754, commit `f23e6bdab173c9e4705f56316737a2497d147ae1` |
| `cs-evaluations-unified-kpi-contract` | Reimplemented as discriminated shared response contract | PR #754, commit `59cbd9f1f8f2e5f55601b5f2385f9fc5701c49b2` |

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
- Money responses are discriminated by `valueType=MONEY`, require
  `unit=CURRENCY_MINOR`, and carry an integer minor amount plus explicit uppercase
  currency.
- Coverage, source freshness, and comparison are separate typed concepts.
- Comparison percentage delta is null for a zero baseline, never Infinity/NaN.
- UTC `[start,endExclusive)` bounds carry the effective IANA timezone and authority
  source.
- Timezone precedence follows EVAL-ADR-002. Unauthorized report timezone overrides
  fail closed; browser timezone is not an input.
- Calendar boundaries are DST-aware. Rolling windows are explicit elapsed
  durations ending at `asOf`.
- Calculation versions remain semver formula identifiers. A v1→v2 formula change
  requires registry and override changes together; existing v1 provenance remains
  v1 and no E1 backfill occurs.

## 5. Compatibility

- Existing metric IDs, 74 definitions, legacy maps, routes, and current API
  responses remain intact.
- Backend mirrors under `backend/src/synq/` preserve the current PM2/Nest build
  topology; frontend aliases consume the repository shared source.
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

Validation is recorded here after the pre-test implementation revision is committed
and pushed. No test will be skipped or disabled.

| Gate | Result |
|---|---|
| Targeted metric response/status/money/comparison tests | PENDING |
| Targeted period/timezone/DST tests | PENDING |
| Metric registry/version/provenance regression | PENDING |
| Backend evaluations regression | PENDING |
| Frontend evaluations regression | PENDING |
| Backend typecheck/build | PENDING |
| Backend lint | PENDING |
| Frontend typecheck/build | PENDING |
| Frontend lint | PENDING |
| Prisma validate | PENDING |
| No-new-routes/diff audit | PENDING |
| CI | PENDING |

## 9. Residual issues and rollback

- Residual issues: pending validation and CI only. Runtime adoption of the new
  response contract is intentionally deferred to later owning packages.
- Rollback: revert the isolated E1 commits and redeploy the prior release. No
  database restoration, feature-flag change, or data backfill is required.

## 10. Recommendation

`PENDING_LOCAL_GATES` until all validation rows above pass.
