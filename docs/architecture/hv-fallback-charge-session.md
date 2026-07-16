# HV Fallback Charge Session Detection (Prompt 50/78)

## Purpose

Subordinate telemetry-based recharge session detection when DIMO `recharge` segments are unavailable for a vehicle. Recharge segments always win; fallback sessions carry lower evidence strength and never drive capacity publication.

## Module

`backend/src/modules/vehicle-intelligence/battery-health/hv-charge-session/`

| File | Role |
|------|------|
| `hv-fallback-charge-session.policy.ts` | Pure detection: signal hierarchy, min duration/observations, pause vs end |
| `hv-fallback-charge-session.types.ts` | Observation points, candidates, detection tiers |
| `hv-fallback-charge-session.mapper.ts` | Candidate → `HvChargeSessionDraft` (`TELEMETRY_POLL_FALLBACK`) |
| `hv-fallback-charge-session.supersede.ts` | DIMO segment supersedes overlapping fallback via metadata |
| `hv-fallback-charge-session-detector.service.ts` | Load snapshots + evidence, detect, persist |

## Signal hierarchy

1. `isCharging` flanks (primary)
2. `cableConnected`
3. Added-energy progression
4. SOC rise (never alone)
5. Charging/current power (corroboration)

## Rules

| Rule | Implementation |
|------|----------------|
| Recharge segment wins | Skip fallback when `rechargeSegmentsAvailable`; DIMO persist supersedes overlaps |
| Lower evidence strength | `BatteryEvidenceStrength.SUPPLEMENTARY` / `DIAGNOSTIC`; quality always `SHADOW` or lower |
| No single SOC jump | `hasMinimumSignalGroups()` requires corroboration |
| Min duration / observations | 5 min, 3 observations |
| Pause vs session end | 10 min pause tolerance while cable connected |
| Provider staleness | 6 h threshold closes ongoing sessions as `STALE` |
| No capacity publication | Sessions only — no `HV_CAPACITY_SHADOW_RECOMPUTE` trigger |

## Triggers

- `HvRechargeSessionReconcileService` when `rechargeSegmentsAvailable === false`
- `BatteryV2SnapshotIngestionService` on charging transition (direct detect)
- Periodic reconcile enqueue includes `hv.is_charging` capable vehicles when fallback flag on

## Feature flags

- `BATTERY_V2_HV_RECHARGE_SESSION_ENABLED` (parent gate)
- `BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED` (default `false`)

## Tests

`hv-fallback-charge-session.policy.spec.ts` — complete, partial/ongoing, pause, false positive, added-energy path.
