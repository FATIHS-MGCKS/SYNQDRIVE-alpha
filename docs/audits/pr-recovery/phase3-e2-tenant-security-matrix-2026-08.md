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
| WRITE: foreign VEHICLE target | org-a | — | org-b vehicle (write) | reject | ForbiddenException | NO | UNIT_RUNTIME + INTEGRATION_RUNTIME | evaluations-entity-reference-write.service.spec.ts / evaluations-entity-reference.db-integration.spec.ts | rejects a cross-tenant target entity / rejects a cross-tenant target (A owner + B vehicle) | PASS |
| WRITE: foreign CUSTOMER/BOOKING/etc. target | org-a | — | org-b target (write) | reject | belongsToOrganization=false → reject | NO | UNIT_RUNTIME | evaluations-entity-reference.resolver.spec.ts | rejects cross-tenant targets for every supported entity type | PASS |
| WRITE: unsupported DRIVER target | org-a | — | driver (write) | reject fail-closed | not persistable → BadRequest | NO | UNIT_RUNTIME | evaluations-entity-reference-write.service.spec.ts | rejects an unsupported target type (DRIVER) fail-closed | PASS |
| WRITE: foreign owner | org-a | — | org-b INSIGHT owner (write) | reject | ForbiddenException | NO | UNIT_RUNTIME | evaluations-entity-reference-write.service.spec.ts | rejects a cross-tenant owner | PASS |
| WRITE: unsupported ANALYTICS_GROUP owner | org-a | — | analytics group owner (write) | reject fail-closed | not persistable → BadRequest | NO | UNIT_RUNTIME | evaluations-entity-reference-write.service.spec.ts | rejects an unsupported owner type (ANALYTICS_GROUP) fail-closed | PASS |
| WRITE: foreign station on reference | org-a | s-b1 (write) | — | reject | ForbiddenException | NO | UNIT_RUNTIME | evaluations-entity-reference-write.service.spec.ts | rejects a cross-tenant station | PASS |
| WRITE: zero cross-tenant persisted rows (real DB) | org-a / org-b | — | mixed | 0 cross-tenant rows | count 0 | NO | INTEGRATION_RUNTIME | evaluations-entity-reference.db-integration.spec.ts | has zero cross-tenant persisted rows overall | PASS |
| E2.3 WORKER assigned [A], V2 ON, no filter | org-a | (none) | — | scope=[A] | stationIds=[s-a1] | NO | UNIT_RUNTIME | evaluations-analytics.station-policy.spec.ts | (ON) assigned WORKER, no station filter → limited to assigned station | PASS |
| E2.3 WORKER assigned [A], V2 OFF, no filter (escalation regression) | org-a | (none) | — | scope=[A] (NOT org-wide) | stationIds=[s-a1] | NO | UNIT_RUNTIME | evaluations-analytics.station-policy.spec.ts | (OFF) assigned WORKER, no station filter → limited to assigned station | PASS |
| E2.3 WORKER assigned [A], request B | org-a | s-a2 (unassigned) | — | DENY (ON+OFF) | ForbiddenException | NO | UNIT_RUNTIME | evaluations-analytics.station-policy.spec.ts | assigned WORKER requesting an unassigned org station → DENY | PASS |
| E2.3 SUB_ADMIN assigned [A,B], no filter | org-a | (none) | — | scope=[A,B] | both assigned | NO | UNIT_RUNTIME | evaluations-analytics.station-policy.spec.ts | SUB_ADMIN assigned [s-a1,s-a2], no filter → both | PASS |
| E2.3 ORG_ADMIN, no filter | org-a | (all) | — | ALL_STATIONS | stationIds=null | NO | UNIT_RUNTIME | evaluations-analytics.station-policy.spec.ts | ORG_ADMIN, no filter → ALL_STATIONS | PASS |
| E2.3 DRIVER / non-member | org-a | (none) | — | NO_STATIONS (empty) | stationIds=[] | NO | UNIT_RUNTIME | evaluations-analytics-scope.service.spec.ts | non-member → NO_STATIONS empty population | PASS |
| E2.3 cross-tenant station (V2 ON and OFF) | org-a | s-b1 | — | DENY both modes | ForbiddenException | NO | UNIT_RUNTIME | evaluations-analytics.station-policy.spec.ts | cross-tenant station request → DENY | PASS |
| E2.3 ON≡OFF authorized population equivalence | org-a | — | — | identical stationIds | equal | NO | UNIT_RUNTIME | evaluations-analytics.station-policy.spec.ts | ON/OFF produce identical authorized station population | PASS |
| E2.3 data-level: ORG_ADMIN sees A+B; WORKER(A) sees only A | org-a | — | — | admin 2 rows / worker 1 row | via repository query | NO | UNIT_RUNTIME | evaluations-analytics.tenant-isolation.spec.ts | admin sees org-a A+B; station-scoped actor only sees allowed-station references | PASS |
| Unknown query parameter | org-a | — | ?evilField/__proto__ | ignored (platform policy), not forwarded | 200, org-a scope, not forwarded | NO | INTEGRATION_RUNTIME | evaluations-analytics.http-security.integration.spec.ts | 16. unknown query parameter is ignored | PASS |

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

## Unknown query parameter policy

Platform policy: unknown top-level query parameters are **ignored** (no global
`forbidNonWhitelisted`); the controller reads only named parameters and never
forwards unknown keys to the query builder. Unknown **filter** keys inside the
typed filter object are still rejected (allowlist). Documented as
`UNKNOWN_QUERY_KEYS = IGNORED_BY_PLATFORM_POLICY` (top-level) +
`UNKNOWN_FILTER_KEYS = REJECTED` (filter object).

## Result

- READ cross-tenant leakage count: **0**
- WRITE cross-tenant leakage count: **0**
- All scenarios: **PASS** (fail-closed)
