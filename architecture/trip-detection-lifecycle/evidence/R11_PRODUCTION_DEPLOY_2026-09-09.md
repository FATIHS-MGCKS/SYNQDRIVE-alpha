# R11 Production Deployment — Post-Deploy Evidence (read-only capture + deploy audit)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EV-R11-PROD-DEPLOY-001 |
| **Observed at (UTC)** | 2026-09-09T02:41:23Z – 2026-09-09T02:52:38Z |
| **CI_ADMISSION_MODE** | **TREE_EQUIVALENT_CI_SUCCESS** |
| **REQUESTED_SHA** | `f7eb94cb5228a341becd346f9d5f7448345d2ad0` |
| **TARGET_TREE** | `4a4b4be52acbab6d9fbf2ab6ee322e0d8c0afae9` |
| **DEPLOYED_SHA** | `f7eb94cb5228a341becd346f9d5f7448345d2ad0` (verified release `.git/HEAD`) |
| **DEPLOYED_RELEASE** | `/opt/synqdrive/releases/20260909024150_v4994` |
| **Previous release (rollback target)** | `/opt/synqdrive/releases/20260908172927_v4994` @ `68495041974135f7c6565fd5b836b3e2f9176fae` |
| **origin/main at deploy time** | `0b91dcd96f68164282a38458242fe8489e0b3b82` — **intentionally NOT deployed** |
| **Deploy path** | `CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 CLOUD_AGENT_REQUESTED_DEPLOY_SHA=f7eb94cb… bash .cursor/scripts/cloud-agent-deploy.sh` |
| **Epistemic** | CONFIRMED (deploy + post-deploy probes) |
| **Decision status** | TDL-DEC-R11-001 remains **PROPOSED** — **DEPLOYED / POST_DEPLOY_HEALTH_CONFIRMED** only; **not PRODUCTION_VALIDATED** |

## Frozen historical main deployment (intentional)

