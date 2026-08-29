# P1.2 Final Production Closure — 2026-08-29

Final residual-observation review and closure record for P1.2 (PR #1409), following:

- Deployed application SHA: `d221e766374dea2360b2e19636504882d5d662ce`
- Prior cutover report: `architecture/SNAPSHOT_POLLING_P1_2_POST_MERGE_PRODUCTION_CUTOVER_2026-08-29.md`
- Prior cutover verdict: **P1.2 PRODUCTION CUTOVER PASS WITH OBSERVATIONS — SAFE, FOLLOW-UP REQUIRED**

**Scope:** current certified envelope only — N ≤ 100 CONNECTED vehicles, single PM2 fork replica, `WORKER_SNAPSHOT_CONCURRENCY=8`. N≈1000 remains P1.3.

---

## 1. Current production verification

| Check | Result |
|-------|--------|
| Runtime application SHA | **`d221e766374dea2360b2e19636504882d5d662ce`** (unchanged) |
| `main` HEAD (docs-only commits after deploy) | `c44a95368` — documentation only; runtime remains `d221e766` |
| PM2 `synqdrive` | **online** |
| PM2 mode | **fork** (`exec_mode: fork_mode`) |
| Replica count | **1** |
| Health `https://app.synqdrive.eu/api/v1/health` | `{"status":"ok","uptime":1918,...}` at `2026-08-29T17:53:12Z` |
| Restart loop | **No** (`unstable restarts: 0`; restarts=10 = historical deploy restart) |
| Uptime since P1.2 deploy | **~33 minutes** at final check (`created at 2026-08-29T17:21:14Z`) |

### Effective certified configuration (not mutated)

| Variable | Value |
|----------|-------|
| `WORKER_SNAPSHOT_CONCURRENCY` | **8** |
| `WORKER_TRIP_TRACKING_CONCURRENCY` | **5** |
| `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED` | **true** |
| `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED` | **true** |
| `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE` | **unset** (≠ true) |

---

## 2. DIMO 403 investigation

### Subject vehicle (sanitized)

| Field | Value |
|-------|-------|
| `vehicleId` | `c43c3b45-b911-498f-baf9-4376dd585588` |
| `dimoVehicleId` | `c67e21b0-e036-4701-89b3-99d291e979a8` |
| DIMO `tokenId` | **190497** |
| `DimoVehicle.connectionStatus` | **CONNECTED** |
| `Vehicle.status` | AVAILABLE |
| Active DIMO data-source link | **yes** (`isActive: true`, activated `2026-08-25`) |
| `VehicleProviderConsent` | **ACTIVE** (`grantType: DIMO_DIRECT`, `revokedAt: null`) |
| Device connection episodes | **none** recorded |

### Provider endpoint

Snapshot polls call:

1. `DimoAuthService.getVehicleJwt(tokenId)` — vehicle-scoped JWT
2. `DimoTelemetryService.fetchLatestVehicleSnapshot(vehicleJwt, tokenId)`
3. DIMO Telemetry GraphQL at `https://telemetry-api.dimo.zone/query`
4. Query field: **`signalsLatest(tokenId: 190497)`** (`buildLatestSnapshotQuery`)

HTTP **403** is returned from this telemetry GraphQL path (axios `Request failed with status code 403`). No evidence that other DIMO signal queries succeed for this vehicle while snapshot fails — **all snapshot polls for this vehicle fail**.

### Temporal pattern

| Metric | Value |
|--------|-------|
| First HTTP 403 poll log | **`2026-08-26T22:11:33Z`** (predates P1.2 deploy) |
| Latest HTTP 403 poll log | **`2026-08-29T17:54:25Z`** (ongoing at closure check) |
| Polls since P1.2 deploy (`17:21:14Z`) | **191** — **100% FAILURE** for this vehicle |
| Polls since deploy — all other vehicles | **SUCCESS** (69 total across 5 vehicles) |
| Lifetime poll logs this vehicle | SUCCESS **106,591** / FAILURE **24,380** (mixed history; current state is persistent 403) |
| PM2 log 403 lines since deploy | **863** WARN lines (processor re-logs per attempt) |

### Retry / load behavior

| Mechanism | Behavior |
|-----------|----------|
| BullMQ jobId | `snapshot-${vehicleId}` — dedup per vehicle |
| `removeOnFail` | `{ count: 50, age: 3600 }` on enqueue |
| Processor on failure | Writes `DimoPollLog` FAILURE, logs WARN, **rethrows** (job fails) |
| Scheduler on next tick | Removes terminal failed job, re-enqueues if vehicle still CONNECTED+due |
| Connection status degradation on 403 | **No** — `DimoVehicle.connectionStatus` remains CONNECTED |
| Activity-tier gating | Still schedules this vehicle when tier due (~191 attempts in ~33 min post-deploy) |

### Classification

| Option | Assessment |
|--------|------------|
| A. benign/expected | **No** — persistent hard denial |
| B. vehicle authorization / operational | **Yes** — DIMO rejects `signalsLatest` despite ACTIVE consent + CONNECTED in our DB |
| C. SynqDrive follow-up bug | **Yes (non-P1.2)** — persistent provider 403 does not downgrade connectivity state; vehicle remains in scheduler cohort indefinitely |
| D. P1.2 correctness blocker | **No** — predates deploy (`2026-08-26`), isolated to one vehicle, other vehicles poll successfully, no P1.2 trip-loss regression |

### Should repeated 403 cause connection degradation?

**Current behavior:** No — snapshot failure logs + poll FAILURE rows only; scheduler continues enqueue while `connectionStatus=CONNECTED`.

**Assessment:** For persistent HTTP 403, degrading connection/authorization state would reduce wasted provider load and operator confusion. This is an **existing connectivity-state architecture gap**, not introduced by P1.2. Document for separate follow-up; **do not expand P1.2 scope**.

---

## 3. Historical failed trip-tracking jobs

### Job 1: `trip-ps-f50437cd-fae8-4fd6-89f3-0c26460f50a1-1782174147935`

| Field | Value |
|-------|-------|
| Queue | `dimo.trip-tracking` |
| Created (`timestamp`) | `1782174147935` → **2026-06-23T00:22:27.935Z** |
| Failed (`finishedOn`) | `1782174193164` → **2026-06-23T00:23:13.164Z** |
| Attempts | **3** (exhausted) |
| Trigger | `POSSIBLE_START` |
| `vehicleId` in job data | `f50437cd-fae8-4fd6-89f3-0c26460f50a1` |
| Failure reason | Prisma FK: `dimo_poll_logs_vehicle_id_fkey` — vehicle row does not exist |
| Associated trip | **none** |
| Canonical recovery | **N/A** — vehicle deleted/invalid |
| Permanent trip loss | **No** — stale job for non-existent vehicle |
| Classification | **A — harmless historical residue** |

### Job 2: `trip-at-19fedd4b-c4e8-4de8-a125-dab293326e7e-886fd581-8397-48de-9b4a-4e638b619266`

| Field | Value |
|-------|-------|
| Queue | `dimo.trip-tracking` |
| Created | **2026-07-12T11:28:30.707Z** |
| Failed | **2026-07-12T11:29:16.030Z** |
| Attempts | **3** (exhausted) |
| Trigger | `ACTIVE_TICK` |
| `vehicleId` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| Failure reason | Postgres: `FATAL: the database system is not yet accepting connections` (recovery window) |
| Canonical trip today | **Yes** — post-deploy natural trip `cf646b3d-63ae-4ba0-83a1-d8c20524cc93` |
| Enrichment | Post-deploy trip enrichment **PENDING** (trip still ONGOING at closure) |
| Permanent trip loss | **No** |
| Classification | **B — successfully recovered failure** (transient infra; vehicle operational) |

### Cleanup policy

BullMQ opts on trip-tracking jobs: `removeOnFail: 5`. Failed jobs retained in Redis ZSET by design. **No cleanup performed.** No new cleanup mechanism invented.

---

## 4. Natural post-deploy drive

**Deploy timestamp:** `2026-08-29T17:21:14Z`

### Natural drive found: **YES**

| Field | Value |
|-------|-------|
| `vehicleId` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| `tripId` | `cf646b3d-63ae-4ba0-83a1-d8c20524cc93` |
| `startTime` | `2026-08-29T17:42:00.000Z` (after deploy) |
| `createdAt` | `2026-08-29T17:46:20.813Z` |
| `endTime` | `2026-08-29T17:53:50.123Z` |
| `tripStatus` | **ONGOING** (end detected; closure pending) |
| `tripSource` | **V2_LIVE** |
| `isRepaired` | **false** |
| `dimoSegmentId` | **`dimo-seg-192922-1788025320000`** |
| `behaviorSummaryStatus` | **PENDING** |
| `drivingImpactStatus` | **PENDING** |
| `tripAnalysisStatus` | **null** |
| `TripRepair` rows | **0** for this trip |

### End-to-end trace (observed)

1. **Snapshot observation** — vehicle `19fedd4b`: **53 SUCCESS** `DimoPollLog` rows since deploy
2. **Trip tracking** — **20+** `VehicleTripTrackingRun` rows (`POSSIBLE_START_VALIDATION`) from `17:22:20Z` through `17:43:50Z` before trip creation
3. **Canonical trip created** — `cf646b3d` at `17:46:20Z` via V2_LIVE FSM
4. **Provider segment binding** — `dimoSegmentId=dimo-seg-192922-1788025320000` (token 192922 in segment id)
5. **Reconciliation / boundary repair** — not applicable (`isRepaired=false`, no repairs)
6. **Enrichment** — **in progress** (PENDING — expected for ONGOING trip)
7. **Trip analysis** — not yet completed

### ONE PHYSICAL DRIVE → ONE CANONICAL TRIP

| Evidence | Result |
|----------|--------|
| Trips with same `dimoSegmentId` | **1** (`cf646b3d` only) |
| Trips per vehicle since deploy | **1** for `19fedd4b` |
| Duplicate segment groups since deploy | **0** (`DUP_SEGMENTS_RAW: []`) |
| Overlap window `17:40–18:00` for vehicle | **1** trip only |

**Assertion: PROVEN** for this natural post-deploy drive via unique `dimoSegmentId` canonical binding.

---

## 5. Longer queue soak check (~33 min since deploy)

### Current queue state (`2026-08-29T17:54Z`)

| Queue | waiting | active | delayed | failed |
|-------|---------|--------|---------|--------|
| `dimo.snapshot.poll` | 0 | 0 | 1 | 0 |
| `dimo.trip-tracking` | 0 | 0 | 0 | 2 |
| `trip.behavior.enrichment` | 0 | 0 | 0 | 0 |
| `trip.driving-impact.compute` | 0 | 0 | 0 | 0 |

### Trends since deploy

| Finding | Result |
|---------|--------|
| Waiting backlog growth | **No** — `waiting=0` throughout |
| New failed jobs since deploy | **0** new trip-tracking failures (still 2 historical) |
| Snapshot failed ZSET | Cleared to 0 (was 1 briefly; `removeOnFail` retention) |
| Retry storms | **None** (except isolated 403 vehicle WARN cadence) |
| Activity-tier scheduling | **Normal** — 5 vehicles SUCCESS polling; 1 vehicle persistent 403 |
| PM2 restarts since deploy | **0** |

### Logs since deploy (`17:21:14Z`)

| Symptom | Finding |
|---------|---------|
| HTTP 429 | **None** |
| Timeout bursts | **None** (excluding pre-existing 403 vehicle) |
| DIMO 5xx bursts | **None** |
| Redis errors | **None** — `Redis connected` at startup |
| PostgreSQL/Prisma errors | **None** since deploy |
| Scheduler duplication | **None** |
| Snapshot processor failure storm | **Only vehicle `c43c3b45…` (403)** — 863 log lines |

---

## 6. Trip correctness since deploy

Read-only checks on trips with `createdAt > 2026-08-29T17:21:14Z`:

| Check | Count |
|-------|-------|
| Trips created | **1** |
| Trips with `startTime` after deploy | **1** |
| Duplicate `dimoSegmentId` groups | **0** |
| Overlapping duplicate canonical trips (same vehicle/drive) | **0** |
| Identical segment → multiple trips | **0** |
| `ONGOING` with `endTime` set (closure in progress) | **1** (post-deploy trip — normal FSM) |
| Stale `ONGOING` > 3 hours | **0** |
| Repaired trips with incomplete enrichment | **0** |
| Repair loops / repeated repair generation | **0** |
| Reconciliation failures | **0** observed |

---

## 7. Residual-risk matrix

| Observation | Finding | P1.2 blocker? | Follow-up |
|-------------|---------|---------------|-----------|
| DIMO 403 vehicle `c43c3b45…` | Persistent `signalsLatest` HTTP 403 since `2026-08-26`; DB still CONNECTED; 191/191 polls fail since deploy; consent ACTIVE in DB | **No** | **B + C:** operator/DIMO auth investigation; separate ticket for connectivity degradation on persistent 403 |
| Failed job `trip-ps-f50437cd…` | 2026-06-23 FK violation; vehicle deleted | **No** | **A:** historical Redis residue; optional manual ZREM under existing `removeOnFail:5` policy |
| Failed job `trip-at-19fedd4b…` | 2026-07-12 Postgres recovery transient | **No** | **B:** recovered; same vehicle has post-deploy trip |
| Post-deploy natural drive | **1** trip `cf646b3d`; unique segment; V2_LIVE | **No** | Monitor enrichment completion on trip close |
| Long-horizon queues | No waiting backlog; no new failures | **No** | Continue routine monitoring |
| Duplicate-trip check | 0 duplicates since deploy | **No** | — |
| Enrichment completion (post-deploy trip) | PENDING — trip still ONGOING | **No** | Expected until trip completes |
| Provider saturation | No 429/timeout/5xx storm | **No** | — |
| Scheduler stability | Single fork PM2; no restart loop | **No** | — |
| Connectivity state on 403 | No auto-degradation | **No (P1.2)** | **C:** separate connectivity architecture follow-up |

---

## 8. Final P1.2 verdict

**P1.2 CLOSED — NON-BLOCKING OPERATIONAL FOLLOW-UPS REMAIN**

### Rationale

- Production runs certified P1.2 configuration on `d221e766` with stable PM2/health/queues.
- Natural post-deploy drive observed with **proven** one-segment → one-canonical-trip invariant.
- Historical failed BullMQ jobs are **residue or recovered** — no permanent trip loss.
- Isolated DIMO 403 is **pre-existing**, vehicle-specific, and **not a P1.2 correctness regression**.
- Post-deploy trip enrichment is **in progress** (ONGOING/PENDING) — not a P1.2 blocker.
- N≈1000 remains **out of scope** (P1.3).

### Non-blocking follow-ups (outside P1.2 closure)

1. Operator/DIMO investigation for vehicle `c43c3b45…` token **190497** persistent 403.
2. Connectivity architecture: degrade/exclude vehicles with sustained telemetry 403 from scheduler cohort.
3. Monitor post-deploy trip `cf646b3d` through COMPLETED + enrichment READY.
4. Optional Redis cleanup of 2 historical failed trip-tracking jobs per existing retention policy.

---

## Raw production evidence

### Proven runtime facts

```text
# SHA
git -C /opt/synqdrive/current rev-parse HEAD
→ d221e766374dea2360b2e19636504882d5d662ce

# PM2
synqdrive | fork | online | pid 1451990 | uptime 33m | restarts 10 | unstable 0

# Health
{"status":"ok","uptime":1918,"timestamp":"2026-08-29T17:53:12.750Z"}

# Env
WORKER_SNAPSHOT_CONCURRENCY=8
WORKER_TRIP_TRACKING_CONCURRENCY=5
TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=true
WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED=true
WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=<unset>

# Scheduler cohort
SCHEDULER_COHORT_CONNECTED = 6

# 403 vehicle mapping
vehicleId=c43c3b45-b911-498f-baf9-4376dd585588
dimoVehicle.tokenId=190497
dimoVehicle.connectionStatus=CONNECTED
VehicleProviderConsent.status=ACTIVE

# 403 timeline
FIRST_403_AT=2026-08-26T22:11:33.755Z
LAST_403_AT=2026-08-29T17:54:25.253Z
FAIL_403_SINCE_DEPLOY=191/191 polls for vehicle c43c3b45…
POLL_SUCCESS_OTHER_VEHICLES_SINCE_DEPLOY=69

# Poll breakdown since deploy
c43c3b45… FAILURE=191
c10351f8… SUCCESS=5
68868291… SUCCESS=1
19fedd4b… SUCCESS=53
8c850ff1… SUCCESS=5
a60c0749… SUCCESS=5

# Natural post-deploy trip
tripId=cf646b3d-63ae-4ba0-83a1-d8c20524cc93
vehicleId=19fedd4b-c4e8-4de8-a125-dab293326e7e
startTime=2026-08-29T17:42:00.000Z
dimoSegmentId=dimo-seg-192922-1788025320000
tripSource=V2_LIVE
TRIPS_WITH_SAME_SEGMENT=1
DUP_SEGMENTS_SINCE_DEPLOY=0

# Queues at closure
dimo.snapshot.poll wait=0 active=0 delayed=1 failed=0
dimo.trip-tracking wait=0 active=0 delayed=0 failed=2
trip.behavior.enrichment wait=0 active=0 delayed=0 failed=0
trip.driving-impact.compute wait=0 active=0 delayed=0 failed=0
```

### Redis failed-job excerpts (sanitized)

```text
# Job 1 — FK violation, deleted vehicle
failedReason: Foreign key constraint violated: dimo_poll_logs_vehicle_id_fkey
data.vehicleId: f50437cd-fae8-4fd6-89f3-0c26460f50a1
data.requestedAt: 2026-06-23T00:22:27.935Z
attempts: 3

# Job 2 — Postgres recovery
failedReason: FATAL: the database system is not yet accepting connections
data.vehicleId: 19fedd4b-c4e8-4de8-a125-dab293326e7e
data.requestedAt: 2026-07-12T11:28:30.707Z
attempts: 3
```

### Code-derived expectations (not re-proven live)

- Boundary refresh `PENDING/ENQUEUED/COMPLETED` lifecycle — no direct production DB query; post-deploy trip not repaired.
- Trip end FSM transition ONGOING → COMPLETED — in progress for natural drive (`endTime` set, status still ONGOING).
- Enrichment queues after COMPLETED — expected to follow existing pipeline.

### Unavailable / incomplete evidence

- DIMO provider-side authorization reason for HTTP 403 (no provider admin access).
- Full enrichment completion on post-deploy trip at closure time (trip still ONGOING).
- Long-horizon soak beyond ~33 minutes (sufficient to rule out immediate backlog storm, not a multi-hour soak).

---

## Related documents

| Document | Role |
|----------|------|
| `SNAPSHOT_POLLING_P1_2_POST_MERGE_PRODUCTION_CUTOVER_2026-08-29.md` | Initial cutover record |
| `SNAPSHOT_POLLING_P1_2_FINAL6_CURRENT_PROD_RELEASE_GATE_2026-08-29.md` | Certified envelope definition |
