# P1.2 Post-Merge Production Cutover — 2026-08-29

Production verification and cutover record for PR #1409 (activity-tier snapshot polling + canonical partial-trip boundary repair).

## Merge / deploy identity

| Field | Value |
|-------|-------|
| PR | #1409 (merged) |
| Merge commit | `d221e766374dea2360b2e19636504882d5d662ce` |
| Prior PR HEAD | `f9dde7fed940e2cf38265f469aa43e7c92a78ff4` |
| Deployed release | `20260829171441_v4994` |
| Deployed SHA | `d221e766374dea2360b2e19636504882d5d662ce` |
| Previous production SHA | `ea65d8b7079ff4948c8e16a70952a9b151c2211b` |
| Deploy start (UTC) | `2026-08-29T17:14:33Z` |
| Deploy end (UTC) | `2026-08-29T17:21:31Z` |
| PM2 restart gap observed | ~6s to local `/health` OK; public health OK at T+17s |

## Production topology (reconfirmed)

| Item | Observed |
|------|----------|
| PM2 processes | **1** (`synqdrive`) |
| PM2 mode | **fork** (`exec_mode: fork_mode`) |
| API + workers + schedulers | Colocated in single NestJS process |
| Production replicas | **1** |
| Redis | `localhost:6379` (single instance) |
| PostgreSQL | Operational (Prisma queries succeeded) |
| Dual scheduler during deploy | **No** — `pm2 restart synqdrive --update-env` |

## Sanitized production env (P1.2 certified)

Env file: `/opt/synqdrive/shared/backend.env` (backup: `backend.env.bak-p12-cutover-20260829171429`)

| Variable | Value |
|----------|-------|
| `WORKER_SNAPSHOT_CONCURRENCY` | **8** (updated from 5 pre-cutover) |
| `WORKER_TRIP_TRACKING_CONCURRENCY` | **5** |
| `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED` | **true** |
| `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED` | **true** |
| `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE` | **unset** (not accidentally true) |
| `DIMO_REQUEST_TIMEOUT_MS` | **10000** |
| `WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK` | unset (unlimited) |
| `WORKER_FAST_RECONCILIATION_MAX_VEHICLES_PER_RUN` | unset (unlimited) |

Runtime confirmation: startup log `Current-prod fleet envelope OK: connected=6 snapshotConcurrency=8`.

## Certified operating envelope

| Constant | Value |
|----------|-------|
| `CURRENT_PROD_REPLICAS` | 1 |
| `PM2_MODE` | fork |
| `MAX_CERTIFIED_CONNECTED_VEHICLES` | **100** |
| Observed CONNECTED cohort (scheduler) | **6** |

N≈1000 remains **NOT CERTIFIED** — P1.3 required.

## Health

- `https://app.synqdrive.eu/api/v1/health` → `{"status":"ok",...}`
- PM2 `synqdrive` online after deploy; no restart loop (`unstable restarts: 0` post-restart)

## Queue / backpressure evidence (post-deploy observation window ~2 min)

| Queue | waiting | active | delayed | failed |
|-------|---------|--------|---------|--------|
| `dimo.snapshot.poll` | 0 | 0 | 1 | 0 |
| `dimo.trip-tracking` | 0 | 0 | 0 | 2 (pre-existing historical) |
| `trip.behavior.enrichment` | 0 | 0 | 0 | 0 |
| `trip.driving-impact.compute` | 0 | 0 | 0 | 0 |

No sustained backlog growth observed (`waiting=0` throughout window).

## Snapshot polling runtime evidence

- `DimoSnapshotScheduler` tick at `17:21:49Z`: fleet envelope OK, `connected=6`, `snapshotConcurrency=8`
- `DimoPollLog` rows since deploy: **10** (vehicles `19fedd4b…` ×2, `c43c3b45…` ×8)
- Stuck-job recovery active: `Snapshot scheduler recovered 1 vehicle(s) from stuck terminal-state jobs`
- Activity-tier gating active (not legacy O(N) every-tick): only due vehicles enqueued per poll evidence

## Provider / DIMO evidence

- **No** HTTP 429 burst
- **No** timeout storm since deploy
- **Isolated 403** on vehicle `c43c3b45-b911-498f-baf9-4376dd585588` (repeated snapshot WARN) — vehicle-specific auth/access; other connected vehicles polling normally

## Trip / reconciliation / boundary-repair evidence

| Check | Result |
|-------|--------|
| CONNECTED scheduler cohort | 6 |
| Trips last 24h | 24 |
| Ongoing trips at cutover | 0 |
| Trips created since deploy (T+2m) | 0 (fleet idle — no active driving) |
| Trip tracking runs since deploy | 1 |
| Recent repaired trips with enrichment READY | Yes (`isRepaired=true`, `behaviorSummaryStatus=READY`, `drivingImpactStatus=READY`) |
| Recent `TripRepair` rows | `INTRA_TRIP_GAP_SPLIT` APPLIED; `MISSING_TRIP` SUPPRESSED (expected containment) |
| Duplicate canonical trips (7d) | None observed in recent trip sample |

**Limitation:** No live ongoing drive during cutover window; trip-detection smoke relies on recent production trip history + post-deploy scheduler/queue health.

## Post-deploy regression (non-destructive)

| Suite | Result |
|-------|--------|
| GitHub CI on `d221e766` (main) | **SUCCESS** (25 checks) |
| `npm run test:p12:scale` (local, merged main) | **112/112 PASS** |
| Production DB destructive tests | **Not run** |

## Rollback procedure (verified, not executed)

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

Previous release `20260828235349_v4994` confirmed present on VPS.

## Acceptance matrix

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
| 15 | One physical drive → one canonical trip | **PASS** |
| 16 | Rollback path verified | **PASS** |

## Final verdict

**P1.2 PRODUCTION CUTOVER PASS WITH OBSERVATIONS — SAFE, FOLLOW-UP REQUIRED**

### Observations (non-blocking)

1. Vehicle `c43c3b45-b911-498f-baf9-4376dd585588` returns DIMO HTTP 403 on snapshot polls — investigate token/consent/access; not a trip-loss symptom.
2. Cutover window had **no ongoing drives** — live trip FSM not exercised in real time; monitor next natural drive.
3. Two historical `dimo.trip-tracking` failed jobs remain in Redis from before cutover.

### P1.2 closure

P1.2 is **closed for current production envelope (N≤100, single PM2 fork)**. N≈1000 scale certification remains **P1.3**.
