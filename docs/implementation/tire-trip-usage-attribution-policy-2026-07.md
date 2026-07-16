# Tire Trip Usage Attribution Policy (2026-07)

**Status:** Documented policy — **no automatic implementation** in Prompt 9.

## Purpose

Define how finalized trips are attributed to `VehicleTireSetup` rows in `TireTripUsageLedger` before any trip-finalization integration (later prompts).

## Source of truth

| Layer | Role |
|-------|------|
| `TireTripUsageLedger` | **Authoritative** per-(trip, setup) attributed usage (km splits, harsh counts, driving impact summary) |
| `VehicleTireSetup.totalKmOnSet` + harsh counters | **Legacy derived aggregates** — remain unchanged until a later prompt rebuilds them from the ledger |

Ledger rows update **only** when `sourceFingerprint` changes (trip reprocessing, late segments, revised distance, invalidation).

## Idempotency

- **Unique key:** `(tripId, tireSetupId)`
- **Fingerprint:** deterministic SHA-256 over canonical evaluation payload + `sourceVersion`
- Re-upsert with unchanged fingerprint → **no write** (`UNCHANGED`)

## Multi-tenant safety

- `organizationId` required on every row
- Application + DB trigger enforce:
  - `vehicle.organizationId === ledger.organizationId`
  - `tireSetup.vehicleId === ledger.vehicleId`
  - `trip.vehicleId === ledger.vehicleId`
  - `tireSetup.organizationId` (when set) matches ledger org

## Edge cases (considered, not all automated)

| Scenario | Policy (Prompt 9) |
|----------|-------------------|
| Trip reprocessing | Same `(tripId, tireSetupId)` row updated when fingerprint changes |
| Late segments / revised distance | Fingerprint change → update allowed |
| Setup change mid-history | New setup gets **new** rows for newly attributed trips only |
| **Trip spans exact setup-change instant** | **`DEFERRED_MANUAL_REVIEW`** — **no automatic split** |
| Deleted / invalidated trip | Fingerprint with `invalidated: true` + zeroed usage fields |
| Cross-tenant access | Rejected at repository + DB trigger |

## Deferred: setup-change split

When a single finalized trip overlaps the exact timestamp of a tire setup change (install/remove), **automatic km/event splitting is explicitly out of scope** until:

1. Product/engineering signs off on split rules (odometer boundary vs time boundary vs proportional)
2. A dedicated prompt implements split + reconciliation against mount periods
3. Regression tests cover multi-setup attribution for one trip

Until then, integrators must **not** write fractional attribution for such trips without manual review.

## Integration boundary (Prompt 9)

- Schema + migration + repository only
- **No** hook in trip finalization / enrichment orchestrator
- **No** changes to `TireHealthService.updateTireUsageFromTrip`
