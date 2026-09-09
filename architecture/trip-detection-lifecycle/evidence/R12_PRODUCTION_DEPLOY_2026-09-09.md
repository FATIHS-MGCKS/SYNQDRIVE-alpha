# R12 Production Deployment — Post-Deploy Evidence (read-only capture + deploy audit)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EV-R12-PROD-DEPLOY-001 |
| **Observed at (UTC)** | 2026-09-09T19:08:29Z – 2026-09-09T19:26:03Z |
| **CI_ADMISSION_MODE** | **TREE_EQUIVALENT_CI_SUCCESS** |
| **REQUESTED_SHA** | `157b3c72226869e4e35d1a9398b78cab50d3fa54` |
| **CI_HEAD** | `0ebf248c0896b1ea0a853d2e20a3e3dfdf593717` |
| **TARGET_TREE / CI_TREE** | `1ecf42f155bafb3748655a64b2bc0556cc106603` |
| **FINAL_TRIP_FSM_CI_RUN** | **34387586390** — **success** |
| **DEPLOYED_SHA** | `157b3c72226869e4e35d1a9398b78cab50d3fa54` (verified release `.git/HEAD` + deploy script SHA invariant) |
| **DEPLOYED_RELEASE** | `/opt/synqdrive/releases/20260909190912_v4994` |
| **Previous release (rollback target)** | `/opt/synqdrive/releases/20260909024150_v4994` @ `f7eb94cb5228a341becd346f9d5f7448345d2ad0` |
| **Deploy path** | `CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 CLOUD_AGENT_REQUESTED_DEPLOY_SHA=157b3c72226869e4e35d1a9398b78cab50d3fa54 bash .cursor/scripts/cloud-agent-deploy.sh` |
| **Epistemic** | CONFIRMED (deploy + post-deploy probes) |
| **Decision status** | TDL-DEC-R12-001 — **DEPLOYED / CI_VALIDATED / POST_DEPLOY_HEALTH_CONFIRMED** only; **NOT PRODUCTION_BEHAVIOR_VALIDATED** |

## Classification matrix (mandatory separation)

| Label | Status |
|-------|--------|
| **CI_VALIDATED** | YES — run 34387586390 @ `0ebf248c0`, tree-equivalent to TARGET_SHA |
| **DEPLOYED** | YES — both replicas on TARGET_SHA @ `20260909190912_v4994` |
| **POST_DEPLOY_HEALTH_CONFIRMED** | YES — local 3001/3002 + public health 200; scheduler leaders=1; no rollback |
| **PRODUCTION_BEHAVIOR_VALIDATED** | **NO** — natural-drive acceptance not performed in this workstream |

---

## Gate 1 — TARGET / CI identity

```bash
git rev-parse 157b3c72226869e4e35d1a9398b78cab50d3fa54^{tree}
# → 1ecf42f155bafb3748655a64b2bc0556cc106603

git rev-parse 0ebf248c0896b1ea0a853d2e20a3e3dfdf593717^{tree}
# → 1ecf42f155bafb3748655a64b2bc0556cc106603

git diff --exit-code 0ebf248c0896b1ea0a853d2e20a3e3dfdf593717 157b3c72226869e4e35d1a9398b78cab50d3fa54
# → exit 0 (complete repository tree equality)
```

| Field | Value |
|-------|-------|
| TARGET_SHA | `157b3c72226869e4e35d1a9398b78cab50d3fa54` |
| CI_HEAD | `0ebf248c0896b1ea0a853d2e20a3e3dfdf593717` |
| TARGET_TREE | `1ecf42f155bafb3748655a64b2bc0556cc106603` |
| CI_TREE | `1ecf42f155bafb3748655a64b2bc0556cc106603` |
| TREE_EQUIVALENT | **YES** |
| FINAL_CI_RUN_ID | **34387586390** |
| CI_SUCCESS | **YES** |

### Gate 1B — CI job results (Trip FSM — Production Readiness CI)

| Job | Result |
|-----|--------|
| Install (lockfile) | success |
| Backend R11 unit + scaling probe | success |
| Backend R11 postgres+redis integration | success |
| Backend trip finalize PostgreSQL integration | success |
| Backend R10 unit tests | success |
| CI gate (Trip FSM critical jobs) | success |

---

## Gate 2 — Pre-deploy baseline (@ 2026-09-09T19:08:29Z)

| Observation | Value |
|-------------|-------|
| Release | `/opt/synqdrive/releases/20260909024150_v4994` |
| SHA | `f7eb94cb5228a341becd346f9d5f7448345d2ad0` |
| Replica A | `synqdrive` pid 296834, port 3001, health OK |
| Replica B | `synqdrive-b` pid 297087, port 3002, health OK |
| Scheduler | A **LEADER**, B **FOLLOWER**, leaders=1 |
| Redis lease holder | `1b8f6361-e777-44bf-98b3-7e816c47ca3a` |
| FSM | RESTING=5, ACTIVE_TRIP=1 |
| ONGOING trips | **1** |
| BullMQ `dimo.snapshot.poll` | delayed=1 |
| BullMQ `dimo.trip-tracking` | delayed=1, failed=2 |
| BullMQ `snapshot.wake.handoff` | clean |
| nginx upstream | `127.0.0.1:3001` + `127.0.0.1:3002` |
| Prisma | 337 migrations, schema up to date |

