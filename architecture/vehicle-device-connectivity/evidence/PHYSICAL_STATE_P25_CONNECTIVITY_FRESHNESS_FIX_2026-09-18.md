# RB-019 P2.5 — Snapshot connectivity freshness binding (Arteon stale-evidence fix)

| Field | Value |
|-------|-------|
| **Date** | 2026-09-18 |
| **Workstream** | VDC-RB-019 P2.5 minimal correction |
| **Production deploy** | **NO** |
| **P2.5 shadow enabled** | **NO** |
| **Evidence ID** | VDC-EVID-RB019-P25-CONNECTIVITY-FRESHNESS-001 |

## Proven defect (pre-fix)

On aborted P2.5 shadow restart T0 `2026-09-18T00:02:53.207Z`, Arteon (`8c850ff1-4201-432b-af2e-2711dbc7ca48`) produced `UNEXPLAINED_OLD_REJECT_NEW_ACCEPT`:

- Legacy correctly rejected snapshot OBD UNPLUG (`obd_false`)
- Physical path applied `PLUGGED→UNPLUGGED` using **16h-old cached** `obdIsPluggedIn=false` @ `2026-09-17T08:07:14Z`
- Root ordering defect: `applyPhysicalSnapshotEvidence` ran **before** VLS monotonic guard in `dimo-snapshot.processor.ts`
- No GT-R1 proof covered legitimate UNPLUG snapshot transitions

## Fix (minimal, architecture-correct)

### 1. Processing order

`dimo-snapshot.processor.ts` now applies physical snapshot evidence **after** VW-F-008 VLS monotonic guard and VLS upsert. Stale provider snapshots skip physical mutation entirely.

### 2. Connectivity freshness binding

`physical-state-snapshot-telemetry-eligibility.ts`:

- **FRESHNESS_AUTHORITY:** stored VLS `sourceTimestamp` (pre-upsert)
- **CONNECTIVITY_EPOCH_AUTHORITY:** same VLS boundary per vehicle
- **ELIGIBILITY_RULE:** snapshot OBD `evidenceObservedAt` must be **strictly greater than** existing VLS `sourceTimestamp`; equal timestamp = cached replay (historical only)

Orchestrator gates before writer/GT-R1/shadow compare.

### 3. GT-R1 UNPLUG proof

`physical-state-gt-r1-proof.ts` adds:

- `SNAPSHOT_UNPLUG_TRANSITION` (PLUGGED baseline → newer UNPLUG, legacy `obd_false`)
- `SNAPSHOT_UNPLUG_INITIAL_ESTABLISHMENT` (absent projection → UNPLUG, legacy `obd_false`)

Fresh legacy/physical disagreements without proof remain `UNEXPLAINED_*` (correctness-blocking).

## Validation

| Suite | Command | Result |
|-------|---------|--------|
| Telemetry eligibility | `npm test -- physical-state-snapshot-telemetry-eligibility` | PASS |
| GT-R1 proof | `npm test -- physical-state-gt-r1-proof` | PASS |
| Connectivity matrix A–H | `npm test -- physical-state-connectivity-freshness` | PASS |
| VLS monotonic | `npm test -- vls-monotonic-merge` | PASS |
| Snapshot processor | `npm test -- dimo-snapshot` | PASS |
| Physical-state unit | `npm test -- physical-state-shadow physical-state-evidence-writer` | PASS |

## Non-effects (explicit)

- P2.5 shadow flags remain OFF
- Failed T0 epoch remains scientifically invalid
- EXP-021 operator remains stopped
- No vehicle-ID special case
- No arbitrary TTL invented
- Historical evidence preserved

## Key files

- `backend/src/workers/processors/dimo-snapshot.processor.ts`
- `backend/src/modules/dimo/device-connection-physical-state/physical-state-snapshot-telemetry-eligibility.ts`
- `backend/src/modules/dimo/device-connection-physical-state/physical-state-snapshot-evidence-orchestrator.service.ts`
- `backend/src/modules/dimo/device-connection-physical-state/physical-state-gt-r1-proof.ts`
