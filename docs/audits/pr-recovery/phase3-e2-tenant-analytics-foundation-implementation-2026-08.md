# Phase 3 E2 — Tenant-Safe Analytics Foundation Implementation

## 1. Base

- Starting `origin/main`: `ab554722a2e6e9ed8e4263310bd2bddf9b62445a` (E1 squash)
- E1 ancestor verification: PASS (`ab554722` is an ancestor of `origin/main`)
- Main drift since E1: none
- Branch: `integration/evaluations-e2-tenant-analytics-foundation-2026-08`

## 2. E2 change-sets (Phase 2.6 authority)

Confirmed against `phase2-6-evaluations-final-package-matrix-2026-08.csv`
(authority branch `audit/repository-pr-recovery-evaluations-phase2-6-2026-08`):

- `cs-evaluations-grouping-entity-references`
- `cs-evaluations-filter-architecture`
- `cs-evaluations-analytics-contracts`
- `cs-evaluations-tenant-isolation`
- `cs-evaluations-summary-detail-separation`

Governing ADRs: EVAL-ADR-004 (typed entity references), EVAL-ADR-007 (permission
model), plus E1 EVAL-ADR-002 (timezone/period authority, reused).

## 3. Historical source PRs/commits

Historical `cursor/evaluations-*-8427` branches (analytics-contracts,
filter-contract, tenant-isolation, analytics-summary) are **evidence only**. E2
was **reimplemented on current main**; no historical stack was merged or
cherry-picked.

## 4. Already-in-main foundations reused (no second authority)

- E1 metric/period/money contracts: `EvaluationsPeriodWindow`, period resolver
  (`resolveEvaluationsTimezone`/`resolveEvaluationsPeriod`), status semantics —
  reused, not re-defined.
- Central auth: global `AuthGuard`, `OrgScopingGuard`, `PermissionsGuard` +
  `@RequirePermission`, `RolesGuard`, `@CurrentUser`, `StationAccessService`.
- Prisma conventions: uuid ids, `@@map`, org `onDelete: Cascade`, composite
  `@@unique`/`@@index` with `organizationId` first.

## 5. Implemented capabilities

- Typed, tenant-safe contracts (shared + byte-identical backend mirror):
  entity references, analytics scope, allowlisted filters, bounded pagination,
  grouping, and the summary-vs-detail response separation.
- Organization-owned normalized entity-reference persistence + repository with
  defense-in-depth tenant scoping.
- Server-side scope resolver (organization + station, fail-closed).
- Foundation summary/detail API (two GET routes) that reconciles over identical
  scope+filters and keeps aggregate totals separate from top-N/pages.
- Central `evaluations` permission module key; `EVALUATIONS_ANALYTICS_V2_MODE`
  dark-launch flag (default `off` → 404).

No finance/utilization/strength/weakness/driver/data-quality/forecast/
recommendation business logic is implemented (later packages).

## 6. Entity-reference architecture (EVAL-ADR-004)

- Model `EvaluationsEntityReference`: `organizationId`, optional `stationId`,
  `ownerType`/`ownerId` (analytical object), `entityType`/`entityId`,
  `relationType`, deterministic tenant-scoped `dedupeKey`, timestamps.
- Registry-controlled `entityType` (12 canonical domains) and `relationType`
  (5 typed relations); no free strings.
- Hybrid read model: relational reference is the scope/join authority; display
  labels are resolved authorized at read time and are **never stored** — the
  contract validator rejects any embedded PII field (data minimization).
- Integrity: FK `organizations` `onDelete: Cascade`; unique
  `(organizationId, dedupeKey)`; polymorphic `entityId` integrity is
  application-enforced (documented; no illusory FK across all domains).

## 7. Tenant authority

- Client `organizationId`/`stationIds` are requests, not authorization. The org
  is the `:orgId` route param validated by `OrgScopingGuard`; the scope resolver
  and repository enforce it. Repository `buildWhere` always includes
  `organizationId`.
- No new master/platform cross-tenant path was invented.

## 8. Station authority

- `EvaluationsAnalyticsScopeService` resolves the actor's station scope via the
  central `StationAccessService`. Explicit stations must be org-owned AND within
  the actor's scope, else the whole request fails closed (403). Station-scoped
  actors never receive org-level (null-station) rows.

## 9. Filter architecture

- Typed allowlist only (`stationIds`, `vehicleIds`, `customerIds`, `entityTypes`,
  `relationTypes`); unknown keys rejected; values de-duplicated, enum-validated,
  and length-bounded. No arbitrary field/operator/value query language.

## 10. Summary vs detail contract

