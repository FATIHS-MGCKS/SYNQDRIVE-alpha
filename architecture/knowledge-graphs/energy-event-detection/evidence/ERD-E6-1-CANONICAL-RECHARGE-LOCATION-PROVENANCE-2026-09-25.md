# ERD E6.1 — Canonical recharge location provenance (2026-09-25)

**Status:** IMPLEMENTED (runtime path only; **no backfill**).  
**Baseline:** post E5.6 merge `94c935d94828c53fd05edaee7ebcf52752c455a7`  
**Stage:** `ERD_E6_1_CANONICAL_RECHARGE_LOCATION_PROVENANCE`

## Purpose

Preserve authoritative **native DIMO recharge segment** coordinates through:

`NormalizedDimoRechargeSegment` → `HvChargeSession.metadata` → canonical ERD `VehicleEnergyEvent.RECHARGE`

No charger/station resolution (E6.2). No fuel-station OSM resolver reuse.

## Location authority V1

`erd_recharge_location_authority_v1`

| Source | Rule |
|--------|------|
| **Native DIMO** | `startLocation` / `endLocation` on normalized segment |
| **Fallback telemetry** | **No authoritative location** (`FALLBACK_LOCATION_INFERENCE=NONE`) |

## Validation

Strict pair validation: both lat/lon finite and in range; partial pairs rejected; no clamping; provider values stored exactly.

## Session metadata

Typed `startLocation` / `endLocation` with explicit `source: 'DIMO_RECHARGE_SEGMENT'`.

Merge semantics:

- Valid native refresh may replace prior native coordinates
- Invalid/missing refresh **cannot erase** valid native coordinates
- Fallback never overrides native location

## VEE projection

Coordinates projected only from trusted native session metadata. Fallback sessions → four coordinate fields `null`.

`rawDetectionMeta` records `locationAuthorityVersion`, `startLocationProvenance`, `endLocationProvenance`.

## E5.2 reconciliation

`startLatitude`, `startLongitude`, `endLatitude`, `endLongitude` are **mutable projection fields** (same VEE id / sourceEventKey / anchor).

## E5.3 handoff

Late native SAME handoff upgrades fallback-originated VEE with native DIMO coordinates on the **same** row.

## Non-effects

- No location in identity keys or E5.5 dedupe
- No REFUEL / fuel-station enrichment changes
- No Prisma schema migration
- No Production activation

## Tests

- Unit: `erd-recharge-location-provenance.spec.ts` (L1–L15)
- PostgreSQL: `erd-e6-1-recharge-location-provenance.postgres.integration.spec.ts`
- CI: boundary-repair step **14/14**

## E5.4 shadow parity addendum

Pre-E6.1 shadow runs expected canonical-null coordinates when mapper did not project location. Post-E6.1, native sessions with valid DIMO metadata may emit coordinates; fallback sessions may remain null. Historical E5.4 evidence remains valid; compare coordinates when both sides have values.

## Next

`ERD_E6_2_CHARGING_STATION_REFERENCE_RESOLVER` — reference dataset + resolver (not started).
