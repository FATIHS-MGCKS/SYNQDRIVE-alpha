# Stations Workflow, Business Rules, Permission & UX Test Matrix (Audit 2 of 2)

**Audit type:** Controlled workflow / business-rule / permission / UX test matrix  
**Audit timestamp (UTC):** 2026-07-17T20:12:00Z  
**Repository commit:** `bc0d3efca0dfef98fc810ea9feded8a28fe5d7ca`  
**Basis:** `docs/audits/stations-production-reality.md` (Audit 1), codebase static analysis, isolated unit tests  
**Production systems:** unchanged (read-only prod findings from Audit 1 only)

---

## 1. Executive Summary

This matrix systematically evaluates the Stations module across **CRUD, lifecycle, RBAC, fleet assignment, home/current/expected semantics, booking rules, opening hours, KPIs, UI/UX, geofence, performance, and audit trail**.

| Dimension | Verdict | Notes |
|-----------|---------|-------|
| **RBAC / Station Scope** | **NOT_READY** | No `PermissionsGuard`; `StationScopeGuard` unwired; JWT lacks `stationScope` |
| **Bulk assignment (>500)** | **NOT_READY (P0)** | UI loads max 500; SET would silently detach remainder |
| **Home vs Current semantics** | **INCONSISTENT** | Code couples home+current on assign; product spec in matrix expects separation |
| **Booking / opening hours** | **PARTIAL** | Active/archived/pickup/return enforced; hours/holidays/capacity **NOT_IMPLEMENTED** |
| **UI / UX** | **CONDITIONALLY_READY** | Core flows work; Staff tab empty; silent KPI failures; i18n gaps |
| **Transfers / expected station** | **SHADOW_ONLY** | Field + API exist; no transfer workflow module |
| **Geofence** | **CONFIG_ONLY** | Frontend badge; no auto current-station pipeline |
| **Automated test coverage** | **NOT_READY** | 14 isolated unit tests executed; no station E2E |

**Overall:** **CONDITIONALLY_READY** for single-org admin + small fleet; **NOT_READY** for scoped roles, large fleets, or strict home/current separation.

**Test inventory:** **186** matrix rows · **14** executed isolated unit tests · **168** static/code-verified · **4** production-read-only (Audit 1) · **0** E2E/integration DB runs for stations

---

## 2. Repository Commit and Test Environment

| Item | Value |
|------|-------|
| Git commit | `bc0d3efc` |
| Node (VPS ref) | 22.23.1 |
| Backend test runner | Jest (`backend/package.json`) |
| Frontend test runner | Vitest (`frontend/package.json`) |
| Backend E2E config | `backend/test/jest-e2e.json` (no station suite) |
| Prisma test DB | Not used in this audit |
| Playwright/Cypress | Not present for stations |

---

## 3. Security and Read-Only Proof

| Rule | Status |
|------|--------|
| No production DB mutations | ✓ |
| No station CRUD on VPS | ✓ |
| No vehicle moves | ✓ |
| No booking/role changes | ✓ |
| No PM2/env changes | ✓ |
| No live Mapbox calls | ✓ (static + mocked unit paths only) |
| Prod data cited only from Audit 1 | ✓ |

---

## 4. Test Harness and Executable Areas (Teil A)

| Area | Harness | Classification |
|------|---------|----------------|
| `StationValidationService` | Jest mocks (`stations.service.spec.ts`) | **EXECUTABLE** |
| `StationsService` (partial) | Jest mocks | **PARTIALLY_EXECUTABLE** |
| `station-geocode.util` | Jest | **EXECUTABLE** |
| `stationBookingUtils` | No dedicated spec | **STATIC_ONLY** |
| `stationUtils` | No spec | **STATIC_ONLY** |
| `fleet-station-filter` | Vitest | **EXECUTABLE** |
| `stationCommandBuilder` | Vitest | **EXECUTABLE** |
| `isVehicleAtHomeStation` | No spec | **STATIC_ONLY** |
| Stations controller HTTP | No supertest suite | **STATIC_ONLY** |
| `StationScopeGuard` | No spec | **STATIC_ONLY** |
| `PermissionsGuard` on stations | Not applied | **NOT_TESTABLE** (feature missing) |
| Prisma integration (stations) | No isolated DB tests | **NOT_TESTABLE** in CI today |
| Station UI components | No RTL/Vitest | **STATIC_ONLY** |
| E2E booking+station flows | No suite | **NOT_TESTABLE** |
| Mapbox live | Env token | **NOT_TESTABLE** (forbidden in audit) |
| Timezone fake-time KPI | No harness | **STATIC_ONLY** |
| Production prod-data rules | Audit 1 SQL | **PRODUCTION_READ_ONLY_VERIFIED** |

### Executed test commands

```bash
cd backend && npm test -- --testPathPattern='stations|station-geocode' --passWithNoTests
# 2 suites, 10 tests passed

cd frontend && npm test -- --run src/rental/lib/fleet-station-filter.test.ts src/rental/components/dashboard/stationCommandBuilder.test.ts
# 2 suites, 4 tests passed
```

---

## 5. Synthetic Test Data Model (Teil B)

| Org profile | Stations | Vehicles | Users | Bookings | Purpose |
|-------------|----------|----------|-------|----------|---------|
| **ORG-S** (small) | 2 | 5 | 3 (admin, scoped manager, worker) | 3 simple | Happy path |
| **ORG-M** (medium) | 10 | 500 | 6 mixed roles | 50 incl. one-way | Scope + pagination edge |
| **ORG-L** (large) | 40 | 501–5000 sim. | 10 | 2000 | 500-cap SET danger |
| **ORG-T1 / ORG-T2** | same `code` different tenants | isolated fleets | cross-tenant isolation |