### Pre-deploy T0 — KS MS 661 (`tokenId 187361`, vehicle `c10351f8-b6a2-4258-947f-631aeaa6d359`)

| Field | Value |
|-------|-------|
| FSM state | **RESTING** |
| activeTripId | **null** |
| Latest trip | COMPLETED (ended 2026-09-09T17:12:29Z) |
| stopBoundary fields | absent |
| VLS | stationary, ignition OFF |

---

## Gate 3 — Exact SHA deploy

| Item | Value |
|------|-------|
| DB backup | `/opt/synqdrive/shared/backups/db-pre-deploy-20260909190912.sql.gz` (~63 MB) |
| Prisma migrate | `No pending migrations to apply.` (337 migrations) |
| Release builder | Fresh `git fetch --depth 1 origin 157b3c722268…`; **ACTUAL == REQUESTED_SHA** verified |
| Deploy state | `/opt/synqdrive/shared/deploy-state/last-deploy-state.env` @ `2026-09-09T19:20:38Z` |
| PM2 pre-deploy dump | `/opt/synqdrive/shared/deploy-state/pm2-pre-deploy-20260909192038.dump` |
| Config changes | NONE (symlinked shared env only) |

---

## Gate 4 — Rolling two-replica deploy

Procedure: `vps_replica_rolling_deploy` — restart A → verify → restart B → verify; scheduler convergence gate; external health.

| Event (UTC) | Detail |
|-------------|--------|
| 19:09:12 | Release build begins (`20260909190912_v4994`) |
| 19:20:38 | Deploy state captured; `PREVIOUS_SHA=f7eb94cb…` |
| 19:20:39 | `synqdrive` (A) restart begins |
| 19:20:47 | A healthy on TARGET_SHA (port 3001, sha=true, uptime ~8s) |
| 19:20:47 | `synqdrive-b` (B) restart begins (B still on R11 until restart) |
| 19:20:53 | B healthy on TARGET_SHA (port 3002, sha=true, uptime ~5s) |
| 19:20:55 | SHA invariant OK — both replicas on `157b3c722268…` |
| 19:20:55–19:21:10 | Scheduler convergence: transient 0 leaders → **LEADER/FOLLOWER**, leaders=1 |
| 19:21:10 | External health PASS `https://app.synqdrive.eu/api/v1/health` |
| 19:21:22 | Cloud-agent health verification PASS |

**Mixed-version window (documented):** approx. **19:20:39–19:20:53 UTC** (~**14 s**) — after A restart onto R12, B continued on R11 (`f7eb94cb…`) until B restart completed. Cannot claim zero old-worker job processing during this interval.

---

## Gate 5 — Release identity (@ 2026-09-09T19:26:03Z post-probe)

### Replica A / synqdrive / port 3001

| Check | Result |
|-------|--------|
| PM2 status | online |
| PID | 493373 |
| exec cwd | `/opt/synqdrive/releases/20260909190912_v4994/backend` |
| script path | `/opt/synqdrive/current/backend/dist/src/main.js` |
| Local health | HTTP 200 |
| Release SHA | `157b3c72226869e4e35d1a9398b78cab50d3fa54` |
| Scheduler role | **LEADER** (leadership acquired 19:21:06, owner `srv1374778:493373:7dbb4952`) |

### Replica B / synqdrive-b / port 3002

| Check | Result |
|-------|--------|
| PM2 status | online |
| PID | 493626 |
| exec cwd | `/opt/synqdrive/releases/20260909190912_v4994/backend` |
| Local health | HTTP 200 |
| Release SHA | `157b3c72226869e4e35d1a9398b78cab50d3fa54` |
| Scheduler role | **FOLLOWER** (no leadership acquired post-deploy) |

### Topology

| Check | Result |
|-------|--------|
| `current` symlink | `…/20260909190912_v4994` |
| Backend main.js PIDs | **2 only** — both under target release |
| nginx upstream | `127.0.0.1:3001` + `127.0.0.1:3002` |
| Public health | HTTP 200 |
| Rollback required | **NO** |

---

## Gate 6 — Scheduler / queue convergence

| Check | Result |
|-------|--------|
| Leader count | **1** (A LEADER, B FOLLOWER) |
| Redis lease key | `synqdrive:scheduler:leader` |
| Lease holder @ probe | `8a1f34d6-73c5-4002-87ab-4aa0f727d5b5` |
| Lease remaining @ probe | ~23s |
| BullMQ `dimo.snapshot.poll` | wait=0 active=0 delayed=0 failed=1 |
| BullMQ `dimo.trip-tracking` | wait=0 active=0 delayed=2 failed=2 |
| BullMQ `snapshot.wake.handoff` | wait=0 active=0 delayed=0 failed=0 |
| FSM post-deploy | RESTING=4, ACTIVE_TRIP=1, POSSIBLE_END=1 |
| ONGOING trips | **2** |

