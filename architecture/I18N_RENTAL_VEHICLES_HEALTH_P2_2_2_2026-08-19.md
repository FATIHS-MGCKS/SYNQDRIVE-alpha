# I18N Rental Vehicles, Vehicle Detail & Fleet Health — P2.2.2 (2026-08-19)

## Scope

P2.2.2 extracts user-facing copy from the Rental **vehicle domain presentation layer** into canonical platform i18n (`frontend/src/i18n`). This is localization/presentation only — Fleet Health business logic, readiness algorithms, telemetry thresholds, and DTC processing are unchanged.

## True vehicle-domain baseline (pre-extraction)

P2.2.1 scanner classified only ~13 findings under “Fleet / Vehicles”. Path-based reclassification before P2.2.2 identified **~475 findings across ~58 files** in:

| Submodule | Approx. findings |
|-----------|------------------|
| Vehicle Health (`HealthErrorsView`, `health/*`, `battery/*`) | ~233 |
| Vehicle Maintenance (`service-center/*`, service lib helpers) | ~67 |
| Vehicle Detail shell / overview | ~50 |
| Fleet shell / condition | ~39 |
| Vehicle Trips | ~35 |
| Vehicle bookings chrome | ~33 |
| Fleet Health Service UI | ~18 |

## Enforce-clean boundary (P2.2.2)

### A. Fleet / Vehicles shell

- `rental/components/FleetHubView.tsx`, `FleetView.tsx`, `FleetMapControls.tsx`, `LiveMapOverview.tsx`
- `rental/components/FleetConditionView.tsx`, `FleetConditionDetailView.tsx`, `FleetConditionVirtualizedVehicleRows.tsx`
- `rental/components/fleet/**`, `rental/components/fleet-operator/**`
- `rental/components/StatInlineDetail.tsx`
- `rental/lib/fleet*.ts`, `lib/formatVehicleDisplay.ts`

### B. Vehicle Detail shell

- `rental/components/vehicle-detail/**`
- `rental/components/VehicleBookingsView.tsx`, `VehicleTasksView.tsx`, `VehicleStressPanel.tsx`
- `rental/components/documents/VehicleDocumentUploadDrawer.tsx`

### C. Vehicle Overview

- Overview tab cards, readiness strips, device connection, header badges (`vehicle-detail/*Overview*`, `VehicleDeviceConnectionCard`, etc.)

### D. Trips

- `rental/components/trips/**`

### E. Health

- `rental/components/HealthErrorsView.tsx`
- `rental/components/health/**`, `rental/components/battery/**`
- `rental/components/DashboardWarningLightsPanel.tsx`, `DashboardWarningLightsQuickView.tsx`
- `rental/components/rental-health/**`
- `rental/rental-health-ui.ts`
- `rental/lib/health-*`, `rental/lib/battery-*`, `rental/lib/tire-*`, `rental/lib/brake-*`, `rental/lib/rental-health-*`

### F. Maintenance / inspections

- `rental/components/service-center/**`
- `rental/lib/service-*`

### G. Vehicle-specific shared presentation helpers

- `rental/components/vehicle/vehicle-i18n.ts` (`vt`, `vehicleFormattingLocale`)
- `rental/components/vehicle-bookings/**`
- `rental/components/fleet-connectivity/**`
- `rental/components/fleet-health-service/**` (presentation labels only)
- `rental/lib/vehicle-*` (display/format helpers)

## Runtime helpers

- **React:** `useLanguage().t()` from `frontend/src/i18n/LanguageContext`
- **Non-React:** `vt(locale, key)` / `vehicleFormattingLocale(locale)` from `rental/components/vehicle/vehicle-i18n.ts`
- **Formatting:** `getFormattingLocale('de'|'en')` instead of `'de-DE'` / `'en-US'` / `'en-GB'` literals in enforce-clean files

## Key namespaces (reused + extended)

**Reused:** `vehicle.*`, `vehicleDetail.*`, `fleet.*`, `fleetCondition.*`, `health.*`, `trips.*`, `serviceCenter.*`, `fleetHealthService.*`, `fleetConnectivity.*`, `vehicle.status.*`, `dashboard.operations.status.*`, `common.retry`, `invoices.dueDate`, `status.overdue`, etc.

