# M3.3F F4.5 — Controlled D3 first-tick canary (production attempt — **ERROR**)

**Date:** 2026-09-28  
**Authoritative production runtime:** `68a05e4156db28568ad5b7718ca1f9ad2d799884` / `20260928001456_v4994`  
**F4.4 preflight:** PR #1821 merged @ `f1659f88e4d9f4060442e46e2bf19d54fc6a58a6`  
**Outcome:** **`F4_5_CANARY_RESULT=ERROR`** — no executed D3 leader reconciliation tick on authoritative root PM2; **no D3/ack writes**.

## Summary

An activation attempt mutated shared `backend.env` (D3 **true** → later **false**, `BATCH_SIZE=1`) and used **`synqdrive-admin` user PM2** restarts. Authoritative production backends run under **root PM2** (stable since deploy `00:26Z`). Root replicas were **not** rolling-restarted during the activation window, so they never loaded D3=ON. Parallel **synqdrive-admin** PM2 processes crash-looped on `EACCES` reading release `backend/.env` (symlink to shared env). After **25 minutes** no `COMPLETED`/`FAILED` reconciliation tick was observed on the leader port. Automatic pause set D3 **false** in shared env; rogue admin PM2 was stopped; **root PM2** was `restart --update-env` to converge D3 **OFF** with healthy external health.

## Pre-activation (read-only)

| Field | Value |
|-------|-------|
| `C3_ROWS_PRE` | 33 |
| `CURRENT_VERSION_C3_ROWS_PRE` | 33 |
| `C3_VEHICLE_COUNT_PRE` | 4 |
| `D3_REVISION_ROWS_PRE` | 0 |
| `ACK_ROWS_PRE` | 0 |
| `PRE_ACTIVATION_CROSS_TENANT_MISMATCH_COUNT` | 0 |
| Pending migrations @ deployed runtime | 0 |

## Final pre-write backup (F4.5)

| Field | Value |
|-------|-------|
| Path | `/opt/synqdrive/shared/backups/db-pre-f45-d3-canary-20260928014025.sql.gz` |
| Timestamp UTC | `2026-09-28T01:40:39Z` |
| Size bytes | `86881728` |
| SHA256 | `46e78eda5732c2a348f115c98712184c3061980c2355719803262a55f7133495` |
| gzip / SQL header / dump trailer | PASS / YES / YES |

Post-backup: D3 revisions **0**, acks **0**.

## Activation attempt (did not reach authoritative runtime)

| Field | Value |
|-------|-------|
| `ENV_MUTATION_AT` | `2026-09-28T01:40:46Z` |
| Intended follower-first | `synqdrive-b` then `synqdrive` under **admin PM2** |
| `F_D3_T0` (script timestamp) | `2026-09-28T01:40:47Z` — **not valid** for production authority (root gauges remained **0**) |
| Both replicas D3 gauge convergence | **NO** (`GAUGE_A=0`, `GAUGE_B=0` on watched endpoints) |
| `FIRST_D3_SCHEDULER_TICK_AT` | **unset** (`FIRST_TICK_TIMEOUT` after 50×30s poll) |
| D3 revision / ack delta | **0** / **0** |

## Post-pause / recovery (final OFF state)

| Field | Value |
|-------|-------|
| Shared env D3 | `false` |
| Shared env batch size | `1` (unchanged from activation mutation) |
| `D3_PAUSE_CONVERGED_AT` | `2026-09-28T02:06:40Z` (admin PM2 pause path) |
| Root PM2 reload | `2026-09-28T02:07:59Z` — `sudo pm2 restart … --update-env`; external health **ok** |
| Admin PM2 | **stopped** (`pm2 kill`) — must not be used for production rollout |
| `C3_ROWS_POST` | 34 (natural C3 shadow continued) |
| `D3_REVISION_ROWS_POST` | 0 |
| `ACK_ROWS_POST` | 0 |
| `D3_LEFT_ON_AFTER_CANARY` | **NO** (gauges **0** on root replicas) |

## Root cause (operator / infra)

1. **Wrong PM2 identity:** Production replicas are **`root` PM2** (`synqdrive`, `synqdrive-b`). Cloud-agent SSH user **`synqdrive-admin`** has a separate PM2 daemon; restarts did not reload authoritative processes.
2. **Env load failure on admin PM2:** Nest bootstrap requires read on `/opt/synqdrive/current/backend/.env` → `/opt/synqdrive/shared/backend.env`; admin-owned processes hit **`EACCES`**, causing crash loops (400+ restarts) while health checks intermittently passed during partial startup.
3. **No root rolling restart during D3=ON window:** Root processes kept ~6000s uptime and **D3 OFF in memory** throughout the canary wait.

## Required retry gates (F4.5R)

- Use **`sudo pm2`** + `pm2.production-ecosystem.config.cjs` with `--update-env` only (same pattern as `rfrf-production-enable-stage.sh` / `vps-deploy-release.sh`).
- Verify **both replicas** `synqdrive_battery_longitudinal_materialization_flag_enabled=1` before waiting for first tick.
- Confirm **single** PM2 daemon (root); no parallel admin PM2 listeners on 3001/3002.
- Retain follower-first order using `vps_replica_collect_scheduler_roles` on **root** health endpoints.

## Decision

**`F4_5_CANARY_RESULT=ERROR`**  
**`F4_D3_ACTIVATION_ALLOWED`** remains **YES** from F4.4 preflight for a **corrected retry** — not for sustained D3 without a successful canary.  
**`NEXT_STAGE=F4_5R_CONTROLLED_D3_FIRST_TICK_CANARY_RETRY`** (root PM2 rollout + first-tick proof + automatic pause).
