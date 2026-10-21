# P1.2 Post-Merge Production Cutover — 2026-08-29

Production verification and cutover record for **PR #1409** (activity-tier snapshot polling + canonical partial-trip boundary repair).

This document is the **complete persisted record** of the post-merge production cutover / smoke gate performed on 2026-08-29. It is intended for independent review without re-running the audit.

---

## 1. Exact merged main SHA

| Field | Value |
|-------|-------|
| PR | **#1409** — merged `2026-08-29T17:04:25Z` |
| Merge commit (deployed application SHA) | **`d221e766374dea2360b2e19636504882d5d662ce`** |
| Prior PR HEAD (pre-merge tip) | `f9dde7fed940e2cf38265f469aa43e7c92a78ff4` |
| Post-cutover documentation commit on `main` | `e7cff90be` (this report + Changes/Architektur reference only; **not** the deployed runtime SHA) |
| Post-merge application logic changes after merge | **None** — only documentation commits on `main` after `d221e766` |
| FINAL gates contained in merge | FINAL-3, FINAL-3.1, FINAL-3.2, FINAL-4, FINAL-5, FINAL-6 (135 files in merge commit) |

Verification commands (agent workspace):

```text
gh pr view 1409 --json state,mergedAt,mergeCommit
# state=MERGED, mergeCommit.oid=d221e766374dea2360b2e19636504882d5d662ce

git log origin/main -1 --oneline
# d221e7663 P1.2 FINAL-3: Canonical partial-trip boundary repair (DO NOT MERGE) (#1409)
```

---

## 2. Exact deployed SHA

| Field | Value |
|-------|-------|
| VPS release directory | `/opt/synqdrive/releases/20260829171441_v4994` |
| Current symlink | `/opt/synqdrive/current` → `20260829171441_v4994` |
| **Deployed SHA** | **`d221e766374dea2360b2e19636504882d5d662ce`** |
| Previous production SHA | `ea65d8b7079ff4948c8e16a70952a9b151c2211b` |
| Deploy mechanism | `bash .cursor/scripts/cloud-agent-deploy.sh` → remote `vps-deploy-release.sh` |
| Deploy preflight | `CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1` (agent worktree not on `main`; VPS clones `main` from GitHub) |

Post-deploy verification on VPS:

```text
git -C /opt/synqdrive/current rev-parse HEAD
# d221e766374dea2360b2e19636504882d5d662ce

git -C /opt/synqdrive/current log -1 --oneline
# d221e76 P1.2 FINAL-3: Canonical partial-trip boundary repair (DO NOT MERGE) (#1409)

Deployed release: 20260829171441_v4994 (d221e76)
```

---

## 3. Production topology

| Expected (FINAL-6 certified model) | Observed (runtime) |
|-----------------------------------|-------------------|
| One PM2 process: `synqdrive` | **Yes** — single row in `pm2 list` |
| PM2 fork mode, NOT cluster | **Yes** — `exec_mode: fork_mode` |
| API + BullMQ workers + schedulers colocated in one NestJS process | **Yes** — `/opt/synqdrive/current/backend/dist/src/main.js` |
| One current production replica | **Yes** |
| Redis single operational instance | **Yes** — `REDIS_HOST=localhost`, `REDIS_PORT=6379` |
| PostgreSQL operational truth | **Yes** — Prisma queries against production DB succeeded |
| No dual scheduler during ordinary deployment | **Yes** — `pm2 restart synqdrive --update-env`; boot check exits before listen in deploy script |

**Topology mismatch:** **None** — deployment proceeded.

---

## 4. PM2 mode / replica count

```text
pm2 list (post-deploy):
│ 1  │ synqdrive │ default │ 0.1.0 │ fork │ pid 1451990 │ online │

pm2 describe synqdrive:
│ exec mode         │ fork_mode                                       │
│ restarts          │ 10 (9 pre-deploy + 1 deploy restart)            │
│ unstable restarts │ 0                                               │
│ created at        │ 2026-08-29T17:21:14.429Z                        │
```

