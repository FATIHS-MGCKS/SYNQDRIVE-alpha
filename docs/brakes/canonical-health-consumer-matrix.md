# Brake Health — Canonical Consumer Matrix (2026-07)

## Single source of truth

| Layer | Authority |
|-------|-----------|
| Wear / safety condition | `BrakeHealthService.getSummary()` → `overallCondition`, `openAlerts`, axle read model |
| Rental / booking decisions | `brake-rental-health.policy.ts` → `brake_read_model` on `rental-health` |
| Alerts | `BrakeHealthAlert` persistence + `openAlerts` on summary API |
| Evidence / freshness | `BrakeEvidence` lifecycle + summary timestamps |

**Legacy DB columns** (`padsHealthPct`, `discsHealthPct`, `hasAlert` on `brake_health_current`, `vehicle_latest_states.brakePadPercent`) remain for wear-model persistence and HM telemetry export only. **No product decision may read them without canonical mapping.**

---

## Consumer classification

| Consumer | Class | Notes |
|----------|-------|-------|
| `brake-health.service.ts` (`buildCanonicalReadModel`) | CANONICAL | Truth builder |
| `brake-rental-health.policy.ts` | CANONICAL | Rental gate |
| `rental-health.service.ts` | CANONICAL | Uses policy only |
| `bookings.service.ts` | CANONICAL | `rental_blocked` from rental-health |
| `GET /brake-health/summary`, `/detail` | CANONICAL | Public API |
| Fleet / Vehicle Detail / Dashboard (rental-health) | CANONICAL | `modules.brakes`, `brake_read_model` |
| `health-summary.service.ts` | CANONICAL | `overallCondition`, `openAlerts` |
| `ai-health-care-aggregation.service.ts` | CANONICAL | `overallCondition` + wear/safety `openAlerts` |
| `brake-critical.detector.ts` | CANONICAL | Same `brake-status.ts` rules as health service |
| `BrakeHealthSummaryDto.legacy` | LEGACY_READ_ONLY | Deprecated compat fields on API |
| `vehicle_latest_states.brakePadPercent` | LEGACY_READ_ONLY | HM telemetry gauge |
| `vehicles.service` fleet `brakes` number | LEGACY_READ_ONLY | Telemetry export only |
| `GET /brake-status` | LEGACY_READ_ONLY | Deprecated; proxies canonical `condition` |
| `api.brakeStatus()` (frontend) | DEAD_CODE | No runtime callers |
| `VehicleData.brakes: number` (fleet map) | DEAD_CODE | Placeholder `0`; not health truth |

---

## Deprecated API fields (retained for external clients)

On `BrakeHealthSummary`:

- `legacy.padsHealthPct`, `legacy.discsHealthPct`, `legacy.padsRemainingKm`, `legacy.discsRemainingKm`, `legacy.remainingKm`, `legacy.status`
- `hasAlert` — wear/safety open alerts only (`hasWearOrSafetyAlert(openAlerts)`)
- `legacyHeuristic` — HM supplement when no baseline

**Replacement:**

| Deprecated | Use instead |
|------------|-------------|
| `legacy.padsHealthPct` | `overallCondition`, `frontAxle` / `rearAxle` |
| `legacy.remainingKm` | `estimatedReplacementDueInKm`, axle `estimatedRemainingKm*` |
| `legacy.status` | `overallCondition`, `stateClass` |
| `hasAlert` (ambiguous) | `openAlerts` filtered by category, or `brake_read_model.hasWearOrSafetyAlert` for rental |
| `GET /brake-status` | `GET /brake-health/summary` |
| Fleet `brakes` % | `rental-health.modules.brakes` + `brake-health/summary` |

---

## Removal plan

| Phase | Target | Action |
|-------|--------|--------|
| **P23 (now)** | Product consumers | Migrate decisions to canonical; document deprecation |
| **P27** | `GET /brake-status` | Remove endpoint after client audit |
| **P28** | `legacy.*` on summary DTO | Gate behind `?compat=legacy` or remove |
| **P29** | DB `hasAlert` column | Drop after all writers use alert service sync |
| **P30** | `brakePadPercent` fleet field | Replace with optional `brakeTelemetryPercent` or remove |

---

## Frontend rules

The UI **must not** compute:

- Overall brake condition from pad %
- Hard rental blocks (use `brake_read_model` / `rental_blocked`)
- Confidence bands
- Remaining km from health %
- Evidence type (use `dataBasis` / `evidenceType` from API)

Enforced by `frontend/src/rental/lib/brake-health-canonical.test.ts`.
