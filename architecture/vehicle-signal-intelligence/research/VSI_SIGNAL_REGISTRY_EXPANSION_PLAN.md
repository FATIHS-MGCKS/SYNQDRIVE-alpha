# VSI signal registry expansion plan (P2 design / P3–P4 execution)

| Field | Value |
|-------|-------|
| **Status** | DESIGN — no runtime expansion in P2 PR |
| **Contract version today** | `vsi-canonical-signal-v1` |
| **Materialized keys today (P0+P1)** | `lv_voltage`, `hv_battery_soc`, `provider_source_timestamp`, `device_connectivity`, `provider_last_successful_fetch`, `vehicle_speed`, `odometer`, `fuel_level_relative`, `diagnostic_trouble_code` |
| **Last updated** | 2026-10-15 |

## Purpose

Document the gap between the **initial VSI materialization set** and the **full DIMO `availableSignals` / telemetry inventory**, and define how to grow the canonical registry without silent runtime drift.

P2 delivers **lifecycle automation** for the existing materialization keys only. Fingerprints, cadence/reliability analytics, and domain-approved fallback resolution remain **P3/P4**.

## Current coverage (repository baseline)

| Domain | Canonical keys (v1) | DIMO / telemetry aliases (primary) | P0+P1 runtime |
|--------|---------------------|-------------------------------------|---------------|
| LV battery | `lv_voltage` | `powertrainAuxiliaryBatteryVoltage` | Materialized |
| HV energy | `hv_battery_soc` | `powertrainTractionBatteryStateOfCharge` | Materialized |
| Movement | `vehicle_speed`, `odometer` | `speed`, `odometer` | Materialized (empirical via composer) |
| Fuel | `fuel_level_relative` | `powertrainFuelSystemRelativeLevel` | Materialized |
| DTC | `diagnostic_trouble_code` | DTC payloads | Materialized (declared/empirical rules) |
| Connectivity | `device_connectivity`, `provider_*` | online / fetch metadata | Materialized |
| Position | `position_coordinates` | `location` / GNSS fields | **Catalog only** — not in P0+P1 materialization keys |
| Pedals / brakes | — | `acceleratorPedalPosition`, brake-related signals | **Not in v1 materialization set** |
| Charging | `hv_charging_active` (catalog) | HV charge power / plug state | **Catalog only** |
| Climate / tires / warnings | partial catalog entries | various | **Catalog only** |

Authoritative definitions: `backend/src/modules/vehicle-intelligence/vehicle-signal-intelligence/canonical-signal-keys.ts`.

## Gap analysis vs DIMO inventory

1. **Position & motion enrichment** — latitude/longitude/heading are present in VLS `rawPayloadJson` and composer paths but not in `VSI_PROFILE_MATERIALIZATION_KEYS`.
2. **Accelerator / brake family** — required for Driving Intelligence assessability and brake modules; DIMO names vary by OEM; must not auto-alias without VSI-02 safety review.
3. **HV/LV extended family** — temperature, power kW, SOH, cell-level (where exposed) — Battery V2 owns health math; VSI owns **capability truth** only.
4. **Charging & plug** — overlaps VDC physical state and Battery HV charge sessions; per-link attribution rules required before materialization.
5. **Provider metadata** — `provider_catalog_listing`, `provider_authorization_result` exist in catalog but are not product-profile axes yet.

## Target registry architecture (P3+)

| Layer | Responsibility |
|-------|----------------|
| **Registry document** | Versioned `VSI_CANONICAL_SIGNAL_DEFINITIONS` + contract version bump |
| **Alias table** | Per `telemetrySourceFamily` + provider explicit mappings (no cross-provider auto-merge) |
| **Units & validity** | Canonical unit token + validator ranges per key |
| **Provenance class** | `DIMO_PREFLIGHT`, `VLS_STRICT`, `VLS_LOOSE`, `POLL_LOG_CONTEXT` |
| **Materialization allowlist** | `VSI_PROFILE_MATERIALIZATION_KEYS` subset promoted per phase |

### Versioning rules

- Add keys → bump `VSI_CANONICAL_SIGNAL_CONTRACT_VERSION` and `VSI_PROFILE_CONTRACT_VERSION` together when profile shape changes.
- Never reinterpret an existing key semantics in-place; add a new key or explicit limitation ledger entry.
- Runtime expansion requires: evaluator tests, composer tests, postgres integration, and charter cross-workstream review.

## Phased expansion roadmap

| Phase | Scope |
|-------|--------|
| **P2 (this PR)** | Lifecycle for existing keys; registry gap documented only |
| **P3** | Fingerprint + cadence/reliability dimensions on existing keys |
| **P4** | Consumer resolver contracts + approved alternates |
| **P3b (proposed)** | Add `position_coordinates`, `hv_charging_active` to materialization after per-link catalog provenance for HM |
| **P3c (proposed)** | Brake/accel family after EXP021 + brake domain sign-off |

## Validation requirements for future key promotion

- Disposable PostgreSQL integration per key family (Ruptela hardware + Tesla software stratification).
- Negative tests: missing preflight → declared `UNKNOWN`, never `NOT_LISTED`.
- Multi-link declared ambiguity guards unchanged.
- No new DIMO HTTP on materialization path.

## References

- [`VSI_PRODUCT_CHARTER.md`](../VSI_PRODUCT_CHARTER.md)
- [`VSI_MASTER_ROADMAP.md`](../VSI_MASTER_ROADMAP.md)
- `canonical-signal-keys.ts`, `vsi-profile.types.ts`