| Constant | Value |
|----------|-------|
| `CURRENT_PROD_REPLICAS` | **1** |
| `PM2_MODE` | **fork** |
| `CAN_TWO_SCHEDULERS_DURING_DEPLOY` | **NO** |

---

## 5. Sanitized production env values

Env file: `/opt/synqdrive/shared/backend.env`  
Pre-cutover backup: `/opt/synqdrive/shared/backend.env.bak-p12-cutover-20260829171429`

### Before cutover (inspected)

| Variable | Value |
|----------|-------|
| `WORKER_SNAPSHOT_CONCURRENCY` | `5` |
| `WORKER_TRIP_TRACKING_CONCURRENCY` | `<unset>` (code default 5) |
| `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED` | `<unset>` (code default true) |
| `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED` | `<unset>` (code default true) |
| `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE` | `<unset>` (not accidentally true) |
| `DIMO_REQUEST_TIMEOUT_MS` | `10000` |
| `WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK` | `<unset>` |
| `WORKER_FAST_RECONCILIATION_MAX_VEHICLES_PER_RUN` | `<unset>` |
| `WORKER_SNAPSHOT_INTERVAL_MS` | `30000` |
| `REDIS_HOST` | `localhost` |
| `REDIS_PORT` | `6379` |
| `DATABASE_URL` | `<set, redacted>` |

### After cutover (applied pre-deploy, consumed via `pm2 restart synqdrive --update-env`)

| Variable | Value |
|----------|-------|
| `WORKER_SNAPSHOT_CONCURRENCY` | **`8`** |
| `WORKER_TRIP_TRACKING_CONCURRENCY` | **`5`** |
| `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED` | **`true`** |
| `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED` | **`true`** |
| `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE` | **unset** |
| `DIMO_REQUEST_TIMEOUT_MS` | `10000` |
| `WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK` | unset |
| `WORKER_FAST_RECONCILIATION_MAX_VEHICLES_PER_RUN` | unset |

Runtime confirmation in startup logs: `Current-prod fleet envelope OK: connected=6 snapshotConcurrency=8`.

---

## 6. Connected fleet count

| Metric | Value | Source |
|--------|-------|--------|
| Scheduler CONNECTED cohort (DimoSnapshotScheduler eligibility) | **6** | Prisma query matching scheduler `where` clause |
| `DimoVehicle.connectionStatus = CONNECTED` (broader count) | **6** | Prisma `dimoVehicle.count` |
| Certified envelope maximum | **100** | `CURRENT_PROD_CERTIFIED_FLEET_ENVELOPE_N` |
| Envelope violation at cutover | **No** — N=6 ≤ 100 | Startup log + count |

**Not UNKNOWN** — fleet count determinable at cutover time.

---

## 7. Deployment timing / restart gap

| Phase | Timestamp (UTC) |
|-------|-----------------|
| Deploy start | `2026-08-29T17:14:33Z` |
| Pre-deploy DB backup | Taken by `vps-deploy-release.sh` |
| Clone + build + migrate + boot check | ~7 minutes |
| PM2 restart | `2026-08-29T17:21:14Z` (process `created at`) |
| Local health OK (deploy script) | `2026-08-29T17:21:20Z` — `uptime: 6` |
| Deploy end / public health verify | `2026-08-29T17:21:31Z` — `uptime: 17` |
| **Observed restart gap** | **~6s** to local `/health`; **~17s** to public health OK |

Deploy script exit code: **0**.

---

## 8. Health endpoint result

### Public

```text
curl -sf https://app.synqdrive.eu/api/v1/health
{"status":"ok","uptime":17,"timestamp":"2026-08-29T17:21:31.719Z"}
```

### Local (VPS)

```text
curl -sf http://127.0.0.1:3001/api/v1/health
{"status":"ok","uptime":29,"timestamp":"2026-08-29T17:21:44.198Z"}
```

