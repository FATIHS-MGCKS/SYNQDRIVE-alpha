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

---

## 23. E2.1 — Security, Scope & Contract Correction Pass

Correction pass on the same branch/PR (#1020) addressing the independent E2
post-implementation audit findings. Base `origin/main` unchanged
(`ab554722a2e6e9ed8e4263310bd2bddf9b62445a`); previous E2 head `01b5354e`.

### 23.1 Status authority fix

Removed the second status taxonomy (`EVALUATIONS_ANALYTICS_STATUSES` const list).
`EvaluationsAnalyticsStatus` is now a deprecated type alias of the canonical E1
`EvaluationsMetricStatus`, so `STALE` is retained and there is a single authority.
Tests assert two-way assignability, `STALE` presence, and that no second constant
list is exported.

### 23.2 Timezone authority fix

Timezone/period resolution moved server-side into the scope service. It loads the
real `Organization.timezone` and, for a single authorized station, the real
`Station.timezone`, then applies the E1 resolver. `organizationTimezone: null` is
no longer passed unconditionally. Multi-station requests deterministically use the
organization timezone (no "first station wins"); platform fallback applies only
when no org/station timezone exists.

### 23.3 Station scope unification

Removed the parallel `filterStationIds` path and dropped `stationIds` from the
filter contract entirely. Station scope is a single canonical authority
(`EvaluationsAnalyticsScope.stationIds` → server-resolved
`EvaluationsAuthorizedAnalyticsScope`). The repository derives its station
constraint only from the authorized scope; filters can never widen or redefine
station scope.

### 23.4 Mixed-station fail-closed

A request mixing an authorized station with a foreign/out-of-scope station is
rejected in full (`403`), never silently narrowed. Duplicates are normalized
before authorization. Verified by unit and HTTP integration tests.

### 23.5 EntityReference same-tenant integrity

Added a single controlled write path
(`EvaluationsEntityReferenceWriteService`): every production write validates that
the organization exists, the `stationId` (and any `STATION` target) belongs to
that organization, enum validity, PII-free shape, and performs an idempotent
upsert on `(organizationId, dedupeKey)`. No other module performs direct
`evaluationsEntityReference` writes.

### 23.6 Current-main migration validation

Applied the full `origin/main` migration chain to a disposable PostgreSQL 16
database: it stops at the pre-existing `20260325161142_trip_architecture_refactor`
(`PRE_EXISTING_MIGRATION_BASELINE`). `organizations`/`stations` exist from `init`,
and the E2 migration was then applied on top of that real current-main schema —
enums/table/indexes/FK created, FK bound to the real `organizations`, insert +
org-cascade verified. Details and corrected partial-apply/idempotency semantics
in `phase3-e2-migration-validation-2026-08.md`. Production migration performed:
NO.

### 23.7 HTTP security integration tests

Added a real guard-pipeline integration test (auth → OrgScopingGuard →
PermissionsGuard → FeatureGuard → controller → scope service →
StationAccessService → service → repository) with 13 HTTP scenarios; central
security components are not mocked.

### 23.8 StationAccess feature semantics

Documented that cross-tenant isolation is independent of the optional Stations-V2
flag: org ownership (org-owned station check) and repository organization scoping
always apply, so the feature flag can never enable cross-tenant access. Only the
intra-org station restriction follows the central `StationAccessService` (which
honors Stations-V2). E2 invents no weaker path.

### 23.9 Pagination / input hardening

- `page`: safe integer ≥ 1 and ≤ `EVALUATIONS_ANALYTICS_MAX_PAGE` (100000); the
  computed offset is checked to be a safe integer.
- `groupLimit`: safe integer ≥ 1, clamped to the server max; 0/negative/float/
  non-finite rejected.
- Identifiers: max length 128; whitespace-trimmed; empty rejected.
- Filter arrays de-duplicated and length-bounded; sort/grouping allowlisted.

### 23.10 Privacy recheck

Entity references remain PII-free (validator enforced); no station/customer/driver
label is persisted by any correction. FeatureGuard response semantics documented
to match runtime (404 when disabled, because the feature gate runs in the
controller guard chain and returns 404 by design).

### 23.11 A/B failure classification

All repository-wide CI reds remain `PRE_EXISTING_IDENTICAL` vs `origin/main`
(all-source typecheck fixtures, repo lint debt, greenfield migration P3018,
dependency audit, Vehicle Detail Playwright). `NEW_E2_FAILURE = 0`,
`UNKNOWN = 0`.

### 23.12 Residual issues

- DB-level composite `(stationId, organizationId)` FK deferred (write-gate
  enforces same-tenant station integrity; adding the composite FK would reshape
  the existing station architecture). Documented in the migration report.
- Granular evaluations operational permissions and default-role grants remain E5.
- Full greenfield `migrate deploy` still blocked by the pre-existing P3018.

Final E2.1 status: `E2_READY_FOR_POST_IMPLEMENTATION_AUDIT`.

---

## 24. E2.2 — Referential Integrity & Final Evidence Closure

Correction pass on the same branch/PR (#1020). Base `origin/main` unchanged
(`ab554722a2e6e9ed8e4263310bd2bddf9b62445a`); previous E2.1 head `6262bee0`.

### 24.1 Target resolver

Added a central tenant-aware target resolver
(`evaluations-entity-reference.resolver.ts`). For every persistable entity type
it performs an organization-scoped existence lookup
(`WHERE id = ? AND organization_id = ?`), selecting only `{ id }` (never PII).
Persistable target types: `VEHICLE`, `BOOKING`, `CUSTOMER`, `STATION`, `INVOICE`,
`TASK`, `SERVICE_CASE`, `DAMAGE`, `DOCUMENT`, `PAYMENT`, and `USER` (via ACTIVE
organization membership). `DRIVER` has no canonical organization-scoped entity
and is rejected fail-closed rather than persisted unvalidated.

### 24.2 Owner resolver

Owners are validated the same way. `INSIGHT` owners resolve to a `DashboardInsight`
row in the reference's organization. `ANALYTICS_GROUP` has no tenant-owned backing
store in E2 and is rejected fail-closed (no reference is persisted with an
unverifiable owner).

### 24.3 Same-tenant invariant

The write gate runs all checks in one serializable transaction: organization
exists; owner exists in the org; target exists in the org; any station belongs to
the org. Because every check is anchored on `relation.organizationId`, owner,
target and station necessarily share the same tenant. Enforced by unit, resolver,
and real-DB integration tests.

### 24.4 Single write authority

Repository has no write methods; the only production write path is
`EvaluationsEntityReferenceWriteService.createReference`.
`DIRECT_PRODUCTION_WRITES_OUTSIDE_GATE = 0` (verified by
`rg "evaluationsEntityReference\.(create|createMany|update|upsert|delete)"`
excluding specs).

### 24.5 Station access policy decision — `SUPERSEDED_BY_E2_3`

> **SUPERSEDED_BY_E2_3.** The E2.2 conclusion below ("Option A": Stations-V2 OFF =
> legacy org-wide analytics for any reader) was an incorrect interpretation. The
> authority (`docs/architecture/stations-v2-permissions.md`, PG-01…PG-05)
> defines station scope as an authorization gate that a rollout flag must not
> weaken; `STATION_ACCESS_BYPASS` on V2-OFF is the legacy *implementation* state,
> not the target authorization. E2.3 (§25) corrects this: evaluations derives
> station authorization from canonical role/membership scope, flag-independent.

Original E2.2 text (retained for audit history): Authority
`docs/architecture/stations-v2-permissions.md` (PG-01…PG-05) + central
`StationAccessService`. Decision (Option A): Stations-V2 OFF is the documented
legacy org-wide behavior (StationAccessService bypass → an evaluations reader sees
all stations in their own organization); Stations-V2 ON enforces station scope
from membership. In both modes the organization boundary is always enforced and
the flag can never enable cross-tenant access. `MULTI_STATION_TIMEZONE_POLICY` =
organization timezone (unchanged).

### 24.6 Unknown query parameter policy

`UNKNOWN_QUERY_KEYS = IGNORED_BY_PLATFORM_POLICY` for top-level query params (the
platform has no global `forbidNonWhitelisted`; the controller reads only named
params and never forwards unknown keys). Unknown keys inside the typed filter
object remain rejected (`UNKNOWN_FILTER_KEYS = REJECTED`). Reports corrected to
this exact semantics; covered by an HTTP integration test.

### 24.7 Migration documentation correction

Removed the imprecise "idempotent because CREATE TABLE is new" claim. The report
now states the accurate Prisma migration-state / partial-apply / roll-forward
semantics and reconfirms the current-main-schema validation with re-run commands
(`phase3-e2-migration-validation-2026-08.md`).

### 24.8 Tests

Focused E2 suites now: **12 suites, 109 tests pass** (+ 4 gated DB-integration
tests that pass against a disposable PostgreSQL 16 and skip in standard CI).
Added: target/owner resolver suite, real-DB write-gate integration, station
policy ON/OFF suite, unknown-query HTTP case; rewrote the write-gate suite for the
transactional resolver behavior.

### 24.9 Final CI / A/B

All repository-wide CI reds remain `PRE_EXISTING_IDENTICAL` vs `origin/main`.
`NEW_E2_FAILURE = 0`, `UNKNOWN = 0`.

### 24.10 Residual risks

- DB-level composite `(stationId, organizationId)` FK still deferred (write-gate +
  resolver enforce same-tenant integrity in one transaction).
- `DRIVER` target and `ANALYTICS_GROUP` owner are fail-closed unsupported until a
  canonical org-scoped backing store exists.
- Full greenfield `migrate deploy` remains blocked by the pre-existing P3018.

Final E2.2 status: `E2_READY_FOR_FINAL_MERGE_AUDIT`.

---

## 25. E2.3 — Station Scope Authority Correction & Final CI Closure

Correction pass on the same branch/PR (#1020). Base `origin/main` unchanged
(`ab554722a2e6e9ed8e4263310bd2bddf9b62445a`); previous E2.2 head `63dc29d4`;
tested code SHA `6f578c6b`.

### 25.1 The corrected finding

E2.2 treated Stations-V2 OFF (`STATION_ACCESS_BYPASS`) as canonical org-wide
analytics authorization. That is wrong: per
`docs/architecture/stations-v2-permissions.md` (PG-01…PG-05), permission and
station scope are two independent authorization gates; org membership alone is not
sufficient; WORKER/SUB_ADMIN are ASSIGNED_STATIONS, ORG_ADMIN/MASTER_ADMIN are
ALL_STATIONS; KPIs and lists must be station-scoped; silent bypasses are the
legacy implementation state, not the target policy. A feature flag must never
widen the security boundary.

### 25.2 The fix

`resolveEvaluationsAuthorizedStationScope` computes the actor's effective station
scope from canonical role/membership data via `computeEffectiveAccess` with the
V2 scope path **forced on** (`stationsScopeV2Enabled: true`). Evaluations no
longer uses `StationAccessService.resolve` (which bypasses on V2-OFF). The scope
service now:

- ALL_STATIONS actor + no filter → org-wide (`stationIds = null`).
- ASSIGNED_STATIONS actor + no filter → exactly the assigned stations.
- NO_STATIONS actor → empty population (`stationIds = []`).
- requested stations must be org-owned AND within the authorized scope, else the
  whole request fails closed (no silent narrowing).

`stationIds = null` (ALL) is strictly distinguished from `stationIds = []` (none).

### 25.3 Feature-flag independence

For the same membership, Stations-V2 ON and OFF now produce identical authorized
station populations (only internal reasons differ). An assigned-station worker
stays limited to their station with the flag OFF — the E2.2 intra-tenant
privilege escalation is fixed. `FEATURE_FLAG_SCOPE_ESCALATION_COUNT = 0`.

### 25.4 Role matrix (canonical authority)

| Role | Station authorization |
|---|---|
| MASTER_ADMIN | ALL_STATIONS within the explicitly targeted org (no cross-tenant bypass) |
| ORG_ADMIN | ALL_STATIONS within own org |
| SUB_ADMIN | ASSIGNED_STATIONS |
| WORKER | ASSIGNED_STATIONS |
| DRIVER / non-member / inactive | NO_STATIONS |

### 25.5 Data-level regression evidence

Same-org data at station A and station B: an ORG_ADMIN sees both (2 rows); a
WORKER assigned to A sees only A (1 row) — proven through the real repository
query (`evaluations-analytics.tenant-isolation.spec.ts`). Cross-tenant is denied
ON and OFF. `INTRA_TENANT_STATION_LEAKAGE_COUNT = 0`,
`CROSS_TENANT_STATION_LEAKAGE_COUNT = 0`.

### 25.6 E2.2 core regression

Target/owner tenant integrity, DB cross-tenant write (0 rows), HTTP security,
unknown-query, input bounds, summary/detail, and migration validation all remain
green after the station fix. No schema change was required.

### 25.7 Tests / quality

Focused E2 suites: **12 suites, 116 tests pass** (+ 4 gated DB-integration tests
passing against disposable PG 16). Backend production typecheck/build PASS; full
typecheck adds 0 new errors (4 pre-existing baseline); ESLint PASS; `prisma
validate` PASS. `NEW_E2_FAILURE = 0`, `UNKNOWN = 0`.

Final E2.3 status: `E2_READY_FOR_FINAL_MERGE_AUDIT`.
