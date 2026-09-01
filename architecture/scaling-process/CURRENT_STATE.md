# SCALING PROCESS — Current State

**Last verified:** 2026-09-01T09:02Z (read-only VPS introspection + `origin/main`)  
**Verifier:** Scaling Process bootstrap agent (no production mutations)

---

## Machine-readable header

```
WORKSTREAM = SCALING_PROCESS
AUTHORITY_STATUS = BOOTSTRAP_ESTABLISHED
CURRENT_MAIN_SHA = c5dce7a9de130e4785a707c5175c1b7fb3dc8302
CURRENT_PRODUCTION_SHA = e76ada3d8885f8eeb7f2e6c6c50be115d0758c2c
CURRENT_PRODUCTION_REPLICA_COUNT = 1
REPLICA_A = synqdrive @ 3001 ONLINE LEADER
REPLICA_B = synqdrive-b @ 3002 ABSENT (PM2 not registered; port not listening)
NGINX_DUAL_UPSTREAM = YES (configured) / EFFECTIVE = DEGRADED (3002 unreachable)
SCHEDULER_SINGLE_LEADER = YES (port 3001 role=LEADER)
DIMO_GLOBAL_BUDGET = ENABLED (limit 50 per architecture; not re-verified live metrics this snapshot)
RECONCILIATION_MUTEX = ENABLED (per architecture; not stress-tested this snapshot)
ROLLING_DEPLOYMENT = NO on main (P1.8.2.1 #1472 not merged)
MIXED_SHA_PROTECTION = NO on main deploy path
PROVIDER_CEILING_VERIFIED = NO
N1000_CERTIFICATION = CONDITIONAL (software only)
OPEN_P0 = 0 (no new scaling P0 identified this snapshot)
OPEN_P1 = 1 (production replica B missing while nginx dual-upstream remains)
OPEN_P2 = historical battery.v2 failed=64; nginx/backend topology drift
NEXT_ARCHITECTURE_STAGE = P1.8.3 post-scale retrospective + restore 2-replica OR merge #1472 before next deploy
```

---

## TYPE: FACT — Production topology (2026-09-01)

| Component | Observed state | Evidence |
|-----------|----------------|----------|
| Host | `srv1374778.hstgr.cloud` / `app.synqdrive.eu` | SSH read-only |
| PM2 `synqdrive` | online, PID 2168457, ~3.5h uptime, 22 restarts cumulative | `pm2 list` |
| PM2 `synqdrive-b` | **not present** | `pm2 list` |
| Port 3001 | listening | `ss -tlnp` |
| Port 3002 | **not listening** | `ss -tlnp` |
| nginx upstream | `synqdrive_backend { 3001; 3002 }` | `/etc/nginx/sites-enabled/synqdrive` |
| External health | PASS | `https://app.synqdrive.eu/api/v1/health` |
| Scheduler role :3001 | LEADER | readiness endpoint |
| Scheduler role :3002 | UNREACHABLE | readiness endpoint |
| Redis DB | 0 (production) | architecture + prior audits |
| `synqdrive:scheduler:leader` | present, TTL ~22s | `redis-cli` |
| `battery.v2` failed (BullMQ) | 64 | `ZCARD bull:battery.v2:failed` |
| Deployed release SHA | `e76ada3d8` | `git -C /opt/synqdrive/current rev-parse HEAD` |

---

## TYPE: INCIDENT — Topology regression after P1.8.2

**STATUS:** ACTIVE_DRIFT  
**SOURCE:** P1.8.2 scale-to-2 report (#1471) documented 2 replicas; 2026-09-01 introspection shows 1.

**RATIONALE:** Subsequent production deploys (`vps-deploy-release.sh` on **main**) restart only `synqdrive`. They do not preserve or restart `synqdrive-b`. PR #1472 (P1.8.2.1 rolling multi-replica deploy) is **not merged** as of this snapshot.

**RISK_IF_CHANGED:** nginx may route traffic to dead upstream 3002 (intermittent 502/timeout depending on load-balancing).

See [FAILURE_AND_RECOVERY_MODEL.md](./FAILURE_AND_RECOVERY_MODEL.md) § topology drift.

---

## TYPE: FACT — Canonical *intended* two-replica topology

Established by P1.8.2 (historical evidence, 2026-08-31):

| Replica | PM2 | Port | Env |
|---------|-----|------|-----|
| A | `synqdrive` | 3001 | `PORT=3001` via `backend.env` |
| B | `synqdrive-b` | 3002 | `PORT=3002`, `INSTANCE_ID=replica-b` |

**CURRENT runtime does not match intended topology** until replica B is restored and deploy hardening (#1472) is merged.

---

## TYPE: DECISION — Coordination layers (code on main)

| Layer | Status on main | Introduced by |
|-------|----------------|---------------|
| Scheduler leader election (P1.7) | Merged #1430 | `scheduler-leader/*` |
| DIMO global provider budget (P1.3) | Merged #1417 | `provider-budget/*` |
| Reconciliation mutex (P1.4) | Merged #1435 | `reconciliation-execution-mutex/*` |
| Multi-replica deploy hardening (P1.8.2.1) | **Open** #1472 | branch only |

---

## Quick health summary

| Check | Result |
|-------|--------|
| Application externally reachable | PASS |
| Single scheduler leader | PASS (trivially — one process) |
| Two-replica production invariant | **FAIL** (replica B absent) |
| Deploy path preserves 2 replicas | **NO** (until #1472) |
