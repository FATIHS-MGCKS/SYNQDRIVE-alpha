# Multi-Replica Deployment

**TYPE:** ARCHITECTURE + INCIDENT_HISTORY  
**SOURCES:** `vps-deploy-release.sh`, P1.8.2 reports, P1.8.2.1 (#1472 open)

---

## Historical model (SUPERSEDED on main until #1472 merges)

**TYPE: SUPERSEDED_DECISION**

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

## Intended model (P1.8.2.1 — PR #1472)

**TYPE: DECISION** (branch `cursor/p1-8-2-1-multi-replica-deploy-83be`, **not merged**)

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

**TYPE: INVARIANT** (when #1472 merged)

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

## Operator actions (current drift)

**TYPE: OPEN_QUESTION** — Until #1472 merged and replica B restored:

1. Re-apply P1.8.2 scale procedure OR manually start `synqdrive-b` on :3002
2. Merge #1472 before next production deploy
3. Consider temporary nginx single-upstream if staying at N=1 intentionally

**Do not execute in bootstrap task** — documented only.