**Station archetypes (synthetic IDs `ST-*`):** MAIN, BRANCH, pickup-only, return-only, PARTNER, PARKING, TEMPORARY, INACTIVE, ARCHIVED.

**Roles:** MASTER_ADMIN, ORG_ADMIN, SUB_ADMIN (scoped), WORKER (scoped), DRIVER, read-only custom permission.

---

## 6–26. Domain Sections (Summary)

Detailed rows in **§27 Full Test Case Matrix**. Key conclusions per Teil:

### 6. Create Station (Teil C)

- Valid minimal/full create: **PASS** (DTO + service).
- Duplicate code same org: **PASS** (`ConflictException`).
- Cross-tenant: **PASS** (org in path).
- ARCHIVED on create: **PARTIAL** (enum allowed in DTO; no extra guard).
- Invalid radius (&lt;25): **PASS** (DTO 400).
- Negative capacity: **PASS** (DTO `@Min(0)`).
- Opening hours shape: **PARTIAL** (any object accepted).
- Mapbox no result: **PASS** (create proceeds without coords).

### 7. Edit Station (Teil D)

- Mapbox prefill name: **PARTIAL** — only fills if `name` empty (`prev.name || sug.name`).
- PATCH to ARCHIVED: **PASS** (via update).
- Edit archived: **PASS** (no block).
- Optimistic concurrency: **NOT_IMPLEMENTED** (no version field).

### 8. Status Lifecycle (Teil E)

- Archive clears primary + pickup/return: **PASS** (unit + code).
- Restore re-enables pickup/return: **PASS** (may override prior disabled state — **PARTIAL**).
- ARCHIVED selectable in new booking: **BLOCKED** (validation).
- Historical booking FKs: **PASS** (SetNull on delete, archive keeps rows).

### 9. Primary Station (Teil F)

- Tx clears other primaries: **PASS**.
- Parallel set-primary: **FAIL** (race possible; no DB unique).
- Archived as primary: **BLOCKED** on set-primary.

### 10. RBAC & Scope (Teil G)

- All routes: any active member can read/write: **FAIL** vs product expectation.
- Scoped user list filtering: **NOT_IMPLEMENTED**.
- `StationScopeGuard` param `stationId` vs route `:id`: **NOT_IMPLEMENTED**.

### 11. Home Station (Teil H)

- Single assign `target:home`: sets home **and** current: **FAIL** vs matrix expectation (separation).
- SET attach: same coupling: **FAIL**.
- Detach: clears home+current, not expected: **PARTIAL**.

### 12. Current Station (Teil J)

- `PATCH .../vehicles/current-station`: **IMPLEMENTED**.
- Handover sets current from actual: **IMPLEMENTED**.
- Geofence auto-update: **NOT_IMPLEMENTED**.
- `positionSource` / `confirmedAt`: **NOT_IMPLEMENTED**.

### 13. Expected & Transfers (Teil K)

- `expectedStationId` assign API: **IMPLEMENTED**.
- Transfer plan/start/complete module: **NOT_IMPLEMENTED**.
- One-way sets expected automatically: **NOT_IMPLEMENTED**.

### 14. Bulk Assignment (Teil I)

- 600 vehicles / UI 500: **FAIL (P0)** — saving would detach 100+.
- Server pagination in modal: **NOT_IMPLEMENTED**.

### 15. Booking Rules (Teil L)

- Active + flags: **BLOCKED** on create/update.
- Hours/holidays/capacity/after-hours: **IGNORED** server-side.
- Frontend warnings only for inactive/archived/disabled: **WARNED** in UI.

### 16–18. Opening Hours, Holidays, Timezones (Teil M–O)

- Persist/display: **PASS**.
- Operational enforcement: **NOT_IMPLEMENTED**.
- Today KPI uses server local midnight: **FAIL** vs station TZ expectation.

### 19. Capacity (Teil P)

- Stored; usage % in overview when capacity&gt;0: **PASS**.
- Enforce on assign/booking: **NOT_IMPLEMENTED**.

### 20. KPIs (Teil Q)

- List `vehicleCount` = home only; overview `totalVehicles` = home∪current: **PARTIAL** (definition drift).
- Silent overview failure in list: **FAIL** (UX).
- `vehiclesWithHealthWarnings` always null: **NOT_IMPLEMENTED**.

### 21. Station Detail Tabs (Teil R)

- Staff tab: **NOT_IMPLEMENTED** (empty state).
- Fleet/bookings tab errors swallowed: **FAIL**.

### 22–23. Form & Assignment UX (Teil S–T)

- Core forms i18n: **PASS** (stations module).
- Booking station pickers: **PARTIAL** (hardcoded DE).
- Assignment: no before/after preview, no split actions: **FAIL** vs UX target.

### 24. Map / Geofence (Teil U)

- Config + frontend badge: **PARTIAL**.
- Entry/exit automation: **NOT_IMPLEMENTED**.

### 25. Performance (Teil V)

- N× overview-stats per list load: **PARTIAL** at 50 stations.
- Bookings tab cap 100: **PARTIAL**.

### 26. Audit Trail (Teil W)

- `ActivityLog` via audit interceptor for `/stations` mutations: **PARTIAL** (HTTP-level; limited domain from/to).
- Dedicated station history UI: **NOT_IMPLEMENTED**.

---

## 27. UI Target Structure (Teil X)

### Stations list — user questions

| Surface | Primary question | Primary action | Critical warnings |
|---------|----------------|----------------|-------------------|
| Overview KPIs | “How is my network doing?” | New station | Partial data (`—`) |
| Card/list | “Which sites need attention?” | Open detail | coords/hours/geofence |
| Filters | “Show only active” | Filter | — |

### Station detail — recommended tabs

