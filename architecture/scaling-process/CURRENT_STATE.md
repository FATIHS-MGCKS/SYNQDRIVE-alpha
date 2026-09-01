# SCALING PROCESS — Current State

**Last verified:** 2026-09-01T10:25Z (P1.8.3 post-merge production verification)  
**Verifier:** P1.8.3 agent (production deploy + read-only audit)

---

## Machine-readable header

```
WORKSTREAM = SCALING_PROCESS
AUTHORITY_STATUS = ACTIVE_VERIFIED
CURRENT_MAIN_SHA = d6884ce6030cafcb9a39fa422359eb8345496913
CURRENT_PRODUCTION_SHA = d6884ce6030cafcb9a39fa422359eb8345496913
CURRENT_PRODUCTION_REPLICA_COUNT = 2
REPLICA_A = synqdrive @ 3001 ONLINE LEADER
REPLICA_B = synqdrive-b @ 3002 ONLINE FOLLOWER
NGINX_DUAL_UPSTREAM = YES (configured) / EFFECTIVE = HEALTHY (both upstreams live)
SCHEDULER_SINGLE_LEADER = YES (port 3001 role=LEADER, count=1)
DIMO_GLOBAL_BUDGET = ENABLED (limit 50 per architecture; leases key present)
RECONCILIATION_MUTEX = ENABLED (architecture; no stress probe this snapshot)
ROLLING_DEPLOYMENT = YES (#1472 merged; exercised 2026-09-01)
MIXED_SHA_PROTECTION = YES (verified on rolling deploy attempt)
PROVIDER_CEILING_VERIFIED = NO
N1000_CERTIFICATION = CONDITIONAL (software only)
OPEN_P0 = 0
OPEN_P1 = 0
OPEN_P2 = 2 (deploy leader-election timing false-abort; bootstrap deploy uses pre-merge script from current symlink)
NEXT_ARCHITECTURE_STAGE = P1.8.3.1 deploy script leader-wait hardening; sustained N=2 soak
```

---

## TYPE: FACT — Production topology (2026-09-01 P1.8.3)

| Component | Observed state | Evidence |
|-----------|----------------|----------|
| Host | `srv1374778.hstgr.cloud` / `app.synqdrive.eu` | SSH |
| Release | `20260901100147_v4994` | `readlink -f /opt/synqdrive/current` |
| PM2 `synqdrive` | online, port 3001, LEADER | `pm2 list`, readiness |
| PM2 `synqdrive-b` | online, port 3002, FOLLOWER | `pm2 list`, readiness |
| Port 3001 / 3002 | both listening | `ss -tlnp` |
| nginx upstream | `synqdrive_backend { 3001; 3002 }` | `/etc/nginx/sites-enabled/synqdrive` |
| External health | PASS | `https://app.synqdrive.eu/api/v1/health` |
| Scheduler leader | 1 (A=LEADER, B=FOLLOWER) | readiness @ 10:24:50Z |
| Redis DB | 0 | `redis-cli -n 0 PING` |
| `synqdrive:scheduler:leader` | present, TTL ~28s | `redis-cli` |
| `battery.v2` failed (BullMQ) | 64 (unchanged) | `ZCARD bull:battery.v2:failed` |
| Queue wait/active | 0 on sampled queues | Redis LLEN |

---

## TYPE: FACT — P1.8.3 deploy sequence

1. **Bootstrap deploy** (10:01Z): `cloud-agent-deploy.sh` ran **pre-#1472** script from old `current` symlink → single `pm2 restart synqdrive` only; promoted SHA `d6884ce` on replica A only.
2. **Multi-replica deploy** (10:17Z): second deploy exercised **#1472 rolling path** — started `synqdrive-b`, rolling A→B, SHA invariant PASS; **scheduler leader check failed** (0 leaders at T+15s) → auto-rollback to same SHA release; rollback rolling restart left **both replicas online**.
3. **Post-audit** (10:24Z): after leader election window (~35s), **N=2 coherent**, leader count=1, SHA match.

**EVIDENCE:** `/opt/cursor/artifacts/p183_deploy_bootstrap.log`, `p183_deploy_multi_replica.log`

---

## TYPE: INCIDENT — INC-05 status

**STATUS:** CLOSED (2026-09-01 P1.8.3)  
**RATIONALE:** Replica B restored; both replicas on `d6884ce`; nginx dual-upstream healthy; rolling deploy path exercised.  
**RESIDUAL:** Deploy script leader verification may false-abort before election completes (see OPEN P2).

---

## TYPE: DECISION — Coordination layers (main @ d6884ce)

| Layer | Status | Introduced by |
|-------|--------|---------------|
| Scheduler leader election (P1.7) | ACTIVE | #1430 |
| DIMO global provider budget (P1.3) | ACTIVE | #1417 |
| Reconciliation mutex (P1.4) | ACTIVE | #1435 |
| Multi-replica deploy hardening (P1.8.2.1) | **MERGED** #1472 | rolling deploy |

---

## Quick health summary

| Check | Result |
|-------|--------|
| Application externally reachable | PASS |
| Single scheduler leader | PASS |
| Two-replica production invariant | **PASS** |
| Deploy path preserves 2 replicas | **YES** (after #1472 on current) |
| Automated deploy gate | PASS_WITH_FINDINGS (leader timing) |