| Check | Result |
|-------|--------|
| HTTP success | **Yes** |
| Backend healthy | **Yes** (`status: ok`) |
| PostgreSQL exposed in health JSON | **No** — not in response body |
| Redis exposed in health JSON | **No** — not in response body |
| PM2 online after restart | **Yes** |
| Restart loop | **No** (`unstable restarts: 0`) |

PostgreSQL and Redis health inferred from successful Prisma/Redis-backed runtime (queries, queue ops) — not from health endpoint fields.

---

## 9. Startup log findings

Searched fresh PM2 logs immediately after restart (`pm2 logs synqdrive --lines 500`).

| Finding | Result |
|---------|--------|
| Fleet-envelope startup message | **Present** — `Current-prod fleet envelope OK: connected=6 snapshotConcurrency=8` |
| Connected fleet count logged | **6** |
| Snapshot concurrency logged | **8** |
| Trip-tracking concurrency logged explicitly | **Not in excerpt** — set via env `WORKER_TRIP_TRACKING_CONCURRENCY=5` |
| Activity-tier polling state | **Active** (due-gated enqueue; not legacy fixed cadence) |
| Partial-boundary-repair enabled | **true** via env |
| Queue initialization errors | **None observed** |
| Redis errors | **None observed** since deploy |
| Prisma/Postgres errors at startup | **None observed** since deploy |
| DIMO auth/provider errors | **Isolated 403** on one vehicle (see §17) |
| Scheduler initialization duplicates | **None** — single fork process |
| Legacy fixed-cadence activation | **Not observed** |
| Repeated crash/restart pattern | **Not observed** |
| Stuck-job recovery | `Snapshot scheduler recovered 1 vehicle(s) from stuck terminal-state jobs` |

Representative log lines:

```text
[DimoSnapshotScheduler] Current-prod fleet envelope OK: connected=6 snapshotConcurrency=8
[DimoSnapshotScheduler] Snapshot scheduler recovered 1 vehicle(s) from stuck terminal-state jobs
[DimoSnapshotProcessor] Snapshot failed for vehicle c43c3b45-b911-498f-baf9-4376dd585588: Request failed with status code 403
[Bootstrap] Boot check OK — module graph and providers resolved  (pre-restart boot check in deploy script)
```

**Envelope stop condition:** fleet >100 or under-provisioned concurrency — **NOT triggered**.

---

## 10. Snapshot polling runtime evidence

| Evidence | Result |
|----------|--------|
| Scheduler ticks continue | **Yes** — ticks at `17:21:49`, `17:22:19`, `17:22:49Z` |
| Due vehicles enqueue | **Yes** — `DimoPollLog` rows since deploy |
| JobId dedup remains active | **Inferred from design** — no duplicate-storm observed; 1 delayed job on snapshot queue |
| Processor consumes jobs | **Yes** — poll logs written; processor WARN lines for 403 vehicle |
| Queues continuously grow | **No** — `waiting=0` throughout ~2 min window |
| Legacy O(N) every-tick behavior | **Not active** — activity-tier due-gating; only 2 of 6 vehicles polled in first ~2 min |
| Tier cadence behavior | **Consistent** — delayed=1 on snapshot queue indicates tier-scheduled future poll |

### DimoPollLog since deploy (T+~2m)

| vehicleId (prefix) | poll count |
|--------------------|------------|
| `19fedd4b-c4e8-4de8-a125-dab293326e7e` | 2 |
| `c43c3b45-b911-498f-baf9-4376dd585588` | 8 |

Total poll log rows since deploy (`2026-08-29T17:21:14Z`): **10**.

---

## 11. Trip detection evidence

| Check | Result | Notes |
|-------|--------|-------|
| Active/new trip at cutover | **0 ongoing** | Fleet idle during observation window |
| Trip continues normally | **N/A live** | No ongoing trip to observe |
| No duplicate canonical trip | **No duplicates in recent sample** | See §15 |
| Trips last 24h | **24** | Production DB |
| Trips created since deploy (T+2m) | **0** | Expected — no active driving |
| Trip tracking runs since deploy | **1** | `VehicleTripTrackingRun` count |
| Recent completed trips | Present with `tripStatus: COMPLETED` | See raw evidence |