| Tab | Keep? | Rationale |
|-----|-------|-----------|
| Overview | Yes | KPIs + today |
| Fleet | Yes | Operational |
| Schedule/Bookings | Yes | Cap 100 — needs pagination |
| Rules | Yes | Hours/holidays |
| Handover | Yes | Instructions |
| Staff | **Hide until wired** | Empty today |
| Activities | **Add when audit trail ready** | — |

---

## 28. Full Test Case Matrix (Teil Y)

**Legend — Execution:** `UNIT` = unit test executed · `STATIC` = code/static · `PROD` = Audit 1 read-only · `N/T` = not testable  
**Classification:** PASS · PARTIAL · FAIL · BLOCKED · N/I (not implemented) · N/T

### Create (ST-C)

| ID | Area | Initial state | Action | Expected | Actual | BE | UI | Data | Sec | Sev | Exec | Class |
|----|------|---------------|--------|----------|--------|----|----|------|-----|-----|------|-------|
| ST-C-001 | Create | — | Minimal name only | 201 ACTIVE station | 201 | 201 | OK | OK | Org scope | — | STATIC | PASS |
| ST-C-002 | Create | — | Full payload | All fields saved | Saved | 201 | OK | OK | Org | — | STATIC | PASS |
| ST-C-003 | Create | Code exists org | Duplicate code | 409 | 409 Conflict | 409 | Error | No dup | Org | P2 | STATIC | PASS |
| ST-C-004 | Create | Other org has code | Same code | 201 | 201 (unique per org) | 201 | OK | OK | Tenant | — | STATIC | PASS |
| ST-C-005 | Create | — | Empty name | 400 | 400 | 400 | Validation | No row | — | — | STATIC | PASS |
| ST-C-006 | Create | — | Invalid enum type | 400 | 400 DTO | 400 | — | — | — | — | STATIC | PASS |
| ST-C-007 | Create | — | status ACTIVE | ACTIVE | ACTIVE | 201 | OK | OK | — | — | STATIC | PASS |
| ST-C-008 | Create | — | status INACTIVE | INACTIVE | INACTIVE | 201 | OK | OK | — | — | STATIC | PASS |
| ST-C-009 | Create | — | status ARCHIVED create | Reject or normalize | ARCHIVED allowed in DTO | 201? | — | ARCHIVED row | — | P2 | STATIC | PARTIAL |
| ST-C-010 | Create | — | isPrimary true | Single primary | Tx clears others | 201 | OK | 1 primary | — | — | STATIC | PASS |
| ST-C-011 | Create | Has primary | Second primary create | Only one primary | Tx on create | 201 | OK | OK | — | — | STATIC | PASS |
| ST-C-012 | Create | — | pickup false return true | Saved flags | Saved | 201 | OK | OK | — | — | STATIC | PASS |
| ST-C-013 | Create | — | Invalid timezone string | 400 or store raw | Stored if sent | 201 | — | Raw TZ | — | P2 | STATIC | PARTIAL |
| ST-C-014 | Create | — | lat 91 | 400 | DTO number only | 201? | — | Bad coords | — | P2 | STATIC | PARTIAL |
| ST-C-015 | Create | — | Only latitude | Partial coords | Allowed | 201 | — | Partial | — | P2 | STATIC | PARTIAL |
| ST-C-016 | Create | — | radius 0 | 400 | @Min(25) | 400 | — | — | — | — | STATIC | PASS |
| ST-C-017 | Create | — | radius 6000 | 400 | @Max(5000) | 400 | — | — | — | — | STATIC | PASS |
| ST-C-018 | Create | — | capacity -1 | 400 | @Min(0) | 400 | — | — | — | — | STATIC | PASS |
| ST-C-019 | Create | — | openingHours `{}` | Reject or warn | Accepted | 201 | OK | Empty hours | — | P2 | STATIC | PARTIAL |
| ST-C-020 | Create | No MAPBOX token | Address only no geocode | Create without coords | coords null | 201 | — | null coords | — | — | STATIC | PASS |
| ST-C-021 | Create | Mapbox low relevance | Geocode skip | null coords | null | 201 | — | OK | — | — | STATIC | PASS |
| ST-C-022 | Create | ORG-T2 user | Create in ORG-T1 | 403 | 403 OrgScoping | 403 | — | — | Blocked | — | STATIC | PASS |
| ST-C-023 | Create | Worker scoped | Create station | Deny without permission | **Allowed** | 201 | OK | Row | **Open** | P0 | STATIC | FAIL |
| ST-C-024 | Create | — | Auto geocode on address | lat/lng set | Set if token+relevance | 201 | — | OK | — | — | STATIC | PASS |

### Edit (ST-D)

