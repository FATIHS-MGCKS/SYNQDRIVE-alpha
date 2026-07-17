# Battery Observation — Legacy Persistence Paths

Reference for Prompt 19/78 integration coverage. Paths **not** gated by
`battery-provider-observation.policy` / `hv-snapshot-observation.policy` as of V4.9.521.

## Covered by integration package (`battery-provider-observation.integration.spec.ts`)

| Path | Policy | Persistence |
|------|--------|-------------|
| HV telemetry poll | `evaluateHvSnapshotObservation` | `hv_battery_health_snapshots` + HV `BatteryEvidence` |
| LV live/rest snapshot | — (always persists) | `battery_health_snapshots` + LV `BatteryEvidence` |
| VLS provenance mirror | `battery-freshness.policy` (read) | `vehicle_latest_states.providerFetchedAt` + `sourceTimestamp` |
| Duplicate HV polls | skip + `synqdrive_hv_snapshot_duplicates_discarded_total` | no new rows |

## Legacy paths still active (out of scope for P19 tests)

### LV

| Path | Service | Notes |
|------|---------|-------|
| `BatteryHealthService.recordSnapshot` | Every rest capture / manual write | No provider dedup policy; evidence dedup via DB unique tuple only |
| `BatteryV2Service.onSnapshot` | DIMO poll hook | Rest-window gating; calls `BatteryHealthService.recordSnapshot` |
| `BatteryV2Service.onTripStart` | Trip start | Crank / start-window capture; separate from HV poll |
| `battery_features` publication row | `BatteryV2Service.recomputeHealth` | Legacy LV score pipeline unchanged |

### HV

| Path | Service | Notes |
|------|---------|-------|
| `VehicleLatestState` upsert | `DimoSnapshotProcessor` | **Always** updates on successful poll (fetch time) — independent of HV snapshot dedup |
| Legacy pairwise capacity on snapshot | `HvBatteryHealthService.recordSnapshot` | Gated by `isLegacyHvPairwiseCapacityAssessmentEnabled()` |
| `hv_battery_health_current` publication | `HvBatteryHealthService.upsertPublicationState` | Legacy pairwise path only |
| `HvBatteryHealthService.getHvBatteryStatus` reads | Read model | Mixes evidence + VLS; structured freshness since V4.9.520 |

### Evidence

| Path | Behavior |
|------|----------|
| `BatteryEvidenceService.recordMany` on HV persist | Upsert refresh on duplicate tuple; `skipDuplicates` on bulk insert |
| `BatteryEvidenceService.record` | Per-row upsert — used by document/manual confirmations |
| Model-derived SOH evidence | Only when legacy pairwise flag enabled |

### Not yet on observation policy

| Area | Status |
|------|--------|
| `BatteryMeasurement` / `BatteryMeasurementSession` ingest | Schema + repositories (P12–13); ingestion hook pending |
| `HvCapacityObservation` / `HvChargeSession` | Schema only (P14) |
| Per-signal VLS columns for battery `observedAt` | Mapper emits timestamps; VLS stores collection-level `sourceTimestamp` only |
| LV provider observation dedup at poll | LV always writes on `recordSnapshot`; rest dedup is window-based in V2 |

## Recommended follow-up (not P19)

1. Wire `BatteryV2Service.onSnapshot` through provider observation policy for LV voltage.
2. Persist per-signal battery `observedAt` on VLS or evidence-only carrier.
3. Extend integration harness to `DimoSnapshotProcessor` end-to-end with processor-level counters.
