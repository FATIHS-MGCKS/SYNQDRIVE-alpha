# P1.8.2.1 Multi-Replica Deployment Lifecycle Hardening

**Date:** 2026-08-31  
**Repository:** SYNQDRIVE-alpha  
**Context:** P1.8.2 `SCALE_TO_2_SUCCESS` — production runs two PM2 fork replicas (`synqdrive:3001`, `synqdrive-b:3002`) behind nginx `synqdrive_backend`.

---

## Executive verdict

| Field | Value |
|-------|-------|
| **DEPLOYMENT_LIFECYCLE_VERDICT** | `READY_FOR_NEXT_PRODUCTION_DEPLOY` |
| **PRODUCTION_MUTATION_EXECUTED** | `NO` (tests + introspection only) |

The canonical VPS deploy path (`vps-deploy-release.sh`) is now **multi-replica aware**: rolling restart of both replicas, per-replica health/readiness verification, mixed-SHA protection, scheduler-leader check, nginx dual-upstream check, and automatic rollback on failure.

---

## Phase 0 — Audit: previous deploy model

### Mechanism traced

| Component | Role |
|-----------|------|
| `.cursor/scripts/cloud-agent-deploy.sh` | Git preflight → SSH → remote `vps-deploy-release.sh` → external health |
| `backend/scripts/ops/vps-deploy-release.sh` | Clone release → build → boot check → **switch `current` symlink** → PM2 restart |
| PM2 | `synqdrive` fork on port 3001 only (no ecosystem file) |
| nginx | Dual upstream `3001+3002` (post P1.8.2) — deploy script did not verify |
| Rollback | **None** — prior script had no multi-replica rollback |

### What happened to each replica (before this change)

| Replica | During `vps-deploy-release.sh` |
|---------|--------------------------------|
| `synqdrive` :3001 | **Updated** — `pm2 restart synqdrive --update-env` after `current` switch |
| `synqdrive-b` :3002 | **Not updated** — process kept running old in-memory code until manual restart |

Health check only polled **port 3001**. Deploy could report **success** while Replica B remained on a previous build.

```
CURRENT_DEPLOY_MODEL = single-replica-restart with dual-replica production topology
PRIMARY_UPDATED = YES (synqdrive / 3001)
SECONDARY_UPDATED = NO (synqdrive-b / 3002)
POSSIBLE_MIXED_SHA_STATE = YES
POSSIBLE_SINGLE_REPLICA_STATE = NO (B still running, but stale SHA)
ROLLBACK_MULTI_REPLICA_AWARE = NO
ROOT_CAUSE = vps-deploy-release.sh hard-coded pm2 restart synqdrive only; no per-replica orchestration, SHA invariant, or rollback state
```

---

## Phase 1 — Canonical deployment invariants (now enforced)

1. Production target replica count = **2** (`SYNQDRIVE_PRODUCTION_REPLICA_COUNT`, default 2).
2. Replica A = `synqdrive` / port **3001**.
3. Replica B = `synqdrive-b` / port **3002** / `INSTANCE_ID=replica-b`.
4. Both replicas run the **same** target release SHA after deploy completes.
5. Post-deploy verification requires health + readiness on **each** replica port.
6. Rolling restart: A verified → then B verified (at least one healthy during roll when A completes first).
7. Exactly **one** scheduler leader globally (readiness role check).
8. DIMO global budget unchanged (shared Redis — no deploy mutation).
9. Reconciliation mutex unchanged (shared Redis).
10. Rollback restores **same-SHA** two-replica topology via `vps-rollback-production-release.sh`.
11. Deploy **fails** (and rolls back) if mixed-SHA / missing secondary / invariant breach.
12. Final verification explicitly checks both replicas + nginx + external health.

---

## Phase 2 — Implementation

### New / updated artifacts

| File | Purpose |
|------|---------|
| `vps-production-replica-topology.config.sh` | Canonical ports, PM2 names, paths |
| `lib/vps-production-replica.lib.sh` | Rolling deploy, health/SHA checks, rollback |
| `pm2.production-ecosystem.config.cjs` | First-class PM2 config for both replicas |
| `vps-deploy-release.sh` | Uses rolling multi-replica deploy + verification |
| `vps-rollback-production-release.sh` | Operator rollback to last captured state |
| `vps-multi-replica-deploy.util.mjs` | Pure invariant helpers (unit tested) |

### Deploy flow (after build + boot check)