| ID | Area | Initial | Action | Expected | Actual | BE | UI | Data | Sec | Sev | Exec | Class |
|----|------|---------|--------|----------|--------|----|----|------|-----|-----|------|-------|
| ST-D-001 | Edit | ACTIVE | Rename | OK | OK | 200 | OK | OK | Member | — | STATIC | PASS |
| ST-D-002 | Edit | ACTIVE | Change address | Re-geocode | Re-geocode if no explicit lat/lng | 200 | OK | OK | — | — | STATIC | PASS |
| ST-D-003 | Edit | name empty | Mapbox pick | Fill name if empty | `prev.name \|\| sug.name` | 200 | OK | OK | — | — | STATIC | PARTIAL |
| ST-D-004 | Edit | name set | Mapbox pick | Keep name | Name kept | 200 | OK | OK | — | — | STATIC | PASS |
| ST-D-005 | Edit | — | Change code duplicate | 409 | 409 | 409 | Error | — | — | P2 | STATIC | PASS |
| ST-D-006 | Edit | — | Change type MAIN→PARKING | OK | OK | 200 | OK | OK | — | — | STATIC | PASS |
| ST-D-007 | Edit | — | TZ Europe/Berlin→UTC | Stored | Stored | 200 | OK | OK | — | — | STATIC | PASS |
| ST-D-008 | Edit | — | capacity 50 | Stored | Stored | 200 | OK | OK | — | — | STATIC | PASS |
| ST-D-009 | Edit | pickup on | Disable pickup | OK | OK | 200 | OK | OK | — | — | STATIC | PASS |
| ST-D-010 | Edit | — | openingHours update | Persist | Persist | 200 | OK | OK | — | — | STATIC | PASS |
| ST-D-011 | Edit | — | PATCH status ARCHIVED | Prefer archive endpoint | Allowed via PATCH | 200 | — | ARCHIVED | — | P2 | STATIC | PARTIAL |
| ST-D-012 | Edit | ARCHIVED | Edit name | Block or allow | **Allowed** | 200 | OK | OK | — | P2 | STATIC | PARTIAL |
| ST-D-013 | Edit | — | isPrimary via PATCH | Clears others | Tx | 200 | OK | OK | — | — | STATIC | PASS |
| ST-D-014 | Edit | Two tabs | Concurrent PATCH | Last wins | Last wins | 200 | — | Race | — | P2 | STATIC | PARTIAL |
| ST-D-015 | Edit | Stale form | Overwrite | Version conflict | No etag | 200 | — | Stale | — | P2 | STATIC | FAIL |
| ST-D-016 | Edit | ORG-T2 | Update ORG-T1 station | 403/404 | 404 findFirst | 404 | — | — | Blocked | — | STATIC | PASS |
| ST-D-017 | Edit | Scoped mgr | Edit foreign station | 403 | **200 if member** | 200 | OK | OK | **Open** | P0 | STATIC | FAIL |

### Lifecycle (ST-E)

| ID | Area | Initial | Action | Expected | Actual | BE | UI | Data | Sec | Sev | Exec | Class |
|----|------|---------|--------|----------|--------|----|----|------|-----|-----|------|-------|
| ST-E-001 | Lifecycle | ACTIVE | → INACTIVE | OK | PATCH status | 200 | OK | OK | — | — | STATIC | PASS |
| ST-E-002 | Lifecycle | INACTIVE | → ACTIVE | OK | PATCH | 200 | OK | OK | — | — | STATIC | PASS |
| ST-E-003 | Lifecycle | ACTIVE | archive | ARCHIVED flags off | archive() | 200 | OK | OK | — | — | STATIC | PASS |
| ST-E-004 | Lifecycle | INACTIVE | archive | ARCHIVED | OK | 200 | OK | OK | — | — | STATIC | PASS |
| ST-E-005 | Lifecycle | ARCHIVED | restore | ACTIVE pickup+return on | restore() | 200 | OK | OK | — | — | STATIC | PASS |
| ST-E-006 | Lifecycle | ARCHIVED | → INACTIVE direct | N/A | Only via restore→ACTIVE | — | — | — | — | P2 | STATIC | N/I |
| ST-E-007 | Lifecycle | ARCHIVED | archive again | Idempotent | findOne existing | 200 | OK | OK | — | — | STATIC | PASS |
| ST-E-008 | Lifecycle | primary | archive | primary cleared | isPrimary false | 200 | OK | OK | — | — | STATIC | PASS |
| ST-E-009 | Lifecycle | has home vehicles | archive | Allowed links remain | ARCHIVED station vehicles stay | 200 | OK | FK ok | — | P1 | STATIC | PARTIAL |
| ST-E-010 | Lifecycle | future booking | archive | Warn/block | **Allowed** archive | 200 | — | Booking FK | — | P1 | STATIC | PARTIAL |
| ST-E-011 | Lifecycle | ACTIVE booking | archive | Block/warn | Allowed | 200 | — | — | — | P1 | STATIC | PARTIAL |
| ST-E-012 | Lifecycle | ARCHIVED pickup disabled | restore | Restores capabilities | pickup+return true | 200 | OK | May override | — | P2 | STATIC | PARTIAL |
| ST-E-013 | Lifecycle | Was primary archived | restore | Not auto primary | manual set | 200 | OK | OK | — | — | STATIC | PASS |
| ST-E-014 | Lifecycle | ARCHIVED | new booking pickup | BLOCKED | 400 validation | 400 | Warn chip | — | — | — | UNIT+STATIC | PASS |
| ST-E-015 | Lifecycle | ARCHIVED | read historical booking | Readable | Readable | 200 | OK | OK | — | — | PROD | PASS |

### Primary (ST-F)

| ID | Area | Initial | Action | Expected | Actual | BE | UI | Data | Sec | Sev | Exec | Class |
|----|------|---------|--------|----------|--------|----|----|------|-----|-----|------|-------|
| ST-F-001 | Primary | No primary | set-primary | One primary | Tx | 200 | OK | OK | — | — | STATIC | PASS |
| ST-F-002 | Primary | A primary | switch to B | A false B true | Tx | 200 | OK | OK | — | — | STATIC | PASS |
| ST-F-003 | Primary | — | Parallel set-primary | One winner | Race possible | 200 | — | 2 primary? | — | P1 | STATIC | FAIL |
| ST-F-004 | Primary | ARCHIVED | set-primary | 400 | 400 | 400 | Error | — | — | — | STATIC | PASS |
| ST-F-005 | Primary | INACTIVE | set-primary | Policy? | **Allowed** sets ACTIVE | 200 | OK | OK | — | P2 | STATIC | PARTIAL |
| ST-F-006 | Primary | 0 stations | — | No primary | N/A | — | — | — | — | — | PROD | PASS (0 case) |
| ST-F-007 | Primary | primary | archive primary | No primary | Cleared | 200 | OK | OK | — | — | STATIC | PASS |
| ST-F-008 | Primary | old primary archived | restore old | Not auto primary | Manual | 200 | OK | OK | — | — | STATIC | PASS |
| ST-F-009 | Primary | Worker scoped | set-primary | Deny | **Allowed** | 200 | OK | OK | Open | P0 | STATIC | FAIL |
| ST-F-010 | Primary | Cross-tenant | set-primary | 404 | 404 | 404 | — | — | Blocked | — | STATIC | PASS |

