# Phase 3 E2 — Tenant Security Matrix

Cross-tenant and cross-station negative matrix for the tenant-safe analytics
foundation. `dataLeak` = whether any foreign-tenant identifier, count, name, or
existence signal is returned. All scenarios must be `NONE`.

Enforcement layers exercised: global `AuthGuard` → `OrgScopingGuard` (org
boundary, 403) → `PermissionsGuard` (`evaluations.read`) →
`EvaluationsAnalyticsScopeService` (station scope, fail-closed 403) →
`EvaluationsEntityReferenceRepository` (organizationId always in the query).

`evidence_type` ∈ {`E2E_RUNTIME`, `INTEGRATION_RUNTIME`, `UNIT_RUNTIME`, `STATIC_CODE`, `MIGRATION_TEST`}. `data_leaked` must be `NO` for every row.

| scenario | actorOrg | requestedStation | requestedEntity | expected | actual | data_leaked | evidence_type | test_file | test_name | result |
|---|---|---|---|---|---|---|---|---|---|---|
| Unauthenticated | — | — | — | 401 | 401 | NO | INTEGRATION_RUNTIME | evaluations-analytics.http-security.integration.spec.ts | 1. unauthenticated → 401 | PASS |
| Foreign org path `:orgId=org-b` | org-a | — | — | 403 | 403 (OrgScopingGuard) | NO | INTEGRATION_RUNTIME | evaluations-analytics.http-security.integration.spec.ts | 2. authenticated wrong organization → 403 | PASS |
| Missing `evaluations` permission | org-a | — | — | 403 | 403 (PermissionsGuard) | NO | INTEGRATION_RUNTIME | evaluations-analytics.http-security.integration.spec.ts | 3. authenticated missing permission → 403 | PASS |
| Correct org + permission | org-a | (all) | — | 200 org-a only | 200, aggregateTotal org-a only | NO | INTEGRATION_RUNTIME | evaluations-analytics.http-security.integration.spec.ts | 4. correct org + permission → 200 | PASS |
| Inject foreign-org station | org-a | s-b1 | — | 403 fail closed | 403, no `org-b` in body | NO | INTEGRATION_RUNTIME | evaluations-analytics.http-security.integration.spec.ts | 5. foreign station → 403 | PASS |
| Mixed allowed + foreign station | org-a | [s-a1, s-b1] | — | entire request rejected | 403 | NO | INTEGRATION_RUNTIME | evaluations-analytics.http-security.integration.spec.ts | 6. mixed station list → 403 | PASS |
| Foreign entity id filter | org-a | — | veh-foreign | 200, only org-a scope | 200, scope org-a; no leak | NO | INTEGRATION_RUNTIME | evaluations-analytics.http-security.integration.spec.ts | 7. foreign entity id filter → 200 no leak | PASS |
| Malformed/oversized entity id | org-a | — | 500-char id | 400 | 400 | NO | INTEGRATION_RUNTIME | evaluations-analytics.http-security.integration.spec.ts | 8. malformed entity id → 400 | PASS |
| Org admin own organization | org-a | — | — | 200 | 200 | NO | INTEGRATION_RUNTIME | evaluations-analytics.http-security.integration.spec.ts | 10. org admin own organization → 200 | PASS |
| Authorized platform actor explicit org | master | — | — | 200 approved org only | 200, scope org-a | NO | INTEGRATION_RUNTIME | evaluations-analytics.http-security.integration.spec.ts | 12. platform actor explicit target org → 200 | PASS |
| Feature disabled | org-a | — | — | 404 | 404 | NO | INTEGRATION_RUNTIME | evaluations-analytics.http-security.integration.spec.ts | 13. feature disabled → 404 | PASS |
| Excessive page size | org-a | — | — | clamped 200 | 200 pageSize=100 | NO | INTEGRATION_RUNTIME | evaluations-analytics.http-security.integration.spec.ts | 14. excessive page size → clamped | PASS |
| Excessive page number | org-a | — | — | 400 | 400 | NO | INTEGRATION_RUNTIME | evaluations-analytics.http-security.integration.spec.ts | 15. excessive page number → 400 | PASS |
| Inject org-owned out-of-scope station | org-a | s-org-a-not-allowed | — | 403 fail closed | 403 | NO | UNIT_RUNTIME | evaluations-analytics-scope.service.spec.ts | fails closed when a requested station is org-owned but outside the actor scope | PASS |
| Station-scoped actor limited to allowed stations | org-a | (subset) | — | allowed stations only | scope=allowed subset | NO | UNIT_RUNTIME | evaluations-analytics-scope.service.spec.ts | limits a station-scoped actor to the authorized stations | PASS |
| Empty explicit station selection | org-a | [] | — | well-defined empty | scope stationIds=[] | NO | UNIT_RUNTIME | evaluations-analytics-scope.service.spec.ts | treats an explicit empty selection as a well-defined empty scope | PASS |
| Shared natural id across tenants | org-a / org-b | — | veh-1 in both | each sees only own | org-a sees 1 row | NO | UNIT_RUNTIME | evaluations-analytics.tenant-isolation.spec.ts | a shared natural entity id does not leak the other tenant row | PASS |
| Cross-tenant summary/detail | org-a | — | — | org-b never visible | totals/rows org-a only | NO | UNIT_RUNTIME | evaluations-analytics.tenant-isolation.spec.ts | an org-a admin never sees org-b references | PASS |
| Repository always org-scoped | org-a | — | — | where has organizationId | asserted on count/find/group | NO | UNIT_RUNTIME | evaluations-entity-reference.repository.spec.ts | tenant-scoped queries | PASS |
| EntityReference station-org integrity | org-a | s-b1 (write) | — | write rejected | ForbiddenException | NO | UNIT_RUNTIME | evaluations-entity-reference-write.service.spec.ts | rejects a reference whose station belongs to another organization | PASS |
| Same natural id unique per org (DB) | org-a / org-b | — | veh-1 | tenant-scoped uniqueness | 2 rows; in-org dup rejected; org cascade | NO | MIGRATION_TEST | phase3-e2-migration-validation-2026-08.md | live disposable PostgreSQL 16 dry-run | PASS |

## Repository query-scope assertions (Step 46)

Unit tests assert the actual Prisma query, not only HTTP status:

- `countInScope`, `listInScope`, `groupInScope` are each called with a `where`
  containing `organizationId` (spy assertions).
- `buildWhere` always includes `organizationId` and the period window, and a
  station-scoped actor yields `stationId: { in: [...] }` (null-station rows
  excluded), with filter stations intersected against the authorized subset.

## Database-level isolation (live dry-run evidence)

On a disposable PostgreSQL 16 instance the migration was applied and:

- The same natural entity id (`veh-1`) inserted under `org-a` and `org-b`
  coexists (2 rows) — tenant-scoped uniqueness, not global.
- A duplicate `(organizationId, dedupeKey)` insert is rejected by the unique
  index `evaluations_entity_refs_org_dedupe_key`.
- Deleting `org-a` cascades to remove only org-a references (org-a: 0, org-b: 1).

## Result

- Cross-tenant leakage count: **0**
- All scenarios: **PASS** (fail-closed)
