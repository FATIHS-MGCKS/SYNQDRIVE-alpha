# RB-019 P2.5 — Snapshot connectivity freshness binding (Arteon stale-evidence fix)

| Field | Value |
|-------|-------|
| **Date** | 2026-09-18 |
| **Workstream** | VDC-RB-019 P2.5 minimal correction |
| **Production deploy** | **YES** — `ca7bad8826871376a58efaa874f12992b88c4a04` (2026-09-18T09:03:22Z) |
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

## Production deploy + post-deploy runtime proof (2026-09-18)

| Field | Value |
|-------|-------|
| **Previous production SHA** | `3a2707b2966a4059478c1ac78f88451b9a50205d` |
| **Deployed SHA** | `ca7bad8826871376a58efaa874f12992b88c4a04` |
| **Deploy method** | `cloud-agent-deploy.sh` + `vps-deploy-release.sh` (2-replica rolling) |
| **Patch equivalence** | Connectivity production files **byte-identical** to reviewed `7ad0e1174` / `bf28a7a85`; no unreviewed RFRF delta |
| **P2.5 shadow** | OFF (`CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED=false`) |
| **Seven-day clock** | NOT running |
| **EXP-021 operator** | NOT running (no canary operator process) |
| **Failed T0** | `2026-09-18T00:02:53.207Z` remains **invalid**; no new T0 created |
| **Arteon physical ground truth** | UNPLUGGED (intentional) |

### Post-deploy Arteon stale-snapshot observation

At `2026-09-18T09:03:59Z` (first post-deploy `DimoSnapshotScheduler` cycle on replica A):

- `vehicle_latest_states.provider_fetched_at` advanced to `2026-09-18T09:03:59.552Z`
- `vehicle_latest_states.source_timestamp` **unchanged** at `2026-09-17T08:07:14.000Z` (cached OBD replay)
- `device_connection_physical_states.updated_at` **unchanged** at `2026-09-18T00:03:43.578Z`
- **0** `device_connection_physical_state_transitions` since deploy
- **No** post-deploy false PLUGGED bootstrap or PLUGGED→UNPLUGGED transition

**Interpretation:** equal/stale cached OBD evidence replayed through snapshot poller **did not** acquire new connectivity transition authority after deploy.
