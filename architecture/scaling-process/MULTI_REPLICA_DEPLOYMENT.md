# Multi-Replica Deployment

**TYPE:** ARCHITECTURE + INCIDENT_HISTORY  
**SOURCES:** `vps-deploy-release.sh`, P1.8.2 reports, P1.8.2.1 (#1472 merged), P1.8.3 verification

---

## Historical model (SUPERSEDED)

**TYPE: SUPERSEDED_DECISION** — superseded by #1472 merge 2026-09-01

```
capture DB backup
→ clone release, build, migrate
→ SYNQDRIVE_BOOT_CHECK=1
→ ln -sfn release → current
→ pm2 restart synqdrive --update-env   # ONLY replica A
→ health check :3001 only
→ success
```

**Failure modes:**
- Replica B stale SHA (old in-memory code)
- Replica B missing after deploy (PM2 not restarted)
- nginx dual-upstream with dead :3002
- False success while mixed SHA

**EVIDENCE:** 2026-09-01 production — `synqdrive-b` absent after deploys post-P1.8.2; SHA `e76ada3d8` on main ahead of last scale doc.

---

## Canonical model (P1.8.2.1 — #1472 MERGED)

**TYPE: DECISION** — merged #1472; first production exercise P1.8.3 (2026-09-01)

```
1. vps_replica_capture_deploy_state (previous release, SHA, PM2 dump)
2. ln -sfn NEW → /opt/synqdrive/current
3. vps_replica_ensure_registered (synqdrive + synqdrive-b via ecosystem)
4. pm2 restart --only synqdrive → wait healthy :3001
5. pm2 restart --only synqdrive-b → wait healthy :3002
6. pm2 save
7. vps_replica_verify_post_deploy:
   - both ports listening, health + readiness
   - current SHA == TARGET_SHA
   - uptime freshness (stale-process guard)
   - scheduler leader count == 1
   - nginx dual upstream
   - external health PASS
8. On failure → vps_replica_rollback(state file)
```

### Artifacts (#1472)

| File | Role |
|------|------|
| `pm2.production-ecosystem.config.cjs` | Ports 3001/3002, INSTANCE_ID |
| `lib/vps-production-replica.lib.sh` | Orchestration |
| `vps-production-replica-topology.config.sh` | Constants |
| `vps-rollback-production-release.sh` | Operator rollback |

---

## Mixed-SHA protection

**TYPE: INVARIANT** (merged #1472)

```
REPLICA_A effective build == TARGET_SHA
REPLICA_B effective build == TARGET_SHA
else DEPLOYMENT = FAIL + rollback
```

Health endpoints do not expose git SHA → verification uses:
- `current` symlink SHA
- Both replicas restarted in deploy window (uptime ceiling)

---

## Rolling deploy rationale

**TYPE: DECISION** — Restart A, verify, then B:
- At least one healthy replica during roll (when A completes first)
- Early abort before full cutover if A broken
- Avoid blind `pm2 restart all`

---

## Rollback model (#1472)

```bash
sudo bash /opt/synqdrive/current/backend/scripts/ops/vps-rollback-production-release.sh
```

Restores:
- Previous `current` symlink
- Rolling restart **both** replicas on previous SHA
- Same invariant checks

---

## Cloud agent path

**TYPE: FACT** — `.cursor/scripts/cloud-agent-deploy.sh` → SSH → `vps-deploy-release.sh` → external health URL.

Git preflight: local HEAD must match `origin/main` (VPS clones GitHub main).

---

## Bootstrap caveat (P1.8.3 finding)

**TYPE: LIMITATION**

The remote deploy entrypoint runs `bash /opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh`. The **first** deploy after merging #1472 still executes the **pre-merge** script until `current` is switched. A **second** deploy (or manual run from new `current`) is required to exercise rolling multi-replica logic.

**EVIDENCE:** P1.8.3 bootstrap deploy log showed `==> Switch current + restart pm2` (old); second deploy showed `rolling multi-replica restart`.

---

## Deploy verification timing (P1.8.3 finding → P1.8.3.1 fix)

**TYPE: INCIDENT + REMEDIATION**

P1.8.3: `vps_replica_verify_scheduler_leaders` ran immediately after per-replica health checks. Leader acquisition may take up to `acquireIntervalMs` (5s) after restart. Deploy **false-aborted** with `leaders=0` at T+15s; production reached `leaders=1` at T+35s (INC-06).

**P1.8.3.1 fix:** `vps_replica_wait_scheduler_leader_convergence()` polls readiness endpoints with bounded retry:

| leaderCount | Action |
|-------------|--------|
| 0 | Transient — retry within 44s timeout |
| 1 | Candidate — require 2 consecutive stable observations |
| >1 | Immediate FAIL_SPLIT_BRAIN |

**CONFIG:** `SYNQDRIVE_SCHEDULER_LEADER_POLL_INTERVAL_MS=2000`, `SYNQDRIVE_SCHEDULER_LEADER_CONVERGENCE_TIMEOUT_MS=44000`, `SYNQDRIVE_SCHEDULER_LEADER_STABLE_OBSERVATIONS=2`

**EVIDENCE:** `architecture/P1_8_3_1_DEPLOY_LEADER_WAIT_PRODUCTION_VALIDATION_2026-09-01.md`; production attempt 3 PASS (14s convergence). INC-06 CLOSED.

---

## Deploy provenance (DEC-016)

**TYPE: DECISION**

Exact-SHA invariant — no mutable branch tip after preflight:

```
SYNQDRIVE_REQUESTED_DEPLOY_SHA (set by cloud-agent-deploy.sh)
  → bootstrap script checkout at that SHA
  → vps-deploy-release.sh clones that SHA into RELEASE_DIR
  → TARGET_SHA verified == REQUESTED_SHA
  → replica SHA invariant after rolling restart
```

**OQ-18:** RELEASE_OPS_DIR sourcing production-proven (attempt 3). Cloud-agent exact-SHA bootstrap path: **MITIGATED_PENDING_PRODUCTION_VALIDATION**.

**Canonical path:** `bash .cursor/scripts/cloud-agent-deploy.sh` — do not invoke stale `/opt/synqdrive/current/.../vps-deploy-release.sh` directly.

---

## Operator actions

**TYPE: FACT** — As of P1.8.3.1 validation, production is N=2 on `3772d992d`. Use canonical cloud-agent deploy path.
