# Battery V2 — HV Signal Authority

**Reconstruction date:** 2026-09-01 (Phase 2)  
**Registry:** `battery-capability-signals.registry.ts`  
**Mapper:** `dimo-battery-signal.mapper.ts`

## Canonical signal catalog

| Registry key | DIMO signal name | Measurement type | Role |
|--------------|------------------|------------------|------|
| `lv.voltage` | `lowVoltageBatteryCurrentVoltage` | `LIVE_VOLTAGE` | LV REST evidence |
| `hv.soc` | `powertrainTractionBatteryStateOfChargeCurrent` | HV telemetry | M2/M3 input |
| `hv.current_energy` | `powertrainTractionBatteryStateOfChargeCurrentEnergy` | HV telemetry | M2 input (remaining pack kWh) |
| `hv.added_energy` | `powertrainTractionBatteryChargingAddedEnergy` | HV telemetry | M3 input |
| `hv.is_charging` | `powertrainTractionBatteryChargingIsCharging` | context | Charging context |
| `hv.cable_connected` | `powertrainTractionBatteryChargingIsChargingCableConnected` | context | Charging context |
| `hv.current_power` | `powertrainTractionBatteryCurrentPower` | context | W→kW in mapper |
| `hv.charge_limit` | `powertrainTractionBatteryChargingChargeLimit` | context | Charge limit % |
| `hv.provider_soh` | `powertrainTractionBatteryStateOfHealth` | evidence | Provider SOH % |
| `hv.pack_temperature` | `powertrainTractionBatteryTemperatureAverage` | context | Thermal context |
| `hv.gross_capacity` | `powertrainTractionBatteryGrossCapacity` | reference | Gross capacity kWh |
| `hv.charging_power` | `powertrainTractionBatteryChargingPower` | context | Charge power kW |
| `dimo.segments.recharge` | (segment probe) | session boundary | M3 / SESSION / native recharge |

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

## Measurement vs context

| Signals | REST/M2/M3 evidence | Context only |
|---------|---------------------|--------------|
| SOC, current energy, added energy | Yes (methods) | Also live state |
| is_charging, cable, power, temp | No | Yes |
| provider SOH | Yes (canonical HV SOH) | Yes |
| gross capacity | Reference eligibility | Not shadow-computed in code |

## Freshness (selected)

| Domain | Threshold | Source |
|--------|-----------|--------|
| Capability stale | 6 h | `DEFAULT_CAPABILITY_STALE_THRESHOLD_MS` |
| Provider SOH canonical | 45 days | `canonical-battery-health.service.ts` |
| HV M2 timestamp skew | 60 s | `HV_M2_MAX_TIMESTAMP_DELTA_MS` |
| Cross-session assessment | 31 days | `hv-capacity-cross-session.policy.ts` |