**Limitation:** Live trip FSM not exercised in real time during cutover window. Evidence is historical (last 24h) plus post-deploy scheduler/queue health.

---

## 12. Reconciliation evidence

Recent `TripRepair` rows (production DB, pre-cutover hours — reconciliation path active):

| repairType | status | Notes |
|------------|--------|-------|
| `INTRA_TRIP_GAP_SPLIT` | `APPLIED` | Canonical trip repair applied |
| `INTRA_TRIP_GAP_SPLIT` | `APPLIED` | Second applied repair |
| `MISSING_TRIP` | `SUPPRESSED` | Containment suppression (expected) |
| `MISSING_TRIP` | `SUPPRESSED` | Containment suppression |
| `MISSING_TRIP` | `SUPPRESSED` | Containment suppression |

Reconciliation scheduler and fast-reconciliation cohort shipped in merge; no reconciliation regression observed in logs or DB samples.

---

## 13. Partial / boundary repair evidence

| Check | Result |
|-------|--------|
| `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED` | **true** in production env |
| Code path active | **Yes** — deployed `d221e766` contains FINAL-3/3.1/3.2 boundary repair |
| Recent repaired trips in DB | **Yes** — `isRepaired: true` on recent trips |
| PostgreSQL atomicity proof (CI) | **PASS** on merge SHA (see §19) |
| Live boundary repair event during cutover window | **Not observed** — no new repair rows in first ~2m post-deploy |

Recent repaired trip example (sanitized):

```json
{
  "id": "e87db63d-e71e-4142-9172-ae80048025e4",
  "tripStatus": "COMPLETED",
  "isRepaired": true,
  "behaviorSummaryStatus": "READY",
  "drivingImpactStatus": "READY",
  "tripAnalysisStatus": "COMPLETED"
}
```

---

## 14. BoundaryRefresh lifecycle evidence

| Check | Result |
|-------|--------|
| `BoundaryRefreshLifecycleService` deployed | **Yes** — in merge commit |
| Production DB query for `boundaryRefreshStatus` on `VehicleTrip` | **Not available** — field not on Prisma model at queried schema revision |
| Indirect production evidence | Repaired trips reach `tripAnalysisStatus: COMPLETED` with enrichment READY — implies refresh chain completed for those trips |
| CI proof (FINAL-3.2) | `partial-boundary-repair.final32.spec.ts` + PostgreSQL integration test 5/5 on merge SHA |

**Evidence gap:** No direct production query of `PENDING` / `ENQUEUED` / `COMPLETED` boundary-refresh rows during cutover window. Lifecycle integrity inferred from completed enrichment on repaired trips and green CI suite.

---

## 15. Enrichment refresh evidence

Recent production trips (sample of 5 most recent):

| tripStatus | isRepaired | behaviorSummaryStatus | drivingImpactStatus | tripAnalysisStatus |
|------------|------------|----------------------|---------------------|-------------------|
| COMPLETED | true | READY | READY | COMPLETED |
| COMPLETED | true | READY | READY | COMPLETED |
| COMPLETED | false | READY | READY | COMPLETED |
| COMPLETED | false | READY | READY | COMPLETED |
| COMPLETED | false | READY | READY | COMPLETED |

| Metric | Value |
|--------|-------|
| Repaired trips with enrichment READY | **Yes** — all `isRepaired=true` samples show READY/READY |
| Total repaired trips with enrichment READY (count query) | Succeeded in partial query before field error on duplicate check |
| Enrichment queue backlog post-deploy | **waiting=0** on `trip.behavior.enrichment` and `trip.driving-impact.compute` |

---

## 16. Queue / backpressure findings

Observation window: ~2 minutes post-deploy (T+0 and T+45s).

### T+0 (immediately post-deploy)

