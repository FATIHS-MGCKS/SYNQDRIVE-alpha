# Battery V2 — Open Contradictions

## BAT-V2-CONTRA-HEV-HV-AUTHORITY-001

| Field | Content |
|-------|---------|
| **Layer A — drive profile** | `isHvMeasurementSupported(HEV) = true` |
| **Layer B — ICE policy (BatteryMeasurement)** | `forbiddenMeasurementTypes: HV_ALL_MEASUREMENT_TYPES` |
| **Layer C — materializePolicy** | `hvPipelineAllowed = true` — no runtime consumer (audited) |
| **Layer D1 — snapshot/evidence** | `BatteryV2SnapshotIngestionService`: when `ctx.evSoc != null` → `hvBattery.recordSnapshot(...)` — observation-driven; no universal fuelType gate |
| **Layer D2 — charge-session paths** | Recharge/fallback feature flags + method/capability conditions → `HvChargeSession` |
| **Layer D3 — capacity shadow** | `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED` + eligible completed session → capacity shadow pipeline |
| **Layer E — canonical read** | `HYBRID` → `isEv=false` → `canonical.hv` absent |
| **KNOWN** | Write/compute/read divergence — `BAT-V2-GAP-HEV-SIDE-EFFECT-READ-DIVERGENCE-001` |
| **Resolution status** | UNRESOLVED |

## BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001

| Field | Content |
|-------|---------|
| **KNOWN (Phase 3)** | Fallback **REACHABLE_AND_CONFLICTING** in code |
| **UNKNOWN** | Production frequency |
| **Resolution status** | UNRESOLVED |
