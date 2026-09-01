# Fuel Station Enrichment Phase F — UI Integration

| Field | Value |
|-------|-------|
| **Date** | 2026-09-01 |
| **Phase** | F — frontend presentation only |
| **Depends on** | Phase E (`EnergyEventDto.stationEnrichment`) |

## Purpose

Present persisted fuel-station enrichment on the existing vehicle Fahrverlauf / trip timeline REFUEL card. No resolver calls, no extra HTTP requests, no backend changes.

## Data path

```
GET /api/v1/vehicles/:vehicleId/trips-timeline
        ↓
useVehicleTrips → normalizeTimelineItems
        ↓
TripTimeline → TripTimelineEnergyCard
        ↓
resolveRefuelFuelStationPresentation(event.stationEnrichment)
```

Fallback path `energy-events` uses the same `EnergyEvent` type and card — zero additional requests.

## UI trust policy

Frontend mirrors backend `trusted` flag (MATCHED + HIGH/MEDIUM). Presentation modes:

| State | Mode | UI |
|-------|------|-----|
| `trusted=true` + station | `trusted` | Station name/address prominent; coordinates hidden |
| `MATCHED` + LOW | `possible` | “Possible fuel station” + muted candidate |
| `AMBIGUOUS` | `ambiguous` | Non-authoritative message only |
| `PENDING` / `PROCESSING` | `resolving` | Subtle pending copy; event still renders |
| `NOT_FOUND`, `NO_COORDINATES`, `INVALID_COORDINATES`, `FAILED`/`ERROR`, none | `none` | Existing coordinate/event fallback |

OSM internals (`osmId`, `resolverVersion`, etc.) are never shown.

## Confidence domains (separate)

| Field | Domain |
|-------|--------|
| `event.confidence` | REFUEL detection confidence (existing pill) |
| `stationEnrichment.matchConfidence` | Station location match (never shown as operator label) |

## Historical compatibility

`stationEnrichment === undefined` → card renders as before cutover. No fabrication, no errors.

## Zero-extra-request guarantee

Phase E loads enrichment in the existing timeline query. Phase F reads `event.stationEnrichment` only — no new API calls, polling, or resolver invocation.

## Files

| File | Role |
|------|------|
| `frontend/src/lib/api.ts` | `EnergyEventStationEnrichment` types on `EnergyEvent` |
| `trips-fuel-station-enrichment.ts` | Presentation policy |
| `trip-timeline-shared.tsx` | `TripTimelineEnergyCard` enrichment block |
| `trips-energy-i18n.ts` | i18n key registry |
| `trips-fuel-station-enrichment*.test.ts(x)` | Unit + render tests |
| `i18n/translations/*.ts` | Locale strings |

## Tests

- `trips-fuel-station-enrichment.test.ts` — policy matrix
- `trips-fuel-station-enrichment-ui.test.tsx` — card rendering A–L
- `trips-energy-timeline.test.tsx` — regression guard
