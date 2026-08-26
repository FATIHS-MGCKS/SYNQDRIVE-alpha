# Vehicle Operational State — Frontend Canonical Contract (P1.1)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-26 |
| **Slice** | P1.1 — canonical frontend contract (no UI cutover) |
| **Related audit** | `docs/audits/vehicle-operational-state-frontend-consumer-ui-projection-audit-2026-08.md` |

## Purpose

Establish **one** frontend normalization layer on top of the proven backend P0.1–P0.4 architecture before any visible consumer migration (P1.2+).

## Module location

```
frontend/src/rental/lib/operational-projection/
  types.ts
  provenance.ts
  map-fleet-map-to-canonical.ts
  map-fleet-map-to-canonical.test.ts
  index.ts
```

## Entry point

```typescript
mapFleetMapToCanonicalVehicleOperationalView(
  fleetMap: FleetMapVehicleResponse,
  options?: { fleetConnectivityDetail?: FleetConnectivityDetail },
): CanonicalVehicleOperationalView
```

## Layer separation (do not collapse)

| Domain | Canonical fields | Backend slice |
|--------|------------------|---------------|
| Business availability | `business.operationalAvailability` | P0.3 `operationalAvailability` |
| Business workflow | `business.businessState` | P0.2 internal — **not on fleet-map yet** |
| Connectivity runtime | `connectivity.*` | P0.1 `connectivityRuntime` |
| Health evaluability | `health.evaluability`, `health.condition`, `health.pipelineAvailability` | P0.4 `healthEvaluation` |
| Operator summary | `operator.*` | P0.3 slice (from P0.2 `operatorSummary`) |

## Provenance rules

1. `presence: 'present'` + `value: 'UNKNOWN'` = backend supplied UNKNOWN (including batch fallback DTOs).
2. `presence: 'absent'` = slice/field not in input — **not** coerced to UNKNOWN.
3. `business.businessState` is always absent until fleet-map exposes P0.2 `businessState`.
4. Legacy fleet-map fields (`onlineStatus`, `lastSeenAt`, `telemetryFreshness`, `status`) must not influence the mapper.

## Non-goals (P1.1)

- No UI label/color mapping (P1.2)
- No consumer rewiring (P1.3+)
- No legacy deletion (P1.9)
- No timestamp-derived operational availability

## Tests

`npx vitest run src/rental/lib/operational-projection/map-fleet-map-to-canonical.test.ts`

## Next phase

**P1.2** — shared UI projection facade wrapping existing `operational-availability/`, `fleet-health-evaluation/`, and `fleet-connectivity.presentation.ts` modules on top of `CanonicalVehicleOperationalView`.