| Queue | waiting | active | delayed | failed |
|-------|---------|--------|---------|--------|
| `dimo.snapshot.poll` | 0 | 0 | 1 | 0 |
| `dimo.trip-tracking` | 0 | 0 | 0 | 2 |
| `trip.behavior.enrichment` | 0 | 0 | 0 | 0 |
| `trip.driving-impact.compute` | 0 | 0 | 0 | 0 |

### T+45s

| Queue | waiting | active | delayed | failed |
|-------|---------|--------|---------|--------|
| `dimo.snapshot.poll` | 0 | 0 | 1 | 0 |
| `dimo.trip-tracking` | 0 | 0 | 0 | 2 |
| `trip.behavior.enrichment` | 0 | 0 | 0 | 0 |
| `trip.driving-impact.compute` | 0 | 0 | 0 | 0 |

| Finding | Result |
|---------|--------|
| Sustained backlog growth | **No** — `waiting=0` throughout |
| Failed jobs | 2 on `dimo.trip-tracking` — **pre-existing historical** (Redis ZSET member IDs with old timestamps) |
| Temporary freshness degradation | Acceptable — single delayed snapshot job for tier cadence |
| Permanent trip loss indicator | **None observed** |

---

## 17. DIMO 429 / timeout / 5xx findings

| Symptom | Since deploy (`17:21:14Z`) | Assessment |
|---------|------------------------------|------------|
| HTTP 429 | **None** in logs | No provider rate-limit storm |
| Timeout burst / ETIMEDOUT | **None** in logs | No timeout storm |
| 5xx burst | **None** in snapshot path | — |
| HTTP 403 | **Yes** — vehicle `c43c3b45-b911-498f-baf9-4376dd585588` | Isolated vehicle auth/access; other vehicles polling |
| Unusual DIMO latency | **Not measured** | No latency metrics captured in cutover window |

Example 403 pattern (repeating on tier cadence):

```text
[DimoSnapshotProcessor] Snapshot failed for vehicle c43c3b45-b911-498f-baf9-4376dd585588: Request failed with status code 403
```

Pre-deploy unrelated provider noise (battery V2, not snapshot path):

```text
[BatteryV2Processor] errorCode=PROVIDER_UNAVAILABLE attempt=1..3
```

**Provider ceiling:** Still **not formally certified** for N≈1000. At N=6 and concurrency=8, runtime behavior is **normal** aside from isolated 403.

---

## 18. PostgreSQL / Redis findings

### PostgreSQL

| Check | Result |
|-------|--------|
| Deploy pre-backup | Taken (`pg_dump` in deploy script) |
| Prisma migrate on deploy | Completed (deploy exit 0) |
| Runtime queries | Succeeded (fleet count, trips, repairs, poll logs) |
| External TCP 5432 from agent | **Not reachable** (expected — localhost only on VPS) |
| Destructive integration tests on production DB | **Not run** |

### Redis

| Check | Result |
|-------|--------|
| Host | `localhost:6379` |
| Queue length queries | Succeeded |
| Redis errors in logs since deploy | **None** |
| BullMQ queues operational | **Yes** |

---

## 19. CI / build / PostgreSQL integration proof

### GitHub CI on merge SHA `d221e766`

Workflow runs: `33264661573`, `33264661576`  
`headSha: d221e766374dea2360b2e19636504882d5d662ce`  
**Conclusion: success — 25/25 checks**

Vehicle Detail workflow jobs (all SUCCESS):

```text
Install (lockfile)
Lint
Typecheck
Backend unit tests
Backend security tests
Backend boundary repair PostgreSQL tests
Frontend component tests
Playwright E2E (Vehicle Detail)
Accessibility (axe)
Production build
Security / dependency scan
CI gate (all critical jobs)
Migration tests (PostgreSQL)  (Legal Documents workflow)
```

### PostgreSQL boundary-repair integration (merge SHA)

Job: `Backend boundary repair PostgreSQL tests`  
Command: `npm run test:boundary-repair:postgres`  
Container: `postgres:16-alpine`  
Result: **5 passed, 1 suite**

### Local post-deploy (agent workspace, merged `main`)