**New (representative):** `common.reload`, `common.open`, `fleet.stat.return`, `fleet.stat.overdueWithLabel`, `serviceCenter.create.titleField`, `serviceCenter.create.dueDateLabel`, `vehicle.tasks.loadErrorDescription`, `vehicle.override.readOnlyAccess`, plus extensive `health.*`, `trips.*`, `vehicle.bookings.*`, `fleetHealthService.*` extensions from sub-surface migrations.

Canonical keys: **3960 → 4687** (+727 EN+DE pairs).

## Telemetry / status / DTC handling

- Internal telemetry states (`unknown`, `live`, `standby`, `soft-offline`, `offline`) and readiness/status enum values unchanged.
- Presentation maps through `TranslationKeys`; reused P2.2.1 `vehicle.status.*` and `dashboard.operations.status.*` where semantically identical.
- DTC codes (e.g. `P0300`) remain literal; only UI chrome is localized.
- TÜV / BOKraft proper names preserved in DE copy where regulatory.

## Scanner classification

`classifyRentalModule()` now emits: Fleet Shell, Vehicle Detail, Vehicle Overview, Vehicle Trips, Vehicle Health, Vehicle Maintenance — so vehicle debt no longer hides in “other Rental areas”.

## Guardrails

- `frontend/scripts/i18n-hardcoded-scan.mjs` P2.2.2 enforce-clean paths
- `frontend/src/i18n/hardcoded-copy-guard.test.ts` — P2.2.2 scope must be **0**
- `frontend/src/rental/components/rental-vehicles-health-localization.test.tsx` — structural P2.2.2 checks

## Shim inventory (deterministic)

Run: `node frontend/scripts/i18n-shim-inventory.mjs` (included in `npm run i18n:check`).

- **Compat** (`../i18n/` → `rental/i18n/`): 33 files (22 production, 11 test) after P2.2.2 verification — down from 35 at P2.2.1.
- **Canonical** (`../../i18n/`+ → `src/i18n/`): 310 files.

P2.2.2 vehicle-domain touched files must not add compat consumers; they import `../../i18n/` or deeper.

## Formatting locale

- `vehicle-i18n.ts`: `vehicleFormattingLocale` / `vehicleFormattingLocaleOrDefault` for all nine official locales.
- React P2.2.2 surfaces: `formattingLocale` from `useLanguage()` or explicit `locale` passed into view-model builders.
- Tests: `locales.test.ts` (BCP-47 map), `rental-vehicles-health-localization.test.tsx` (pl number formatting).

| Metric | Before | After |
|--------|--------|-------|
| Global hardcoded findings | 3167 | **2712** |
| Rental findings | 1842 | **1390** |
| Vehicle submodule findings | ~475 | **0** (enforce-clean) |
| Enforce-clean (P2.2.2 zone) | — | **0** |

## Known debt (documented, not blocking enforce-clean)

- `rental-health-ui.ts`, `service-info-display.ts`, `health-tab-summary-ui.ts`, `trips-view-ui.ts` — some builder strings outside JSX scanner patterns.
- `FleetConditionDetailView` deep `CATEGORY_META` technical labels partially English.
- ~44 Rental files still import `rental/i18n/` compatibility shim (`../i18n/`).
- P4: ICU pluralization (`fleet.stat.overdueWithLabel`, result counts).
- Partial locales (fr/pl/cs/nl/es/it/tr) not mass-filled for new keys.

## Pre-existing Fleet Health test baseline

7 failures unchanged (domain tests, not masked by i18n):

1–3. `fleet-health-control-center.test.ts`
4. `rental-health-availability.test.ts`
5. `taskQueryCache.contract.test.ts`
6. `fleet-health-service-vehicle-overview.test.ts`
7. `fleet-health-service.domain.integration.test.ts`

## Verification

```bash
cd frontend && npm run i18n:check
cd frontend && npm test -- src/rental/components/rental-vehicles-health-localization.test.tsx
cd frontend && npm test   # 7 pre-existing failures only
cd frontend && npm run build
```

## Recommended next phase (P2.2.3)

Bookings list/detail, Customers, Tasks, Settings, Finance/Billing — remaining **1390** Rental findings (655 in “other Rental areas”, 106 Bookings, 113 Tasks, etc.).