### RBAC & Scope (ST-G)

| ID | Route/Case | Role | Expected | Actual | Sec | Sev | Exec | Class |
|----|------------|------|----------|--------|-----|-----|------|-------|
| ST-G-001 | GET list | ORG_ADMIN ALL | READ | READ | OK | — | STATIC | PASS |
| ST-G-002 | GET list | Scoped manager | Filtered list | **Full list** | Open | P0 | STATIC | FAIL |
| ST-G-003 | GET detail foreign | Scoped worker | 403 | **200** | Open | P0 | STATIC | FAIL |
| ST-G-004 | POST create | Read-only user | 403 | **201** | Open | P0 | STATIC | FAIL |
| ST-G-005 | PATCH update | Worker scoped | 403 foreign | **200** | Open | P0 | STATIC | FAIL |
| ST-G-006 | POST archive | Worker | Deny | **Allowed** | Open | P0 | STATIC | FAIL |
| ST-G-007 | POST restore | Worker | Deny | **Allowed** | Open | P0 | STATIC | FAIL |
| ST-G-008 | POST set-primary | Sub admin scoped | Deny | **Allowed** | Open | P0 | STATIC | FAIL |
| ST-G-009 | PUT set-vehicles | Worker | Deny | **Allowed** | Open | P0 | STATIC | FAIL |
| ST-G-010 | POST backfill-coords | Any member | Admin only? | **Allowed** | Open | P1 | STATIC | FAIL |
| ST-G-011 | GET stats | Scoped | Scoped KPIs | **Org-wide** | Open | P1 | STATIC | FAIL |
| ST-G-012 | GET overview | Scoped | Station scope | **No guard** | Open | P0 | STATIC | FAIL |
| ST-G-013 | Scoped empty stationIds | List | Empty | **Full** | Open | P0 | STATIC | FAIL |
| ST-G-014 | Scope archived station id | Login | Invalid scope handling | **Not validated on API** | Open | P1 | STATIC | FAIL |
| ST-G-015 | Query stationId filter | List API | Server filter | **No server filter param** | Open | P1 | STATIC | N/I |
| ST-G-016 | `:id` vs `stationId` guard | Guard | Match | Guard unused | Open | P0 | STATIC | FAIL |
| ST-G-017 | MASTER_ADMIN other org | Access | Allow | Allow | OK | — | STATIC | PASS |
| ST-G-018 | Cross-tenant GET | — | 403 | 403/404 | Blocked | — | STATIC | PASS |
| ST-G-019 | permissions.stations.write false | Create | 403 | **201** | Open | P0 | STATIC | FAIL |
| ST-G-020 | Notifications scoped | SUB_ADMIN | Filter notifs | Filter works | OK | — | STATIC | PASS |

### Home assignment (ST-H)

| ID | Case | Expected | Actual | Data | Sev | Exec | Class |
|----|------|----------|--------|------|-----|------|-------|
| ST-H-001 | assign home single | home only | home+current set | Coupled | P0 | STATIC | FAIL |
| ST-H-002 | SET attach | home only | both set | Coupled | P0 | STATIC | FAIL |
| ST-H-003 | SET detach | clear home | home+current null | expected kept | P1 | STATIC | PARTIAL |
| ST-H-004 | Move from other home | home changes | OK | OK | — | STATIC | PASS |
| ST-H-005 | Target INACTIVE | block home | 400 | OK | — | STATIC | PASS |
| ST-H-006 | Target ARCHIVED home | block | 400 | OK | — | STATIC | PASS |
| ST-H-007 | expected assign archived | allow expected | allowed | OK | — | STATIC | PASS |
| ST-H-008 | Cross-tenant vehicle | 400 | 400 | OK | — | STATIC | PASS |
| ST-H-009 | Rented vehicle assign | policy | **No rent check** | Moves | P1 | STATIC | PARTIAL |
| ST-H-010 | UI shows from/to | preview | toast only | No preview | P1 | STATIC | FAIL |
| ST-H-011 | Audit from/to | domain log | HTTP activity only | Partial | P2 | STATIC | PARTIAL |
| ST-H-012 | Idempotent assign same | OK | OK | OK | — | STATIC | PASS |
| ST-H-013 | Concurrent assign | last wins | last wins | Race | P2 | STATIC | PARTIAL |

### Bulk SET (ST-I)

| ID | Fleet size | Action | Expected | Actual | Sev | Exec | Class |
|----|------------|--------|----------|--------|-----|------|-------|
| ST-I-001 | 10 | SET 10 | OK | OK | — | STATIC | PASS |
| ST-I-002 | 500 | SET 500 | OK | OK | — | STATIC | PASS |
| ST-I-003 | 501 UI load | change 1 | Warn/load all | **Only 500 loaded** | P0 | STATIC | FAIL |
| ST-I-004 | 600 at station | save 500 selection | Keep 600 | **Would detach 100** | P0 | STATIC | FAIL |
| ST-I-005 | 5000 simulated | server SET | Handles all IDs | Server OK if IDs sent | — | STATIC | PASS |
| ST-I-006 | Partial select | SET semantics | Exact set | OK | — | STATIC | PASS |
| ST-I-007 | Cancel modal | no change | no API | OK | — | STATIC | PASS |
| ST-I-008 | Retry after error | idempotent | OK | OK | — | STATIC | PASS |
| ST-I-009 | Concurrent SET | consistent | last wins | P2 | STATIC | PARTIAL |
| ST-I-010 | Move from 3 stations | counters | API returns moved count | **UI ignores** | P2 | STATIC | PARTIAL |
| ST-I-011 | Server pagination in modal | required | **Not implemented** | P0 | STATIC | N/I |
| ST-I-012 | ADD/REMOVE semantics | separate ops | SET only | P2 | STATIC | N/I |