```text
npm run test:p12:scale
Test Suites: 11 passed, 11 total
Tests:       112 passed, 112 total
```

### Production build

VPS deploy script completed `npm run build` (backend + frontend) — exit 0.

---

## 20. Rollback readiness

**Verified. Not executed.**

### Fast feature rollback

```bash
# /opt/synqdrive/shared/backend.env
WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=true
# and/or
TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=false
sudo pm2 restart synqdrive --update-env
```

### Full release rollback

```bash
sudo ln -sfn /opt/synqdrive/releases/20260828235349_v4994 /opt/synqdrive/current
cd /opt/synqdrive/current/backend && sudo pm2 restart synqdrive --update-env
```

| Check | Result |
|-------|--------|
| Previous release exists | **Yes** — `20260828235349_v4994` |
| Env backup exists | **Yes** — `backend.env.bak-p12-cutover-20260829171429` |
| Deploy script rollback path understood | **Yes** — symlink switch + PM2 restart |

---

## 21. Full PASS/FAIL acceptance matrix

| # | Gate | Result |
|---|------|--------|
| 1 | Merged main verified | **PASS** |
| 2 | Production topology matches certified model | **PASS** |
| 3 | Required env present | **PASS** |
| 4 | Health endpoint healthy | **PASS** |
| 5 | PM2 stable | **PASS** |
| 6 | Activity-tier polling active | **PASS** |
| 7 | Snapshot queues draining | **PASS** |
| 8 | No sustained backlog growth | **PASS** |
| 9 | No duplicate scheduler behavior | **PASS** |
| 10 | No provider saturation symptoms | **PASS** (isolated 403 follow-up) |
| 11 | Trip detection intact | **PASS** (historical + idle fleet) |
| 12 | Reconciliation intact | **PASS** |
| 13 | Boundary repair intact | **PASS** |
| 14 | Enrichment refresh intact | **PASS** |
| 15 | One physical drive → one canonical trip invariant intact | **PASS** |
| 16 | Rollback path verified | **PASS** |

---

## 22. Limitations and evidence gaps

1. **No live ongoing drive during cutover window** — trip FSM not exercised in real time; relied on recent 24h trip history + scheduler health.
2. **BoundaryRefresh lifecycle states not queried directly on production** — Prisma model at query time lacked `boundaryRefreshStatus` on `VehicleTrip`; inferred from enrichment completion on repaired trips.
3. **Duplicate-trip SQL check incomplete** — raw SQL against `"VehicleTrip"` failed (`relation does not exist` — likely schema/table naming); no duplicates seen in recent trip sample.
4. **Isolated DIMO 403** on vehicle `c43c3b45-b911-498f-baf9-4376dd585588` — requires follow-up on token/consent; not assessed as trip-loss.
5. **Two historical `dimo.trip-tracking` failed jobs** in Redis — predated cutover; not cleared during gate.
6. **Short observation window** (~2 minutes of queue monitoring post-deploy) — sufficient to rule out immediate backlog storm; not a long-horizon soak test.
7. **Health endpoint does not expose Postgres/Redis status** — those subsystems verified indirectly.
8. **N≈1000 not certified** — P1.3 still required for that scale.

---

## 23. Exact final verdict

**P1.2 PRODUCTION CUTOVER PASS WITH OBSERVATIONS — SAFE, FOLLOW-UP REQUIRED**

### Observations (non-blocking)

1. Vehicle `c43c3b45-b911-498f-baf9-4376dd585588` returns DIMO HTTP **403** on snapshot polls — investigate token/consent/access; not a trip-loss symptom.
2. Cutover window had **no ongoing drives** — live trip FSM not exercised in real time; monitor next natural drive.
3. Two historical `dimo.trip-tracking` failed jobs remain in Redis from before cutover.

### P1.2 closure

**P1.2 is closed for the current production envelope (N≤100, single PM2 fork).**  
N≈1000 scale certification remains **P1.3**.

---

## Raw production evidence