`origin/main` at deploy time was **ahead** of `TARGET_SHA` (later commits such as #1585/#1586 excluded).

**Frozen historical main deployment selected intentionally for isolated R11 natural-drive acceptance; later unrelated main commits excluded.**

Runtime content = #1584 R11 merge (`32526c95a`) + #1583 documentation authority (`f7eb94cb`); tree identical to CI commit `4f1f69a`.

---

## Gate 1A — Tree equivalence (Git)

```bash
git rev-parse f7eb94cb5228a341becd346f9d5f7448345d2ad0^{tree}
# → 4a4b4be52acbab6d9fbf2ab6ee322e0d8c0afae9

git rev-parse 4f1f69a33795ee99a638b217634f9f487cd63941^{tree}
# → 4a4b4be52acbab6d9fbf2ab6ee322e0d8c0afae9

git diff --exit-code 4f1f69a33795ee99a638b217634f9f487cd63941 f7eb94cb5228a341becd346f9d5f7448345d2ad0
# → exit 0 (complete repository tree equality)
```

| Field | Value |
|-------|-------|
| TARGET_SHA | `f7eb94cb5228a341becd346f9d5f7448345d2ad0` |
| TARGET_TREE | `4a4b4be52acbab6d9fbf2ab6ee322e0d8c0afae9` |
| CI_SHA | `4f1f69a33795ee99a638b217634f9f487cd63941` |
| CI_TREE | `4a4b4be52acbab6d9fbf2ab6ee322e0d8c0afae9` |
| R11 runtime ancestor (#1584) | `32526c95a6ae6fae930fd048072dccfc19b30516` |

---

## Gate 1B — CI equivalence

| Field | Value |
|-------|-------|
| **TRIP_FSM_CI_RUN** | **34302677308** |
| **Workflow** | Trip FSM — Production Readiness CI |
| **Event** | `pull_request` (#1583) |
| **headSha** | `4f1f69a33795ee99a638b217634f9f487cd63941` |
| **Result** | **success** |

| Job | Result |
|-----|--------|
| Install (lockfile) | success |
| Backend R11 unit + scaling probe | success |
| Backend R11 postgres+redis integration | success |
| Backend R10 unit tests | success |
| Backend trip finalize PostgreSQL integration | success |
| CI gate (Trip FSM critical jobs) | success |

**Push run on TARGET_SHA (cancelled — not a test failure):**

| Run | Result | Reason |
|-----|--------|--------|
| 34303332173 | **cancelled** | GitHub Actions concurrency: superseded by higher-priority `trip-fsm-ci-refs/heads/main` (#1586 push) |

**Workflow materiality @ TARGET_SHA:** jobs `checkout@v4` + `npm ci` + test commands — behavioral result depends on **checked-out tree**, not commit metadata, PR vs push event, or branch name. **No invalidating metadata dependency identified.**

Module registry governance @ TARGET_SHA push: run **34303332093** — success.

---

## Gate 2 — Deploy source isolation

| Check | Result |
|-------|--------|
| Agent workspace `git status --porcelain` | **clean** (0 entries) |
| VPS release builder | Fresh `git fetch --depth 1 origin f7eb94cb…`; `ACTUAL == REQUESTED_SHA` verified |
| Dirty workspace packaged | **NO** — deploy independent of agent working tree |

---

## Gate 3 — Pre-deploy baseline (@ 2026-09-09T02:41:23Z)

| Observation | Value |
|-------------|-------|
| Release | `/opt/synqdrive/releases/20260908172927_v4994` |
| SHA | `68495041974135f7c6565fd5b836b3e2f9176fae` |
| Replica A | `synqdrive` pid 170515, port 3001, health OK |
| Replica B | `synqdrive-b` pid 170770, port 3002, health OK |
| Scheduler | A **LEADER**, B **FOLLOWER**, leaders=1 |
| FSM | 6× **RESTING**, **0** ONGOING |

---

## Standard deploy artifacts

| Item | Value |
|------|-------|
| DB backup | `/opt/synqdrive/shared/backups/db-pre-deploy-20260909024150.sql.gz` (~65 MB) |
| Prisma migrate | `No pending migrations to apply.` (337 migrations) |
| Config changes | NONE (symlinked shared env only) |
| Deploy state | `/opt/synqdrive/shared/deploy-state/last-deploy-state.env` @ `2026-09-09T02:51:47Z` |
| PM2 pre-deploy dump | `/opt/synqdrive/shared/deploy-state/pm2-pre-deploy-20260909025147.dump` |

---

## Rolling two-replica deploy

Procedure: `vps_replica_rolling_deploy` — restart A → verify → restart B → verify; scheduler convergence gate; external health.

| Event (UTC) | Detail |
|-------------|--------|
| 02:42:04 | Pre-deploy DB backup begins (release build phase) |
| 02:51:47 | Deploy state captured; `PREVIOUS_SHA=684950419…` |
| 02:51:47 | `synqdrive` (A) restart begins |
| 02:51:56 | A healthy on TARGET_SHA (port 3001, sha=true, uptime ~8s) |
| 02:51:56 | `synqdrive-b` (B) restart begins |
| 02:52:05 | B healthy on TARGET_SHA (port 3002, sha=true, uptime ~8s) |
| 02:52:06 | SHA invariant OK — both replicas on `f7eb94cb…` |
| 02:52:06–02:52:13 | Scheduler convergence: transient 0 leaders → **LEADER/FOLLOWER**, leaders=1 |
| 02:52:13 | External health PASS `https://app.synqdrive.eu/api/v1/health` |

**Mixed-version window (documented):** approx. **02:51:47–02:52:05 UTC** (~**18 s**) — after A restart, B still ran pre-R11 code (`684950419…`) until B restart completed. Cannot claim zero old-worker job processing during this interval.

---

## Post-deploy verification (@ 2026-09-09T02:52:37Z)

### Replica A / synqdrive / port 3001

| Check | Result |
|-------|--------|
| PM2 status | online |
| PID | 296834 |
| Uptime | ~50s |
| exec cwd | `/opt/synqdrive/current/backend` → `…/20260909024150_v4994/backend` |
| script path | `/opt/synqdrive/current/backend/dist/src/main.js` |
| Local health | HTTP 200 |
| Release SHA | `f7eb94cb5228a341becd346f9d5f7448345d2ad0` |
| Scheduler role | **LEADER** |

### Replica B / synqdrive-b / port 3002

| Check | Result |
|-------|--------|
| PM2 status | online |
| PID | 297087 |
| Uptime | ~41s |
| exec cwd | `/opt/synqdrive/current/backend` |
| Local health | HTTP 200 |
| Release SHA | `f7eb94cb5228a341becd346f9d5f7448345d2ad0` |
| Scheduler role | **FOLLOWER** |

### Topology

| Check | Result |
|-------|--------|
| `current` symlink | `…/20260909024150_v4994` |
| Backend main.js PIDs | **2 only** — both under target release |
| nginx upstream | `127.0.0.1:3001` + `127.0.0.1:3002` |
| Public health | HTTP 200 |
| Rollback required | **NO** |

---

## R11 deployed-code identity (dist grep — not behavior proof)

Classification: **DEPLOYED** + **CI_VALIDATED** — **not** **PRODUCTION_BEHAVIOR_VALIDATED**.

| Symbol / artifact | Files in release dist |
|-------------------|----------------------:|
| `resolveProviderOperationalAnchor` | 3 |
| `resolveIdleStopBoundaryAt` | 3 |
| `computeEmptyCoreBackoffMs` | 3 |
| `trip-fetch-outcome` (fetch taxonomy) | present |
| `pauseDetectedAt` | 3 |
| `stopBoundaryAt` / boundary filter (orchestration + helpers) | 12 files reference |
| `trip-fsm-evidence-state` | 3 |
| `evaluateEndCycleJobAdmission` (R10 guard) | 3 |

Pre-R11 release correctly showed **0** for R11 symbols; post-deploy confirms promotion.

**Not activated (confirmed unchanged):** PD-2 LOW candidacy; default 45 s positive TTL; Ignition-OFF DIMO webhook trigger.

---

## Scheduler / queue convergence

| Check | Result |
|-------|--------|
| Leader count | **1** (A LEADER, B FOLLOWER) |
| Redis lease holder | `6dbb00b5-6bc1-42a7-8279-ae9afb2e254b` (unchanged instance id post-convergence) |
| A leaseRemainingMs | ~25s @ probe |
| BullMQ `dimo.snapshot.poll` | wait=0 active=0 failed=0 delayed=0 |
| BullMQ `dimo.trip-tracking` | wait=0 active=0 failed=0 delayed=0 |
| BullMQ `snapshot.wake.handoff` | wait=0 active=0 failed=0 delayed=0 |
| FSM post-deploy | 6× RESTING, **0** ONGOING |

---

## Post-deploy observation window (Gate 8)

| Class | Detail |
|-------|--------|
| Trip FSM / R11 new exceptions | **None** in immediate post-deploy grep |
| BullMQ / Prisma / Redis bootstrap | **None** observed |
| **Known pre-existing (separated)** | `DimoAuthService` 403 for tokenId **190497** (FORMER_FLEET_VEHICLE) — present before and after deploy; **not** attributed to R11 |
| PM2 restart loops | **None** — both replicas stable |

---

## Natural-drive T0 — KS MX 2024 (`tokenId 187336`) @ 2026-09-09T02:52:37Z

**Post-R11 deploy T0** (replaces pre-R10 STOP-report baseline).

| Field | Value |
|-------|-------|
| **vehicle_id** | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| **label** | KS MX 2024 |
| **dimo_token_id** | 187336 |
| **FSM state** | **RESTING** |
| **active_trip_id** | null |
| **fsm_updated_at** | 2026-09-08 06:15:36 UTC |
| **Latest trip** | `179fd9bc…` **COMPLETED** 2026-09-08 04:51:36–05:02:15 UTC |
| **VLS source_timestamp** | 2026-09-08 05:02:15 UTC |
| **VLS speed / ignition / load** | 0 / false / ~9.02 |
| **VLS updated_at** | 2026-09-09 02:48:08 UTC |
| **R9 trigger registration** | Unchanged from prior canary evidence (5/5 cohort); not re-mutated this deploy |
| **Wake mailbox (Redis scan)** | No vehicle-specific keys visible @ T0 |
| **Scheduler @ T0** | A **LEADER**, B **FOLLOWER** |
| **Fleet ONGOING trips** | **0** |

**Expected start condition for physical test:** RESTING, `activeTripId=null`, no unrelated ONGOING trip — **SATISFIED**.

---

## Explicit non-claims

- **NOT** `PRODUCTION_VALIDATED` / **NOT** `PRODUCTION_BEHAVIOR_VALIDATED` for TDL-DEC-R11-001
- **NOT** natural-drive proof for R9 wake, trip start, pause, resume, or regular finalize
- **NOT** zero mixed-version processing during rolling window
- **NOT** deployment of current `origin/main` head
- No trip repair, backfill, or telemetry mutation performed

---

## Next gate

Physical drive on KS MX 2024 (tokenId 187336) with five **separate** validation axes:

1. R9 wake-up  
2. Trip start  
3. Motor-off short pause (~70–90 s, same trip)  
4. Resume (same tripId)  
5. Regular trip end / finalize (not STALE_ONGOING repair)

Cross-replica webhook/job attribution required where logs expose it.