- Summary: `aggregateTotal` (full population) is distinct from `groups` (bounded
  top-N) and `groupLimit`. Detail: `totalCount` distinct from `returnedCount`,
  `page`, `pageSize`, `hasMore`. Both are computed over identical scope+filters
  (reconciliation-tested). Prevents the historical "top-N as total" defect.

## 11. Route security matrix

See `phase3-e2-route-security-matrix-2026-08.csv`. Two new protected GET routes;
every route is authenticated, org-guarded, permission-guarded, station-validated,
repository-tenant-scoped, bounded, and dark-launched. No unprotected route.

## 12. Database schema changes

- `DATABASE_CHANGE = YES`; one additive table + three enums.
- Back-relation added on `Organization`.

## 13. Migration

- `DATABASE_MIGRATION = YES`:
  `20260811060000_evaluations_entity_references` (additive-only). Details and
  live dry-run in `phase3-e2-migration-validation-2026-08.md`.
  `production migration performed = NO`.

## 14. Backfill

- `BACKFILL_REQUIRED = NO`.

## 15. Privacy review

- Data processed: organization ids, optional station ids, owner/entity ids,
  typed entity/relation enums, timestamps.
- Possible personal references: customer/driver/user entities are referenced by
  id only. No name/email/phone/address/license/VIN is stored or logged.
- Controls: minimization (PII-key rejection in the validator), purpose-bound
  references, authorization at every layer, retention compatibility (pointer,
  not PII store; cascade + read-time resolution), no sensitive logging, and an
  attributable protected boundary ready for E5 sensitive-read auditing.

## 16. Threat model (mini)

| Threat | Control | Evidence |
|---|---|---|
| IDOR / cross-tenant read | org param + scope resolver + repo `organizationId` | scope + repo + isolation specs; DB dry-run |
| Cross-tenant UUID guessing | org-scoped queries; shared natural id isolated | isolation spec; DB dry-run |
| Station injection | org-owned + in-scope validation; fail-closed | scope service spec |
| Filter injection | typed allowlist; unknown keys rejected | validator spec |
| Pagination abuse | bounded page size (max 100); allowlisted sort + tie-breaker | validator spec |
| Grouping abuse | allowlisted group dimensions; bounded group limit | validator + service specs |
| Existence leakage | 403 (org/station boundary) / empty scoped result; no names | matrix |
| PII enumeration | no PII stored/returned; labels resolved authorized later | validator spec |
| Privilege escalation | fail-closed permission (`evaluations.read`); no invented platform path | permission model |
| Feature exposure | dark-launch flag; off → 404 | feature guard spec |

## 17. Tests

Targeted E2 suites (6 suites, 45 tests, all PASS):

- `evaluations-analytics.validator.spec.ts`
- `evaluations-analytics-scope.service.spec.ts`
- `evaluations-entity-reference.repository.spec.ts`
- `evaluations-analytics.service.spec.ts`
- `evaluations-analytics.tenant-isolation.spec.ts`
- `evaluations-analytics-feature.guard.spec.ts`

Plus the extended `evaluations-shared-contract-mirror.sync.spec.ts` (analytics
contracts byte-identical).

## 18. Build results

- Focused E2 tests: PASS (45/45).
- Backend production typecheck (`tsconfig.build.json`): PASS.
- Backend full typecheck (`tsconfig.json`): only the 4 pre-existing baseline
  errors (Stripe/workflow fixtures); **0 new E2 errors**.
- Targeted ESLint on all new files: PASS.
- Backend production build (`nest build`): PASS.
- `prisma validate`: PASS. Migration dry-run: PASS (live disposable PG 16).

## 19. Baseline failures

Repository-wide baseline reds (backend all-source typecheck fixtures, repo lint
debt, greenfield migration P3018, dependency audit) are pre-existing and
documented in the E1 A/B baseline; E2 adds none.

## 20. Rollback

Set `EVALUATIONS_ANALYTICS_V2_MODE=off` (default) to disable the routes; revert
the E2 commits; if the schema was applied, drop the new table + enums (no other
object depends on them). No data backfill or restore required.

## 21. Residual issues

- Granular evaluations operational permissions (customer/driver detail, export)
  and default-role grants are intentionally deferred to E5; E2 enforces the
  fail-closed module `evaluations.read` (ORG_ADMIN/MASTER_ADMIN by default).
- Whole-chain greenfield `migrate deploy` remains blocked by the pre-existing
  P3018 baseline (not E2).
- No frontend consumer is wired yet (contracts available in `shared/` for E6).

## 22. Recommendation

`E2_READY_FOR_POST_IMPLEMENTATION_AUDIT`. All foundation, entity-reference,
tenant, filter, summary/detail, database, security, privacy, and quality gates
pass; no E3–E9 scope leak; `NEW_E2_FAILURE = 0`. Not merged.
