# I18N Rental Stations — P2.2.6 (2026-08-19)

## Governance snapshot

| Item | Value |
|------|-------|
| Branch | `i18n/production-hardening-p2-2-6-2026-08` |
| Parent (P2.2.5 checkpoint) | `f312627d11a139b7208b5cedd0a4e357f3f0977c` |
| Scope | Presentation / localization only |
| Business logic changed | **NO** |

## Scope

P2.2.6 migrates Rental **Stations** presentation debt in the legacy settings tab and booking station selectors into canonical platform i18n (`frontend/src/i18n`). Station CRUD semantics, form validation, assignment logic, routing, API contracts, and permissions are unchanged.

### In scope

- `rental/components/stations/StationsTab.tsx` (50 scanner findings at baseline)
- `rental/components/stations/StationSelectFields.tsx` (7 scanner findings at baseline)
- `rental/components/stations/stations-i18n.ts` (warning label helper)
- `frontend/src/i18n/translations/stations-tab.{en,de}.ts` (spread into main dictionaries)
- P2.2.6 enforce-clean scanner boundary: `rental/components/stations/**`
- Shim migration: existing station shells → canonical imports

### Out of scope

- Voice Assistant, WhatsApp, Finance/Billing, Support, Documents
- Tasks debt (17 remaining, Category A)
- Other Rental areas, Master, Operator, API/backend
- Wiring `StationsTab` into Settings (no functional change)

## Pattern

- **React:** `useLanguage()` → `t`, `locale`
- **Non-React:** `st()` / `labelStationWarning()` from `stations-i18n.ts`
- **Reuse:** `stations.*` (form, status, assign, empty), `common.*`, `bookings.detail.oneWayRental`
- **Imports:** touched stations files use `../../../i18n/` (canonical); no new `../i18n/` compat consumers

## Enforce-clean boundary (P26)

`frontend/scripts/i18n-hardcoded-scan.mjs`:

- Prefix: `rental/components/stations/**`
- Migration phase label: `P2.2.6`

**P2.2.6 enforce-clean findings: 0** (baseline **57**)

## Scanner findings before/after

| Metric | P2.2.5 checkpoint | P2.2.6 final |
|--------|------------------:|-------------:|
| Stations module (scanner) | **57** | **0** |
| P2.2.6 in-scope enforce-clean | — | **0** |
| Global findings | **2212** | **2155** |
| Rental findings | **890** | **833** |
| Enforce-clean (global) | **0** | **0** |

### Rental module breakdown (final)

| Module | Findings |
|--------|--------:|
| other Rental areas | 474 |
| Finance/Billing | 131 |
| Voice Assistant | 111 |
| WhatsApp | 72 |
| Tasks (out of P24 zone) | 17 |
| Support | 19 |
| Documents | 8 |
| Stations | **0** |
| Workflow Automation | 0 |

## Canonical keys

| Metric | Count |
|--------|------:|
| Canonical keys at P2.2.5 checkpoint | **6265** |
| Net canonical growth (`stations-tab` spread) | **98** |
| Final canonical count | **6363** |

**Invariant:** `6265 + 98 = 6363` ✓

### New key prefixes (`stations-tab.{en,de}.ts`)

- `stations.tab.*` — legacy settings tab UI (header, backfill banner, modals, geofence, assignment)
- `stations.select.*` — booking station pickers (`StationSelectFields`)

### SAME-SEMANTIC reuse (not added)

`stations.newStation`, `stations.empty.title`, `stations.empty.description`, `stations.form.*` (address fields, phone, email, status, notes), `stations.assign.title`, `stations.assign.filter.all`, `stations.status.ACTIVE` / `INACTIVE`, `common.cancel`, `common.save`, `common.saving`, `common.delete`, `common.edit`, `common.reload`, `bookings.detail.oneWayRental`.

## Coverage

| Locale | Keys | Status |
|--------|-----:|--------|
| en | 6363 | COMPLETE |
| de | 6363 | COMPLETE |

## Shim accounting

| Metric | Before | After |
|--------|-------:|------:|
| Station shells on `../../i18n/` (rental shim) | 4 | 0 |
| Files migrated to `../../../i18n/` | — | StationsView, StationFormModal, StationDetailView, StationAssignVehicleModal |

Touched P2.2.6 production files use canonical `../../../i18n/` only. Zero new `../i18n/` compatibility consumers.

## Category A/B/C

| Category | Count | Notes |
|----------|------:|-------|
| A | unchanged | Pre-existing out-of-zone debt |
| B | 0 | No module reclassification in P2.2.6 |
| C | 0 | Required |

## Tests executed

| Suite | Result |
|-------|--------|
| `rental-stations-localization.test.tsx` | PASS |
| `hardcoded-copy-guard.test.ts` (P2.2.6 scope) | PASS |
| `npm run i18n:check` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## Files changed

### Production

- `frontend/src/rental/components/stations/StationsTab.tsx`
- `frontend/src/rental/components/stations/StationSelectFields.tsx`
- `frontend/src/rental/components/stations/stations-i18n.ts`
- `frontend/src/rental/components/stations/StationsView.tsx` (shim→canonical)
- `frontend/src/rental/components/stations/StationFormModal.tsx` (shim→canonical)
- `frontend/src/rental/components/stations/StationDetailView.tsx` (shim→canonical)
- `frontend/src/rental/components/stations/StationAssignVehicleModal.tsx` (shim→canonical)
- `frontend/src/i18n/translations/stations-tab.en.ts`
- `frontend/src/i18n/translations/stations-tab.de.ts`
- `frontend/src/i18n/translations/en.ts`
- `frontend/src/i18n/translations/de.ts`
- `frontend/scripts/i18n-hardcoded-scan.mjs`
- `frontend/src/master/components/ChangesView.tsx`
- `frontend/src/master/components/ArchitekturView.tsx`

### Tests / inventory

- `frontend/src/rental/components/rental-stations-localization.test.tsx`
- `frontend/src/i18n/hardcoded-copy-guard.test.ts`
- `frontend/src/i18n/hardcoded-copy-inventory.json` (regenerated by scanner)

### Documentation

- `architecture/I18N_RENTAL_STATIONS_P2_2_6_2026-08-19.md`

## Business logic preservation

Confirmed unchanged: station list/load/stats, Mapbox autocomplete, create/update/delete, status toggle, coordinate backfill, geofence radius validation, vehicle assignment SET-semantics, filter/search behavior, and `StationSelectFields` pickup/return/same-return/one-way logic.

## Changes / Architektur

- **ChangesView:** V4.9.926 entry added
- **ArchitekturView:** P2.2.6 frontend flow entry added
- **This document:** architecture record for P2.2.6