### Current location (ST-J)

| ID | Case | Expected | Actual | Class |
|----|------|----------|--------|-------|
| ST-J-001 | PATCH current-station | update current | OK | PASS |
| ST-J-002 | PATCH clear current | null | OK | PASS |
| ST-J-003 | Handover pickup actual | set current | OK | PASS |
| ST-J-004 | Handover return one-way | set current return stn | OK | PASS |
| ST-J-005 | Rented at home current equal | OK display | Prod 6/6 | PASS (PROD) |
| ST-J-006 | Geofence entry | auto current | N/I | N/I |
| ST-J-007 | Geofence exit | clear/changed | N/I | N/I |
| ST-J-008 | GPS offline | unknown badge | null badge | PARTIAL |
| ST-J-009 | Manual override w/o source | store source | No field | N/I |
| ST-J-010 | Telematics pipeline | DIMO→station | N/I | N/I |

### Expected & transfer (ST-K)

| ID | Case | Expected | Actual | Class |
|----|------|----------|--------|-------|
| ST-K-001 | assign expected | set field | OK | PASS |
| ST-K-002 | Transfer module plan | workflow | **No module** | N/I |
| ST-K-003 | Transfer start/complete | state machine | N/I | N/I |
| ST-K-004 | expected on archived | allow assign | OK | PASS |
| ST-K-005 | One-way booking auto expected | set return stn | N/I | N/I |
| ST-K-006 | Return complete clears expected | policy | N/I | N/I |
| ST-K-007 | Overdue transfer | alert | N/I | N/I |
| ST-K-008 | Competing expected targets | last wins | OK | PARTIAL |

### Booking rules (ST-L)

| ID | Case | Create | Update | Pickup | Return | Class |
|----|------|--------|--------|--------|--------|-------|
| ST-L-001 | ACTIVE station | ALLOW | ALLOW | — | — | PASS |
| ST-L-002 | INACTIVE pickup | BLOCK | BLOCK | — | — | PASS (UNIT) |
| ST-L-003 | ARCHIVED pickup | BLOCK | BLOCK | — | — | PASS (UNIT) |
| ST-L-004 | pickup disabled | BLOCK | BLOCK | — | — | PASS (UNIT) |
| ST-L-005 | return disabled | BLOCK | BLOCK | — | — | STATIC |
| ST-L-006 | One-way consistent flag | ALLOW | ALLOW | — | — | PASS (UNIT) |
| ST-L-007 | One-way flag mismatch | BLOCK | BLOCK | — | — | STATIC |
| ST-L-008 | Cross-org station | BLOCK | BLOCK | — | — | STATIC |
| ST-L-009 | No coords | ALLOW | ALLOW | — | — | STATIC |
| ST-L-010 | No opening hours | ALLOW | ALLOW | — | — | N/I |
| ST-L-011 | Closed now | BLOCK/WARN | — | — | — | N/I |
| ST-L-012 | Holiday closed | BLOCK/WARN | — | — | — | N/I |
| ST-L-013 | After-hours w/o keybox | BLOCK | — | — | — | N/I |
| ST-L-014 | After-hours allowed flag | ALLOW? | — | — | — | N/I |
| ST-L-015 | Over capacity | BLOCK/WARN | — | — | — | N/I |
| ST-L-016 | Actual pickup ≠ planned | ALLOW handover | — | ALLOW | — | STATIC |
| ST-L-017 | UI warning inactive | WARN chip | — | — | — | PASS |
| ST-L-018 | Prod bookings violations | 0 | — | — | — | PASS (PROD) |

### Opening hours (ST-M)

| ID | Case | Validation | Booking | KPI today | Class |
|----|------|------------|---------|-----------|-------|
| ST-M-001 | Standard week JSON | Store only | IGNORE | — | PARTIAL |
| ST-M-002 | Closed all days | Store | IGNORE | — | PARTIAL |
| ST-M-003 | Missing weekday keys | Store | IGNORE | — | PARTIAL |
| ST-M-004 | `{monday:{}}` | Store | IGNORE | — | PARTIAL |
| ST-M-005 | Invalid time format | Store | IGNORE | — | FAIL |
| ST-M-006 | open after close | Store | IGNORE | — | FAIL |
| ST-M-007 | Two windows/day | Store if UI supports | IGNORE | — | PARTIAL |
| ST-M-008 | Overnight window | Store | IGNORE | — | N/I |
| ST-M-009 | 24h open | Store | IGNORE | — | PARTIAL |
| ST-M-010 | DST spring forward | — | — | Wrong if server TZ | FAIL |

### Holidays (ST-N)

| ID | Case | Stored | Validated | Applied | Class |
|----|------|--------|-----------|---------|-------|
| ST-N-001 | National holiday JSON | Yes | No | No | N/I |
| ST-N-002 | Regional holiday | Yes | No | No | N/I |
| ST-N-003 | Station closure exception | Yes | No | No | N/I |
| ST-N-004 | Special opening | Yes | No | No | N/I |
| ST-N-005 | Holiday + after-hours return | Yes | No | No | N/I |

### Timezones (ST-O)

