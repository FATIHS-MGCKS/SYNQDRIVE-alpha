# Vehicle Alerts Canonical Source (P2.2A)

**Date:** 2026-08-19  
**Status:** Source-of-truth migration complete — Notification V2 deferred to P2.2B

## 1. Raw provider source

High Mobility AI_HEALTH_CARE signal group:

| Telltale | HM signal keys |
|----------|----------------|
| `engine_limp_mode` | `engine.get.limp_mode`, `engine.limp_mode`, `limp_mode` |
| `engine_oil_level` | `diagnostics.get.engine_oil_level`, `diagnostics.engine_oil_level`, `engine_oil_level` |

Fetched via `HmSignalUsageService.getAiHealthCareRawState()` inside `DashboardWarningLightsService`.

## 2. Canonical telltale read model

`DashboardWarningLightsService.getDashboardWarningLights(vehicleId)` builds enriched `DashboardWarningLight` rows:

- States: `active`, `off_confirmed`, `no_event_yet`, `unsupported`, `stale`, `error` (envelope)
- Metadata: `severity`, `rentalImpact`, `freshness`, `isCurrentActive`, `isHistorical`
- `rentalHealthReady: true` on every envelope

Parsing lives in `dashboard-warning-lights.parsing.ts` — single normalization for oil (`normalizeOilStatus`) and boolean warn lights.

## 3. Rental Health projection

`projectVehicleAlertsToRentalHealth()` in `vehicle-alerts-rental-health.projector.ts`:

```
DashboardWarningLightsResponse
  → projectVehicleAlertsToRentalHealth()
    → ModuleHealth (vehicle_alerts)
    → VehicleAlertBlockingCause[] (structured)
```

`RentalHealthService.getVehicleHealth()` calls `DashboardWarningLightsService` in parallel with other module reads. **No parallel HM limp/oil parsing in Rental Health.**

## 4. Blocking policy

Structured causes (`VehicleAlertBlockingCause`) map to `blocking_reasons` via `vehicleAlertBlockingCausesToReasons()`:

| Telltale | Condition | Module | Hard rental block |
|----------|-----------|--------|-------------------|
| `engine_limp_mode` | `isCurrentActive` + `block_rental` | `critical` | Yes — `Limp Mode aktiv` |
| `engine_oil_level` | `isCurrentActive` + `block_rental` (LOW) | `critical` | Yes — `Motoröl Minimum` |
| `engine_oil_level` | `isCurrentActive` + `inspect_before_next_rental` (HIGH) | `warning` | No |

Multi-cause: limp + oil low produce **two** blocking reasons (no dedup).

## 5. Freshness / historical-active behavior

- `missing` / `no_event_yet` / `unsupported` → **not** confirmed healthy (`unknown` or `n_a`)
- `stale` or `isHistorical` after prior active → **not** auto-recovery to `good`
- `off_confirmed` / oil OK → confirmed recovery (`good`)
- Provider error (`connectionStatus: provider_error`, envelope `freshness: error`) → `unknown`, not `good`/`n_a`
- Pipeline load failure (DWL throws) → `unknown` + `moduleLoadFailures.vehicle_alerts`

## 6. Domain ownership

| Domain | Owner module | P2.2A scope |
|--------|--------------|-------------|
| Limp mode + oil | `vehicle_alerts` | **Yes** |
| Battery warning | `battery` | No — HM `dashboardLights` via battery readiness |
| Tire pressure | `tires` | No |
| Brake lining pre-warning | `brakes` | No |
| MIL / DTC | `error_codes` | No |
| Service / TÜV / BOKraft | `service_compliance` | No (P2.1) |

## 7. Future P2.2B notification projection

```
DashboardWarningLights (same canonical read model)
  → VehicleAlertsNotificationProjector (P2.2B)
    → LIMP_MODE_ACTIVE / OIL_* registry events
```

P2.2A intentionally adds **zero** registry events or producers.

## 8. No parallel interpretation

**Removed from Rental Health:**

- `evaluateVehicleAlerts(hmAi)` HM boolean/oil-status parsing
- `collectBlockingReasons` direct `hmAi.limpModeActive` / `hmAi.oilLevel.status` checks

**Retained in Rental Health:**

- `getAiHealthCareSignals()` for battery warning light and other non-vehicle_alerts paths

## Dependency note

`RentalHealthModule` ↔ `VehicleIntelligenceModule` already uses `forwardRef` (health tab summary, DTC cache invalidation). `DashboardWarningLightsService` has **no** reverse dependency on Rental Health — injection is cycle-safe. HM data may be read twice per evaluation (AI signals + DWL raw state); both paths use cached HM signal group state — documented, not optimized in P2.2A.
