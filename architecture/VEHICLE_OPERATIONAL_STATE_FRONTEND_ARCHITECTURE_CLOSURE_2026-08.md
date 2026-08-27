# Vehicle Operational State — Frontend Architecture Closure (P1 FINAL)

**Date:** 2026-08-27  
**Baseline main SHA:** `8c5867853357922ca7fe8df7a5353336c14c0e35` (post P1.7 merge)  
**Phase:** P1 FINAL — Global legacy authority cleanup & architecture closure audit

## Objective

Prove that no productive tenant-facing operational decision derives canonical vehicle state from legacy frontend heuristics (`isVehicleOffline`, timestamp thresholds, legacy `onlineStatus`, legacy `healthStatus` fallbacks).

## Closure verdict

| Gate | Result |
|------|--------|
| Tenant legacy operational authority remaining | **NO** |
| Client timestamp connectivity state machine (tenant operational) | **NO** |
| Legacy `onlineStatus` authority (tenant operational) | **NO** |
| Legacy `healthStatus` authority (tenant operational) | **NO** |
| Duplicate frontend vehicle state machine (tenant operational) | **NO** |
| P1.1–P1.7 regression | **PASS** |
| Cross-surface authority consistency | **PASS** |
| Visible behavior changed | **YES** (intentional alignment — see below) |
| Vehicle operational state frontend architecture | **CLOSED** |

### Intentional visible alignment (not new business rules)

- **Dashboard Available popup (`StatInlineDetail`)** — Ready pill and card styling now follow P1.5 canonical readiness (`operationalAvailability` + rental health + cleaning), not `isVehicleOffline()` timestamp blocking. Vehicles with stale `lastSignal` but canonical `AVAILABLE` no longer appear greyed/"Not Ready" solely due to telemetry age.
- **Fleet station filter HUD counts** — `buildStationFilterOptions` now uses P1.2 `uiProjection` like fleet list/map rows.

## Final consumer authority table

| Surface | Business State | Operational Availability | Connectivity | Health | Attention | Legacy Authority Remaining? |
|---------|----------------|--------------------------|--------------|--------|-----------|----------------------------|
| Fleet List | canonical P0.1 | P0.2 via P1.2 | P0.1 runtime | P0.4 evaluability | `attentionState` | **NO** |
| Fleet Map | canonical P0.1 | P0.2 via P1.2 | P0.1 runtime | P0.4 evaluability | `attentionState` | **NO** |
| Vehicle Detail Header | canonical P0.1 | P0.2 via P1.2 | P0.1 runtime | P0.4 evaluability | `attentionState` | **NO** |
| Vehicle Detail Map | GPS poll store (display) | — | tracking badge canonical | — | — | **NO** |
| Dashboard Ready to Rent | P0.1 + P0.2 | P0.2 | informational runtime | P0.4 + rental health | canonical attention | **NO** |
| Dashboard Critical Alerts | — | — | `attentionState` | evaluability guards | canonical | **NO** |
| Dashboard Available popup | P0.1 | P0.2 | informational only | rental health modules | — | **NO** |
| Booking Picker | P0.1 | P0.2 gate | not a gate | rental health (separate) | — | **NO** |
| Booking Edit preflight | P0.1 | P0.2 gate | not a gate | rental health | — | **NO** |
| Notifications | — | — | `attentionState` | evaluability guards | canonical | **NO** |
| Predictive Operational Alerts | — | — | canonical attention only | evaluability guards | canonical | **NO** |
| Operator Fleet Command tabs | P0.1 business workflow | P0.2 badge | canonical projection | P0.4 when present | canonical | **NO** |
| Master Admin | raw DTO fields | raw | raw enums / timestamps | raw | technical | **E — out of scope** |

## Deleted / reduced helpers

| Helper | Action | Reason |
|--------|--------|--------|
| `telemetryStateToIssueDraft` | **Deleted** | Dead code since P1.7; returned null |
| `isFleetSignalOutdated` | **Deleted** | Zero production consumers |
| `isVehicleOffline` | **Retained @deprecated** | Legacy `deriveFleetVisualState` fallback only (deprecated `fleetStateBuilder`) |
| `resolveTelemetryFreshness` | **Retained** | Display labels, tests, legacy fallback path — not tenant operational authority |
| `deriveFleetVisualState` (no projection) | **Retained** | Deprecated fleet board + display fallback |

## Retained compatibility (category C)

| Field / helper | Reason |
|----------------|--------|
| `onlineStatus` on fleet-map DTO | Backend contract / poll store passthrough; no tenant operational gates |
| `lastSignal` / `signalAgeMs` | Informational display ("last data received X ago") |
| `healthStatus` on `VehicleData` | DTO compatibility; fleet visual legacy fallback when rental health absent |
| `resolveTelemetryFreshness` thresholds (15m/24h/48h) | Shared age classifier for display/tests; not operational authority when canonical runtime present |
| `fleetStateBuilder` | `@deprecated` test/legacy board only — not dashboard KPI authority |

## Master Admin exceptions (category E)

- `OrganizationDetailView` may show raw `onlineStatus` as technical telemetry detail
- No Master Admin operational business decisions were found using client timestamp heuristics for tenant booking/readiness

## Regression evidence

| Suite | Result |
|-------|--------|
| `vehicle-operational-state-p1-final-closure.test.ts` | **20/20** |
| P1.1 operational-projection | PASS |
| P1.3 fleet cutover | PASS |
| P1.4 vehicle detail cutover | PASS |
| P1.5 dashboard cutover | PASS |
| P1.6 booking cutover | PASS |
| P1.7 notifications cutover | PASS |
| connectivity-cross-surface-regression | PASS |
| operationalIssues + dashboardAttentionBuilder | PASS |
| fleet-operator-panel | PASS |
| frontend typecheck + build | PASS |

## Remaining follow-up (non-blocking)

- Migrate deprecated `fleetStateBuilder` / `resolveFleetVehicleDisplayState` legacy path to always require `uiProjection` when fleet-map canonical fields present
- Backend: eventual removal of redundant `onlineStatus` from fleet-map once all consumers confirmed display-only
- Master Admin: optional future alignment to canonical projection (explicitly out of scope for P1 FINAL)

## Related documents

- `docs/audits/vehicle-operational-state-frontend-consumer-ui-projection-audit-2026-08.md` (§P1 FINAL)
- P1.1–P1.7 architecture cutover records under `architecture/VEHICLE_OPERATIONAL_STATE_*`
