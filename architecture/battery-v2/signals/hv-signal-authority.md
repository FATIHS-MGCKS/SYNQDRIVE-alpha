# Battery V2 — HV Signal Authority

**Reconstruction date:** 2026-09-01 (Phase 2, authority correction pass)  
**Registry:** `battery-capability-signals.registry.ts` (capability preflight)  
**Mapper:** `dimo-battery-signal.mapper.ts` (live DIMO telemetry ingest)

## Inventory separation (do not collapse)

| Inventory | Count | Scope |
|-----------|-------|-------|
| **Capability preflight registry** | **13 entries total** | 1 LV + 11 `hv.*` + `dimo.segments.recharge` |
| **DIMO mapper HV fields** | **12 HV + 1 LV** | Includes mapper-only `powertrainTractionBatteryCurrentVoltage` (no registry key) |

The registry governs **method-profile capability preflight**. The mapper governs **live telemetry ingest**. They are related but not identical sets.

## Capability preflight registry (13 entries)

| Registry key | DIMO signal name | Registry measurement type | Semantic role |
|--------------|------------------|---------------------------|---------------|
| `lv.voltage` | `lowVoltageBatteryCurrentVoltage` | `LIVE_VOLTAGE` | LV REST evidence |
| `hv.soc` | `powertrainTractionBatteryStateOfChargeCurrent` | `LIVE_HV_SOC` | M2/M3 SOC input; live HV state |
| `hv.current_energy` | `powertrainTractionBatteryStateOfChargeCurrentEnergy` | `LIVE_HV_CURRENT_ENERGY` | M2 numerator (remaining pack kWh) |
| `hv.added_energy` | `powertrainTractionBatteryChargingAddedEnergy` | `CHARGE_SESSION_CAPACITY` | M3 session added-energy input |
| `hv.is_charging` | `powertrainTractionBatteryChargingIsCharging` | `null` | Charging context |
| `hv.cable_connected` | `powertrainTractionBatteryChargingIsChargingCableConnected` | `null` | Charging context |
| `hv.current_power` | `powertrainTractionBatteryCurrentPower` | `LIVE_HV_CHARGING_POWER` | Live pack power (W→kW in mapper) |
| `hv.charge_limit` | `powertrainTractionBatteryChargingChargeLimit` | `null` | Charge limit % context |
| `hv.provider_soh` | `powertrainTractionBatteryStateOfHealth` | `PROVIDER_HV_SOH` | Provider SOH evidence |
| `hv.pack_temperature` | `powertrainTractionBatteryTemperatureAverage` | `null` | Thermal context |
| `hv.gross_capacity` | `powertrainTractionBatteryGrossCapacity` | `null` | Gross capacity reference context |
| `hv.charging_power` | `powertrainTractionBatteryChargingPower` | `LIVE_HV_CHARGING_POWER` | Charge power kW |
| `dimo.segments.recharge` | (segment probe) | `null` | Native recharge session boundary |

**Registry measurement type** and **semantic role** are separate facts. A signal may have a non-null registry measurement type while still serving as context for some methods (e.g. `hv.current_power`).

## DIMO mapper inventory (mapper-only additions)

| DIMO signal name | In capability registry? | Notes |
|------------------|-------------------------|-------|
| `powertrainTractionBatteryCurrentVoltage` | **No** (`hv.current_voltage` absent) | Mapped live HV context; **not** capability-preflighted |

All other mapper HV fields correspond to registry keys above.

## Timestamp semantics (per signal)

- DIMO `signalsLatest` returns per-signal `timestamp` when present.
- Mapper preserves per-signal `observedAt`; `collectionLastSeenAt` is collection-level fallback.
- LV observed-at resolution: `resolveLvBatteryObservedAt()` → `lvBatteryVoltage.observedAt` else `collectionLastSeenAt`.
- HV snapshot ingestion uses per-signal timestamps where mapped (`signalObservedAt` in `hv-battery-health.service.ts`).

## Authority precedence (CONFIRMED)

1. **HV method eligibility** — `VehicleBatteryCapability` preflight rows (`HvMethodProfileService`)
2. **HV policy gate** — `battery-policy-profile` (`hvPipelineAllowed`)
3. **Measurement evidence** — `BatteryMeasurement` / `BatteryEvidence` / `HvCapacityObservation`
4. **Canonical read** — `CanonicalBatteryHealthService` composes final DTO

## Provider artefacts

- Unknown DIMO units → `unsupported_unit` (no silent conversion)
- Valid ranges enforced in mapper (e.g. SOC 0–100, LV 0–20 V)
- Fleet audit: provider SOH often `NOT_LISTED` (e.g. Tesla KS FH 660E fixture)

## Measurement vs context (method usage)

| Signals | REST/M2/M3 evidence | Context only |
|---------|---------------------|--------------|
| SOC, current energy, added energy | Yes (methods) | Also live state |
| is_charging, cable, power, temp | No | Yes |
| provider SOH | Yes (canonical HV SOH candidate) | Yes |
| gross capacity | Reference eligibility | Not shadow-computed in code |

## Freshness (selected)

| Domain | Threshold | Source |
|--------|-----------|--------|
| Capability stale | 6 h | `DEFAULT_CAPABILITY_STALE_THRESHOLD_MS` |
| Provider SOH canonical | 45 days | `canonical-battery-health.service.ts` |
| HV M2 timestamp skew | 60 s | `HV_M2_MAX_TIMESTAMP_DELTA_MS` |
| Cross-session assessment | 31 days | `hv-capacity-cross-session.policy.ts` |
