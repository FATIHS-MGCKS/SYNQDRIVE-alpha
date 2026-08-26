# Vehicle Operational State — Frontend UI Projection Facade (P1.2)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-26 |
| **Slice** | P1.2 — shared presentation facade (no consumer cutover) |
| **Prerequisite** | P1.1 `CanonicalVehicleOperationalView` |
| **Related audit** | `docs/audits/vehicle-operational-state-frontend-consumer-ui-projection-audit-2026-08.md` §Q |

## Purpose

Establish **one** canonical presentation facade on top of `CanonicalVehicleOperationalView` so P1.3+ consumer cutovers can bind to a stable API without re-deriving state.

## Module location

```
frontend/src/rental/lib/operational-projection/ui/
  types.ts
  primary-reason-presentation.ts
  map-connectivity-presentation.ts
  map-availability-ui-presentation.ts
  map-health-ui-presentation.ts
  map-vehicle-operational-ui-projection.ts
  map-vehicle-operational-ui-projection.test.ts
  index.ts
```

## Entry point

```typescript
mapVehicleOperationalUiProjection(
  canonical: CanonicalVehicleOperationalView,
  options: { audience: VehicleOperationalAudience; t: OperationalTranslator },
): VehicleOperationalUiProjection
```

## Layer model

| Layer | Module | Role |
|-------|--------|------|
| P1.1 | `operational-projection/` | Canonical data contract + provenance |
| **P1.2** | `operational-projection/ui/` | Presentation facade (labels, tones, reasons) |
| P1.3+ | Fleet/dashboard/detail consumers | Dumb UI binding (not started) |

## Reused presentation modules (unchanged semantics)

- `operational-availability/presentation.ts` — P0.3 availability state labels/tones (`mapOperationalAvailabilityStatePresentation`)
- `fleet-health-evaluation/presentation.ts` — P0.4 health condition/evaluability labels (`mapHealthConditionStatePresentation`, `mapHealthEvaluabilityStatePresentation`)
- `fleet-connectivity/fleet-connectivity.presentation.ts` — connectivity enum labels/tones

## Provenance-aware slice types (P1.2 review fix)

`AvailabilityUiPresentation` and `HealthUiPresentation` use `UiPresentationSlice<T>` for semantic sub-fields. The facade **does not** adapt canonical views into legacy flat DTOs that coerce absent fields to `null`, `[]`, `NONE`, or `unknown`.

| Slice | Provenance-aware sub-fields |
|-------|----------------------------|
| `availability.presentation` | `primaryReason`, `reasonCodes`, `recommendedAction`, `attention` |
| `health.presentation` | `condition`, `pipelineAvailability` |

## Presentation fallback policy

| Canonical input | UI projection |
|-----------------|---------------|
| Field `presence: absent` | Matching `UiPresentationSlice.presence: absent` |
| Explicit `UNKNOWN` enum | Legitimate UNKNOWN presentation (neutral/non-success) |
| Explicit `NONE` / `[]` / `null` | Preserved — distinct from absent |
| Future/unknown reason code (org_admin) | `fleet.operationalAvailability.reason.unknown` |
| Future/unknown reason code (master_admin) | Raw code in technical detail; safe label in operator slice |
| Invalid enum at canonical layer | Already `absent` — presentation stays absent |

## Audience handling

| Audience | Behavior |
|----------|----------|
| `org_admin` | Human-facing labels; no raw enum leakage for unknown reasons |
| `master_admin` | Adds `technicalDetail` with raw canonical enum values |
| `worker` | Minimal connectivity (overallState + recommendedAction only) |

Audience changes **presentation only** — never canonical state.

## Non-goals (P1.2)

- No consumer cutover (FleetOperatorRow, dashboard, detail, booking, map markers)
- No timestamp derivation (`formatLastTelemetry` not used by facade)
- No legacy `onlineStatus` dependency
- No 8-locale fleetConnectivity campaign (DE/EN keys added for primaryReason gap only)

## Tests

```bash
npx vitest run src/rental/lib/operational-projection/
```

68 tests (29 P1.1 + 53 P1.2)

## Next phase

**P1.3** — Fleet list/map consumer cutover to `mapVehicleOperationalUiProjection`.
