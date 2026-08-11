# Phase 3 E2 — Tenant Security Matrix

Cross-tenant and cross-station negative matrix for the tenant-safe analytics
foundation. `dataLeak` = whether any foreign-tenant identifier, count, name, or
existence signal is returned. All scenarios must be `NONE`.

Enforcement layers exercised: global `AuthGuard` → `OrgScopingGuard` (org
boundary, 403) → `PermissionsGuard` (`evaluations.read`) →
`EvaluationsAnalyticsScopeService` (station scope, fail-closed 403) →
`EvaluationsEntityReferenceRepository` (organizationId always in the query).

| scenario | actorOrg | requestedOrg | requestedStation | requestedEntity | permission | expected | actual | dataLeak | result |
|---|---|---|---|---|---|---|---|---|---|
| Unauthenticated request | — | org-a | — | — | — | 401 | 401 (global AuthGuard) | NONE | PASS |
| Actor requests foreign org path `:orgId=org-b` | org-a | org-b | — | — | evaluations.read | 403 before DB | 403 `ForbiddenException` (OrgScopingGuard JWT mismatch) | NONE | PASS |
| Actor without `evaluations` permission | org-a | org-a | — | — | none | 403 | 403 (PermissionsGuard; fail-closed, key absent on membership) | NONE | PASS |
| ORG_ADMIN same tenant, no station narrowing | org-a | org-a | (all) | — | admin | 200 org-a only | scope stationIds=null; repo where org-a only | NONE | PASS |
| Station-scoped actor, no narrowing | org-a | org-a | (allowed subset) | — | evaluations.read | 200 allowed stations only | scope stationIds=allowed subset; org-level null-station rows excluded | NONE | PASS |
| Inject foreign-org station id | org-a | org-a | s-of-org-b | — | evaluations.read | fail closed | 403 `ForbiddenException` (station not org-owned) | NONE | PASS |
| Inject org-owned but out-of-scope station | org-a | org-a | s-org-a-not-allowed | — | evaluations.read | fail closed | 403 `ForbiddenException` (outside actor station scope) | NONE | PASS |
| Mixed allowed + foreign station list | org-a | org-a | [s-allowed, s-foreign] | — | evaluations.read | entire request rejected | 403 `ForbiddenException` (fail closed on whole list) | NONE | PASS |
| Guess foreign entity UUID via filter | org-a | org-a | — | veh-1 (also exists in org-b) | evaluations.read | only org-a rows | repository org-scoped; org-b `veh-1` never returned | NONE | PASS |
| Shared natural id across tenants | org-a / org-b | self | — | veh-1 in both | evaluations.read | each sees only own | dedupe key is org-scoped; unique per org (DB dry-run verified) | NONE | PASS |
| Empty explicit station selection | org-a | org-a | [] | — | evaluations.read | well-defined empty result | scope stationIds=[]; repo returns 0 (not an error) | NONE | PASS |
| Master admin without platform scope note | — | — | — | — | — | no evaluations cross-tenant bypass invented | E2 adds no platform cross-tenant path; master-admin uses existing central authority only | NONE | PASS |

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