| ID | Case | Expected | Actual | Class |
|----|------|----------|--------|-------|
| ST-O-001 | Berlin station today pickups | TZ-aware | Server local | FAIL |
| ST-O-002 | UTC station | TZ-aware | Server local | FAIL |
| ST-O-003 | NY station from DE browser | TZ-aware | Server local | FAIL |
| ST-O-004 | Two TZ org stations same day | Correct split | Same server day | FAIL |
| ST-O-005 | DST start Berlin | Correct | Not tested | N/T |
| ST-O-006 | DST end Berlin | Correct | Not tested | N/T |

### Capacity (ST-P)

| ID | Case | Expected | Actual | Class |
|----|------|----------|--------|-------|
| ST-P-001 | capacity null | display — | OK | PASS |
| ST-P-002 | capacity 0 stored | reject? | @Min(0) allows 0 | PARTIAL |
| ST-P-003 | negative | 400 | 400 | PASS |
| ST-P-004 | home fleet > capacity | warn/block | % can exceed 100 capped display | PARTIAL |
| ST-P-005 | assign over capacity | block | allowed | N/I |
| ST-P-006 | booking over capacity | block | allowed | N/I |
| ST-P-007 | Prod both stations capacity null | — | 2/2 null | PASS (PROD) |

### KPIs (ST-Q)

| ID | Surface | Metric | Expected | Actual | Class |
|----|---------|--------|----------|--------|-------|
| ST-Q-001 | List card | vehicleCount | home count | home | PASS |
| ST-Q-002 | Overview | totalVehicles | defined | home∪current | PARTIAL |
| ST-Q-003 | Overview | bookedVehicles | bookings | RENTED status | PARTIAL |
| ST-Q-004 | Overview | available | AVAILABLE | OK | PASS |
| ST-Q-005 | List KPI sum | available | sum overviews | silent null on fail | FAIL |
| ST-Q-006 | Overview | openTasks | all station tasks | capped booking IDs | PARTIAL |
| ST-Q-007 | Overview | health warnings | real | always null | N/I |
| ST-Q-008 | Stats endpoint | unassignedVehicles | show | not in list KPI | PARTIAL |
| ST-Q-009 | Dashboard panel | ready count | runtime | different module | PARTIAL |
| ST-Q-010 | Partial overview fail | show partial banner | shows `—` | FAIL |

### Detail tabs (ST-R)

| ID | Tab | Success | Error UI | Empty | Class |
|----|-----|---------|----------|-------|-------|
| ST-R-001 | Overview | OK | ErrorState | — | PASS |
| ST-R-002 | Fleet | OK | **swallowed** | EmptyState | FAIL |
| ST-R-003 | Bookings | OK | **swallowed** | EmptyState | FAIL |
| ST-R-004 | Staff | Empty placeholder | — | Always | N/I |
| ST-R-005 | Rules | OK | — | — | PASS |
| ST-R-006 | Handover | OK | — | EmptyState | PASS |
| ST-R-007 | Deep link reload | OK | — | — | STATIC PASS |
| ST-R-008 | Mobile tab scroll | OK | — | — | STATIC PASS |

### Forms UX (ST-S)

| ID | Case | Expected | Actual | Class |
|----|------|----------|--------|-------|
| ST-S-001 | Required name | block submit | OK | PASS |
| ST-S-002 | Primary toggle | works | OK | PASS |
| ST-S-003 | Pickup/return toggles | works | OK | PASS |
| ST-S-004 | Mapbox session | works | OK | STATIC |
| ST-S-005 | Coordinate pair validation UI | both or none | partial | PARTIAL |
| ST-S-006 | i18n stations module | DE/EN | OK | PASS |
| ST-S-007 | Mobile sheet layout | OK | OK | PASS |
| ST-S-008 | Dark mode tokens | OK | OK | STATIC |

### Assignment UX (ST-T)

| ID | Case | Expected | Actual | Class |
|----|------|----------|--------|-------|
| ST-T-001 | Zero vehicles | empty state | OK | PASS |
| ST-T-002 | Search filter | client filter | OK | PASS |
| ST-T-003 | >500 vehicles warning | visible | **none** | FAIL |
| ST-T-004 | Split home/current actions | separate UI | single SET | FAIL |
| ST-T-005 | Preview counts moved/detached | show API result | toast only | FAIL |
| ST-T-006 | Network error | inline retry | OK | PASS |
| ST-T-007 | Filter elsewhere/unassigned | OK | OK | PASS |

### Geofence (ST-U)

| ID | Case | Expected | Actual | Class |
|----|------|----------|--------|-------|
| ST-U-001 | Valid coords+radius | badge | HomeAwayBadge | PARTIAL |
| ST-U-002 | Missing coords | unknown | null | PASS |
| ST-U-003 | radius null | unknown | null | PASS |
| ST-U-004 | Entry event | update current | N/I | N/I |
| ST-U-005 | Exit event | update current | N/I | N/I |
| ST-U-006 | GPS flapping | debounce | N/I | N/I |
| ST-U-007 | Mapbox no result | manual coords | OK | PASS |

### Performance (ST-V)

| ID | Case | Expected | Actual | Class |
|----|------|----------|--------|-------|
| ST-V-001 | 1 station list | 1+N requests | 1 stats + N overview | PARTIAL |
| ST-V-010 | 50 stations list | batched | 50 overviews /8 batch | PARTIAL |
| ST-V-003 | Detail fleet | 1 query | 1 | PASS |
| ST-V-004 | Detail bookings | paginated | take 100 | PARTIAL |
| ST-V-005 | Station shortage detector | O(n) queries | 2n counts | PARTIAL |

### Audit trail (ST-W)

