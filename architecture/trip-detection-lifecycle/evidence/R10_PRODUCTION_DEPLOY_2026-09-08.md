# R10 Production Deployment — Post-Deploy Evidence (read-only capture + deploy audit)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EV-R10-PROD-DEPLOY-001 |
| **Observed at (UTC)** | 2026-09-08T17:29:27Z – 2026-09-08T17:49:20Z |
| **REQUESTED_SHA** | `68495041974135f7c6565fd5b836b3e2f9176fae` |
| **DEPLOYED_SHA** | `68495041974135f7c6565fd5b836b3e2f9176fae` (verified release `.git/HEAD`) |
| **DEPLOYED_RELEASE** | `/opt/synqdrive/releases/20260908172927_v4994` |
| **Previous release (rollback target for this deploy)** | `/opt/synqdrive/releases/20260908045043_v4994` @ `7b9a785710fdb4b2c620514de2e8afc0923a5b6a` |
| **Deploy path** | `CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 CLOUD_AGENT_REQUESTED_DEPLOY_SHA=684950419… bash .cursor/scripts/cloud-agent-deploy.sh` |
| **Epistemic** | CONFIRMED (deploy + post-deploy probes) |
| **Decision status** | TDL-DEC-R10-001/002 remain **PROPOSED** — deploy ≠ natural-drive validation |

## CI preconditions (@ TARGET_SHA)

| Check | Run | Result |
|-------|-----|--------|
| Trip FSM CI | 34253786668 | success — 81 R10 unit tests; postgres A–D 4 passed |
| Vehicle Detail CI | 34253786817 | success |
| Legal Documents CI | 34253786646 | success (completed after preflight) |

## Standard deploy artifacts

| Item | Value |
|------|-------|
| DB backup | `/opt/synqdrive/shared/backups/db-pre-deploy-20260908172927.sql.gz` |
| Prisma migrate | `No pending migrations to apply.` |
| Config changes | NONE (symlinked shared env only) |
| Deploy state captured | `last-deploy-state.env` @ 2026-09-08T17:40:29Z |

## Worker transition (canonical rolling deploy)

Procedure: `vps_replica_rolling_deploy` — restart replica A, wait healthy + SHA, restart replica B, wait healthy + SHA; scheduler convergence gate; external health.

| Event (UTC) | Detail |
|-------------|--------|
| 17:40:29 | Deploy state captured; `PREVIOUS_SHA=7b9a7857…` |
| 17:40:30 | `synqdrive` (A) restart begins |
| 17:40:39 | A healthy on TARGET_SHA (port 3001) |
| 17:40:39 | `synqdrive-b` (B) restart begins |
| 17:40:48 | B healthy on TARGET_SHA (port 3002) |
| 17:40:49 | SHA invariant OK; scheduler convergence gate start |
| 17:41:10 | Scheduler roles A=LEADER B=FOLLOWER; external health PASS |

**Mixed-version window (documented, not denied):** approx. **17:40:30–17:40:48 UTC** (~18 s) — after A restart, B still ran pre-R10 code until B restart completed. Cannot claim zero old-worker job processing during this interval.

**TDL-DEC-R10-002 prerequisite:** both replicas now on R10+ (`evaluateEndCycleJobAdmission` present in dist on release).

## Post-deploy verification (@ 2026-09-08T17:49:20Z)

| Check | Result |
|-------|--------|
| Release SHA | `68495041974135f7c6565fd5b836b3e2f9176fae` |
| Replica A (3001) | pid 170515, uptime ~529s, health OK, role LEADER |
| Replica B (3002) | pid 170770, uptime ~520s, health OK, role FOLLOWER |
| Mixed SHA | NO — only two `main.js` PIDs, both under `current` release |
| R10 dist symbols | `evaluateEndCycleJobAdmission`: 3; `enqueueEndCycleTripTrackingJob`: 1 |
| Public health | HTTP 200 |
| nginx upstream | 3001 + 3002 |
| Scheduler leader (Redis) | `6dbb00b5-6bc1-42a7-8279-ae9afb2e254b` |
| Rollback required | NO |

## Errors (sanitized)

| Class | Detail |
|-------|--------|
| Known excluded | Repeated `DimoAuthService` 403 for tokenId=190497 (pre-existing; not triaged in this deploy) |
| New Trip-FSM / deploy failures | None observed in post-deploy window |

## Explicit non-claims

- No natural motor-off pause / resume / finalize observation on KS MX 2024 or KS MS 661
- No AUTHORITY_ACTIVE promotion
- No PRODUCTION_VALIDATED on TDL-DEC-R10-001/002
- KS MS 661 `no_core_data_keep_open` path remains separately open

## Next gate

Natural drive with documented timestamps: motor-off pause, genuine restart, definitive trip end; then read-only FSM/finalization chain review (KS MX 2024 tokenId 187336 primary reference).