**Queue note:** failed/delayed counts on snapshot/trip-tracking queues are consistent with pre-deploy baseline; no post-deploy retry storm or growing delayed backlog observed in immediate probe window.

---

## Gate 7 — R12 deployed-code identity (dist grep — not behavior proof)

Classification: **DEPLOYED** + **CI_VALIDATED** — **not** **PRODUCTION_BEHAVIOR_VALIDATED**.

| Symbol / artifact | Files in release dist |
|-------------------|----------------------:|
| `StopBoundaryClockAuthority` | 3 |
| `readStopBoundaryProvenance` | 3 |
| `priorTrustedStopBoundaryAt` | 1 |
| `trustedBoundaryEstablishedThisTick` | 1 |
| `resolveProviderStopBoundaryCandidate` | 3 |
| `mergeProviderStopBoundaryCandidate` | 3 |
| `retireActiveStopBoundaryAfterMovement` | 3 |
| `assessBoundaryBackedEmptyCoreSilence` | 2 |

Pre-R12 release (R11) showed **0** for R12-specific symbols; post-deploy confirms promotion.

---

## Gate 8 — Error / stability probe (immediate post-deploy)

| Class | Detail |
|-------|--------|
| **A. NEW R12 / Trip FSM errors** | **None** in post-deploy grep window (19:20–19:26 UTC) |
| **B. Prisma / Redis / BullMQ bootstrap** | **None** observed |
| **C. PM2 restart loops** | **None** — both replicas stable post-deploy |
| **D. Known pre-existing (separated)** | ClickHouse schema checksum mismatch (001–003) on both replicas at boot — present before R12; **not** attributed to R12. BatteryV2 `LOCK_CONTENTION` on KS MS 661 vehicle — pre-existing. DimoAuth 403 for tokenId 190497 — pre-existing. Snapshot scheduler stuck-job recovery LOG lines — operational, not new Trip FSM fault |

---

## Gate 9 — KS MS 661 physical-test T0 (@ 2026-09-09T19:26:03Z)

**Post-R12 deploy T0** (read-only; no mutations).

| Field | Value |
|-------|-------|
| **vehicle_id** | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| **label** | Audi A4 (KS MS 661) |
| **dimo_token_id** | 187361 |
| **FSM state** | **ACTIVE_TRIP** |
| **active_trip_id** | `e62c964d-c020-4245-a191-67ae2e0fbdf3` |
| **fsm_updated_at** | 2026-09-09T19:24:46.769Z |
| **Latest trip** | `e62c964d…` **ONGOING** start 2026-09-09T19:09:00Z; row shows `end_time` 2026-09-09T19:19:37.118Z (lifecycle inconsistency — not repaired in this workstream) |
| **stopBoundaryAt** | **null** (not present in `lastEvidenceSummary` @ T0) |
| **stopBoundarySource / ClockAuthority / Trust** | absent |
| **pauseDetectedAt / lastPauseBoundaryAt** | absent |
| **VLS source_timestamp** | 2026-09-09T19:19:05Z |
| **VLS speed / ignition / load** | 0 / false / ~37.25 |
| **VLS updated_at** | 2026-09-09T19:25:16.762Z |
| **Scheduler @ T0** | A **LEADER**, B **FOLLOWER** |
| **Fleet ONGOING trips** | **2** |

### PHYSICAL_TEST_READY

**NO**

**Blockers:**

1. KS MS 661 FSM is **ACTIVE_TRIP** with active trip `e62c964d…` — not RESTING / null activeTripId.
2. Trip started **2026-09-09T19:09:00Z** (after pre-deploy T0 @ 19:08 but before deploy completion @ 19:21) — natural fleet activity, not manufactured baseline.
3. Fleet has **2** ONGOING trips and **1** POSSIBLE_END FSM row — not a clean single-vehicle isolated baseline.

**Do not manufacture baseline** — wait for natural trip completion or authorized repair in a separate workstream before R12 natural-drive acceptance.

---

## Explicit non-claims

- **NOT** `PRODUCTION_BEHAVIOR_VALIDATED` for TDL-DEC-R12-001
- **NOT** natural-drive proof for R12 stop-boundary clock authority, boundary-backed silence, or post-boundary movement end liveness
- **NOT** zero mixed-version processing during rolling window
- **NOT** deployment of current `origin/main` head if it advances beyond TARGET_SHA
- No trip repair, backfill, telemetry mutation, or physical drive performed in this workstream
- R11 historical failure evidence ([KS_MS_661_R11_NATURAL_DRIVE_2026-09-09.md](KS_MS_661_R11_NATURAL_DRIVE_2026-09-09.md)) **unchanged**

---

## Next gate

Physical natural-drive on KS MS 661 (tokenId 187361) after **PHYSICAL_TEST_READY = YES**:

1. Clean RESTING T0 with `activeTripId=null`
2. Trip start under R12
3. Motor-off short pause (~70–90 s, same trip)
4. Resume (same tripId)
5. Regular trip end / finalize via R12 boundary-backed path (not STALE_ONGOING repair)

Cross-replica webhook/job attribution required where logs expose it.