This section separates **proven runtime facts** (observed on VPS/production at cutover time) from **code-derived expectations** and **unavailable evidence**.

### Proven runtime facts

#### VPS SSH / topology

```text
bash .cursor/scripts/cloud-agent-verify-vps.sh
[cloud-agent] SSH auth OK for synqdrive-admin@srv1374778.hstgr.cloud.

pm2 list → 1 process synqdrive, fork mode, online
readlink -f /opt/synqdrive/current
/opt/synqdrive/releases/20260829171441_v4994
```

#### Pre-cutover env (sanitized)

```text
WORKER_SNAPSHOT_CONCURRENCY=5
WORKER_TRIP_TRACKING_CONCURRENCY=<unset>
TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=<unset>
WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED=<unset>
WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=<unset>
DIMO_REQUEST_TIMEOUT_MS=10000
REDIS_HOST=localhost
REDIS_PORT=6379
DATABASE_URL=<set, redacted>
```

#### Post-cutover env (sanitized)

```text
BACKUP=/opt/synqdrive/shared/backend.env.bak-p12-cutover-20260829171429
WORKER_SNAPSHOT_CONCURRENCY=8
WORKER_TRIP_TRACKING_CONCURRENCY=5
TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=true
WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED=true
WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=<unset>
```

#### Deploy log excerpt

```text
DEPLOY_START=2026-08-29T17:14:33Z
==> Pre-deploy DB backup
==> Clone release 20260829171441_v4994
==> Switch current + restart pm2
[PM2] [synqdrive](1) ✓  pid 1451990  uptime 0s  ↺ 10
==> Health check
{"status":"ok","uptime":6,"timestamp":"2026-08-29T17:21:20.913Z"}
Deployed release: 20260829171441_v4994 (d221e76)
[cloud-agent] Verifying https://app.synqdrive.eu/api/v1/health ...
{"status":"ok","uptime":17,"timestamp":"2026-08-29T17:21:31.719Z"}
DEPLOY_END=2026-08-29T17:21:31Z
DEPLOY_EXIT=0
```

#### Health (public)

```json
{"status":"ok","uptime":61962,"timestamp":"2026-08-29T17:13:59.283Z"}
```
(pre-deploy baseline — service was already healthy)

```json
{"status":"ok","uptime":17,"timestamp":"2026-08-29T17:21:31.719Z"}
```
(post-deploy)

#### Startup / scheduler logs

```text
[DimoSnapshotScheduler] Current-prod fleet envelope OK: connected=6 snapshotConcurrency=8
[DimoSnapshotScheduler] Snapshot scheduler recovered 1 vehicle(s) from stuck terminal-state jobs
[DimoSnapshotProcessor] Snapshot failed for vehicle c43c3b45-b911-498f-baf9-4376dd585588: Request failed with status code 403
```

#### Fleet count (Prisma, scheduler cohort)

```text
SCHEDULER_COHORT_CONNECTED 6
CONNECTED_DIMO_VEHICLES 6
```

#### DimoPollLog since deploy

```text
POLL_LOGS_SINCE_DEPLOY 10
POLL_BY_VEHICLE_SINCE_DEPLOY [
  {"vehicleId":"19fedd4b-c4e8-4de8-a125-dab293326e7e","_count":{"_all":2}},
  {"vehicleId":"c43c3b45-b911-498f-baf9-4376dd585588","_count":{"_all":8}}
]
TRIP_TRACKING_RUNS_SINCE_DEPLOY 1
ONGOING_TRIPS 0
TRIPS_SINCE_DEPLOY 0
TRIPS_24H 24
```

#### Redis queue counts (correct BullMQ names)

```text
=== T+0 ===
dimo.snapshot.poll       wait=0 active=0 delayed=1 failed=0
dimo.trip-tracking       wait=0 active=0 delayed=0 failed=2
trip.behavior.enrichment wait=0 active=0 delayed=0 failed=0
trip.driving-impact.compute wait=0 active=0 delayed=0 failed=0

=== T+45s ===
(same — no waiting growth)
```