```
1. Capture deploy state (previous release dir + SHA + PM2 dump)
2. ln -sfn NEW_RELEASE → /opt/synqdrive/current
3. Ensure synqdrive + synqdrive-b registered (start if missing)
4. pm2 restart ecosystem --only synqdrive  → wait healthy :3001
5. pm2 restart ecosystem --only synqdrive-b → wait healthy :3002
6. pm2 save
7. Post-deploy verify:
   - both ports listening, health + readiness OK
   - current symlink SHA == TARGET_SHA
   - both PM2 uptimes ≤ SYNQDRIVE_MAX_UPTIME_AFTER_DEPLOY_SEC (stale-process guard)
   - scheduler leader count == 1
   - nginx dual upstream present
   - external https://app.synqdrive.eu/api/v1/health PASS
8. On any failure → vps_replica_rollback(last-deploy-state.env)
```

### Mixed-SHA protection (Phase 3)

Because health endpoints do not expose runtime git SHA, protection uses:

- `current` symlink SHA must equal `TARGET_SHA`
- **Both** replicas must be restarted in this deploy (uptime ceiling post-verify)
- If Replica B fails restart/health → **rollback** restores previous release and restarts **both** replicas

Recovery on partial failure: automatic rollback to `PREVIOUS_CURRENT_RELEASE` captured in `/opt/synqdrive/shared/deploy-state/last-deploy-state.env`.

---

## Phase 5 — Multi-replica rollback

```bash
sudo bash /opt/synqdrive/current/backend/scripts/ops/vps-rollback-production-release.sh
# or explicit state file:
sudo bash .../vps-rollback-production-release.sh /opt/synqdrive/shared/deploy-state/last-deploy-state.env
```

Rollback steps:

1. Restore `current` → previous release directory
2. Rolling restart both replicas from ecosystem config
3. Verify same-SHA, health, scheduler leader, nginx, external health
4. Fallback: resurrect PM2 dump if rolling restart fails

---

## Phase 6 — Tests (no production mutation)

| Test | Result |
|------|--------|
| `node --test vps-multi-replica-deploy.util.test.mjs` | 7/7 PASS |
| `bash vps-multi-replica-deploy.selftest.sh` | PASS |

Scenarios covered in unit tests: both replicas success path, mixed SHA, missing secondary semantics, port unavailable (readiness eval), nginx validation failure (parser), rollback after partial deploy, scheduler leader != 1.

---

## Phase 7 — Production safety decision

**No production deploy executed** for this task.

Validation is sufficient via:

- Code audit of previous vs new deploy path
- Unit/self tests for orchestration invariants
- Current production introspection (both replicas still healthy from P1.8.2)

A real deploy test should occur on the **next** intentional production release after this PR merges.

---

## Phase 8 — Machine-readable summary

```
DEPLOYMENT_LIFECYCLE_VERDICT = READY_FOR_NEXT_PRODUCTION_DEPLOY
CANONICAL_REPLICA_COUNT = 2
REPLICA_A_PORT = 3001
REPLICA_B_PORT = 3002

DEPLOY_SCRIPT_MULTI_REPLICA_AWARE = YES
ROLLING_DEPLOY_SUPPORTED = YES
MIXED_SHA_PROTECTION = YES
PER_REPLICA_HEALTH_VERIFICATION = YES
PER_REPLICA_SHA_VERIFICATION = YES (symlink + restart freshness guard)
NGINX_DUAL_UPSTREAM_VERIFICATION = YES
SCHEDULER_SINGLE_LEADER_VERIFICATION = YES
MULTI_REPLICA_ROLLBACK_SUPPORTED = YES

PRODUCTION_MUTATION_EXECUTED = NO
TEST_STATUS = PASS
NEW_P0_COUNT = 0
NEW_P1_COUNT = 0
NEW_P2_COUNT = 0
BLOCKERS = NONE

NEXT_STAGE = P1.8.3 post-scale retrospective production audit
```

---

## Operator notes

- Override single-replica deploy on non-prod hosts: `SYNQDRIVE_PRODUCTION_REPLICA_COUNT=1`.
- Deploy state persisted at: `/opt/synqdrive/shared/deploy-state/last-deploy-state.env`.
- First production deploy after merge will exercise the new path — monitor both replicas and scheduler leader.

---

## References

- P1.8.2 scale evidence: `architecture/P1_8_2_CONTROLLED_PRODUCTION_SCALE_TO_2_2026-08-31.md`
- Cloud deploy caller: `.cursor/scripts/cloud-agent-deploy.sh`