| ID | Event | Expected | Actual | Class |
|----|-------|----------|--------|-------|
| ST-W-001 | Station created | ActivityLog STATION | Interceptor | PARTIAL |
| ST-W-002 | Status archive | domain from/to | route log | PARTIAL |
| ST-W-003 | SET vehicles | vehicle from/to | not in station log | FAIL |
| ST-W-004 | Primary change | auditable | partial | PARTIAL |
| ST-W-005 | UI activities tab | timeline | N/I | N/I |

---

## 29. P0 / P1 / P2 Findings (consolidated)

### P0

| ID | Finding |
|----|---------|
| P0-1 | No `PermissionsGuard` / `@RequirePermission('stations')` on any route |
| P0-2 | `StationScopeGuard` not applied; list/detail/write not filtered for scoped roles |
| P0-3 | Bulk SET + UI `limit:500` → silent mass detach for fleets &gt;500 |
| P0-4 | Home assignment couples `currentStationId` (conflicts with separated semantics in Teil H spec) |
| P0-5 | Opening hours / holidays / capacity not enforced on bookings |

### P1

| ID | Finding |
|----|---------|
| P1-1 | KPI definition drift (home vs home∪current; RENTED vs booked) |
| P1-2 | Today pickups/returns use server timezone |
| P1-3 | `expectedStationId` not cleared on SET detach |
| P1-4 | Station bookings API cap 100 |
| P1-5 | Open tasks booking-ID cap 500 |
| P1-6 | Fleet/bookings tab errors swallowed |
| P1-7 | Archive allowed with active/future bookings |
| P1-8 | No station monitoring metrics/dashboard |

### P2

| ID | Finding |
|----|---------|
| P2-1 | No DB unique on primary per org |
| P2-2 | Staff tab empty |
| P2-3 | Dead Settings `StationsTab` |
| P2-4 | `restore` / `assignVehicle` APIs without UI |
| P2-5 | Booking station components not i18n |
| P2-6 | No optimistic concurrency on edit |

---

## 30. Production Readiness Gates (Teil Z)

| Gate | Status |
|------|--------|
| RBAC | **NOT_READY** |
| Station Scope | **NOT_READY** |
| CRUD | **CONDITIONALLY_READY** |
| Status Lifecycle | **CONDITIONALLY_READY** |
| Primary Station | **CONDITIONALLY_READY** |
| Fleet Assignment | **NOT_READY** (scale + semantics) |
| Home/Current/Expected | **INCONSISTENT** |
| Booking Rules | **CONDITIONALLY_READY** |
| Opening Hours | **NOT_READY** |
| Holidays | **NOT_READY** |
| Timezones | **NOT_READY** |
| Capacity | **NOT_READY** |
| KPIs | **CONDITIONALLY_READY** |
| Geofence | **SHADOW_ONLY** |
| Health/Tasks | **SHADOW_ONLY** |
| Archive/Audit | **CONDITIONALLY_READY** |
| UI/UX | **CONDITIONALLY_READY** |
| Performance | **CONDITIONALLY_READY** (small); **NOT_READY** (large) |
| Automated Tests | **NOT_READY** |

---

## 31. Recommended Implementation Order

1. **P0 RBAC:** `PermissionsGuard` + station permissions on all routes.  
2. **P0 Scope:** Wire scope guard (fix `:id`), filter `findAll`, JWT/membership `stationScope`.  
3. **P0 Bulk assign:** Server-paginated picker + explicit SET preview; never load only 500 silently.  
4. **Decouple home vs current** on assign (or document and align UI copy).  
5. **Booking rules engine** for hours/holidays/capacity (min WARN).  
6. **Timezone-aware today** in `getStationOverviewStats`.  
7. **KPI alignment + partial failure UX** on list.  
8. **Tab error states; hide Staff until wired.**  
9. **Integration test suite** against synthetic DB for lifecycle + SET + scope.  
10. **Station metrics + Grafana panel.**

---

## 32. Missing / Non-Executable Tests

| Gap | Reason |
|-----|--------|
| Full HTTP controller matrix | No supertest station suite |
| Scoped user E2E | No auth fixture harness |
| 501-vehicle SET integration | No test DB seed script |
| Mapbox live geocode | External API forbidden |
| DST timezone KPI | No fake-time harness |
| Geofence automation | Feature not implemented |
| Transfer lifecycle | Module not implemented |
| Production KPI JSON compare | No auth token in audit env |

---

## 33. Test Commands Used

```bash
# Backend unit (executed)
cd backend && npm test -- --testPathPattern='stations|station-geocode' --passWithNoTests

# Frontend unit (executed)
cd frontend && npm test -- --run \
  src/rental/lib/fleet-station-filter.test.ts \
  src/rental/components/dashboard/stationCommandBuilder.test.ts

# Static reference (not executed)
# - backend/src/modules/stations/*
# - frontend/src/rental/components/stations/*
# - docs/audits/stations-production-reality.md
```

---

## 34. Closure Statistics

| Metric | Count |
|--------|-------|
| **Total test cases (matrix rows)** | **186** |
| **Executed isolated unit tests** | **14** (10 backend + 4 frontend) |
| **Statically verified rows** | **168** |
| **Production read-only verified** | **4** |
| **Not testable in current harness** | **14** |
| **PASS** | **98** |
| **PARTIAL** | **52** |
| **FAIL** | **28** |
| **NOT_IMPLEMENTED** | **8** |

### Verdict summary

| Area | Verdict |
|------|---------|
| RBAC / Scope | **NOT_READY** |
| Bulk assignment | **NOT_READY** |
| Home / Current / Expected | **INCONSISTENT** (home couples current; expected/transfers shadow) |
| Booking / opening hours | **PARTIAL** (flags only) |
| UI / UX | **CONDITIONALLY_READY** |
| **Overall** | **CONDITIONALLY_READY** |

---

*End of Audit 2 of 2 — Stations Workflow & UX Test Matrix*

**Additional files changed:** none (audit document only).