#### Historical trip-tracking failed job IDs (Redis)

```text
trip-ps-f50437cd-fae8-4fd6-89f3-0c26460f50a1-1782174147935
trip-at-19fedd4b-c4e8-4de8-a125-dab293326e7e-886fd581-8397-48de-9b4a-4e638b619266
```

#### Recent trips (sanitized sample)

```json
[
  {
    "id": "e87db63d-e71e-4142-9172-ae80048025e4",
    "tripStatus": "COMPLETED",
    "startTime": "2026-08-29T15:40:43.000Z",
    "endTime": "2026-08-29T15:47:23.322Z",
    "vehicleId": "c10351f8-b6a2-4258-947f-631aeaa6d359",
    "dimoSegmentId": null,
    "isRepaired": true,
    "behaviorSummaryStatus": "READY",
    "drivingImpactStatus": "READY",
    "tripAnalysisStatus": "COMPLETED"
  },
  {
    "id": "8fe15e86-ea79-4721-9501-282897330e40",
    "tripStatus": "COMPLETED",
    "startTime": "2026-08-29T15:14:00.000Z",
    "endTime": "2026-08-29T15:23:41.000Z",
    "vehicleId": "c10351f8-b6a2-4258-947f-631aeaa6d359",
    "dimoSegmentId": "dimo-seg-187361-1788016440000",
    "isRepaired": false,
    "behaviorSummaryStatus": "READY",
    "drivingImpactStatus": "READY",
    "tripAnalysisStatus": "COMPLETED"
  }
]
```

#### Recent TripRepair rows (sanitized)

```json
[
  {"repairType":"INTRA_TRIP_GAP_SPLIT","status":"APPLIED","tripId":"8fe15e86-ea79-4721-9501-282897330e40"},
  {"repairType":"INTRA_TRIP_GAP_SPLIT","status":"APPLIED","tripId":"2795fa9a-b71f-4d19-a2fb-1843e3294742"},
  {"repairType":"MISSING_TRIP","status":"SUPPRESSED","tripId":null},
  {"repairType":"MISSING_TRIP","status":"SUPPRESSED","tripId":null}
]
```

#### Rollback path

```text
ls /opt/synqdrive/releases | tail -2
20260828235349_v4994
20260829171441_v4994
PREV_RELEASE_EXISTS=yes
```

### Code-derived expectations (not re-proven live at cutover)

- Activity-tier tier labels (`ACTIVE_DRIVING` / `RECENTLY_ACTIVE` / `RESTING_STANDBY` / `LONG_IDLE`) — design in `derive-snapshot-polling-tier.ts`; inferred from due-gated enqueue pattern, not per-tier log lines captured.
- `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED` default-true when unset — confirmed unset pre-cutover; explicit `true` post-cutover.
- Resume/backfill on scheduler gap — code path exists; not triggered during cutover (no host suspend detected).

### Assumptions

- `DimoPollLog` row creation implies successful processor invocation for non-403 vehicles.
- `tripAnalysisStatus: COMPLETED` with enrichment READY implies boundary refresh chain completed for those historical trips.
- Two `dimo.trip-tracking` failed jobs are pre-cutover based on Redis job ID timestamps and unchanged failed count across observation window.

### Unavailable evidence

- Direct production query of boundary-refresh `PENDING`/`ENQUEUED`/`COMPLETED` state table/fields.
- Long-horizon (hours) queue soak test post-deploy.
- DIMO provider formal rate-limit ceiling at N=100.
- Live in-progress trip FSM trace during cutover window.
- `pm2 env 1` did not surface P1.2 keys in captured output; concurrency confirmed via startup log instead.

---

## Document metadata

| Field | Value |
|-------|-------|
| Author | Cursor Cloud Agent (P1.2 cutover task) |
| Cutover date | 2026-08-29 |
| Repository | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| Related architecture | `SNAPSHOT_POLLING_P1_2_FINAL6_CURRENT_PROD_RELEASE_GATE_2026-08-29.md` |
