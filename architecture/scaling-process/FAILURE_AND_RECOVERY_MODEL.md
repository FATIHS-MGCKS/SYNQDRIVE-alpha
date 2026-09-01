# Failure and Recovery Model

**TYPE:** ARCHITECTURE + INCIDENT_LOG

---

## Failure domains

| Domain | Symptom | System response | Recovery |
|--------|---------|-----------------|----------|
| Redis down | Leader/mutex/budget fail | Fail-closed, no ticks / no unbudgeted HTTP | Restore Redis |
| Leader crash | No singleton ticks | Follower acquires after TTL (~35s) | Automatic |
| Leader graceful stop | Brief gap | Failover ~32s prod (P1.8.2) | Automatic |
| Mutex contention | Second worker skips | Expected | None |
| DIMO 429 | Cooldown + retry | Bounded backoff | Automatic |
| Deploy partial | Mixed SHA / missing B | **Should** rollback (#1472) | Manual until #1472 |
| nginx + dead upstream | Intermittent 5xx | External errors | Fix PM2 / nginx |

---

## Incident timeline

### INC-01: Prometheus duplicate metric startup failure

| Field | Value |
|-------|-------|
| **TYPE** | INCIDENT |
| **DATE** | 2026-08-30 ~14:49 UTC |
| **TRIGGER** | Deploy SHA `85c3cd8e0` |
| **SYMPTOM** | `prom-client` duplicate gauge `synqdrive_dimo_provider_cooldown_active` |
| **IMPACT** | PM2 restart failed; startup loop |
| **FIX** | `3874360e0` rename to `synqdrive_dimo_global_budget_cooldown_active` |
| **LESSON** | `SYNQDRIVE_BOOT_CHECK=1` before `current` switch catches full module graph |
| **EVIDENCE** | `architecture/P1_8_24H_SINGLE_REPLICA_SOAK_RETROSPECTIVE_AUDIT_2026-08-31.md` |

---

### INC-02: Validation orphan process :3010 / Redis DB 15

| Field | Value |
|-------|-------|
| **TYPE** | INCIDENT (P2 hygiene) |
| **DATE** | Discovered P1.8 soak audit |
| **SOURCE** | `two-replica-process-validation-probe.mjs` Phase C detached restart |
| **SYMPTOM** | Orphan Node on port 3010, Redis DB 15 |
| **PRODUCTION_IMPACT** | None — not on 3001, not DB 0 |
| **REMEDIATION** | SIGTERM orphan; harness PID tracking (#1470) |
| **EVIDENCE** | `architecture/P1_8_1_PRE_SCALE_REMEDIATION_2026-08-31.md` |

---

### INC-03: Battery V2 failed-job misinterpretation

| Field | Value |
|-------|-------|
| **TYPE** | INCIDENT (classification correction) |
| **CONTEXT** | P1.8 soak — 67 failed `battery.v2` jobs |
| **INITIAL** | Suspected LOCK_CONTENTION dominant |
| **CORRECTED** | 43 legacy `missing restWindowId`; 18 REST pending false-failures; 2 lock; 4 Prisma |
| **BLOCKER?** | No — scale-to-2 proceeded with monitoring |
| **FIX_ON_MAIN** | #1445 REST pending liveness (throws → PENDING) |
| **EVIDENCE** | P1.8.1 forensics |

---

### INC-04: P1.8.2 first nginx upstream placement failure

| Field | Value |
|-------|-------|
| **TYPE** | INCIDENT |
| **DATE** | 2026-08-31 scale attempt 1 |
| **SYMPTOM** | `upstream directive is not allowed here` (inside `server {}`) |
| **RESPONSE** | Auto-rollback; replica B removed |
| **GAP** | Rollback left replica A stopped briefly — script improved |
| **RESOLUTION** | Second attempt: upstream before `server {}` — SUCCESS |
| **EVIDENCE** | `architecture/P1_8_2_CONTROLLED_PRODUCTION_SCALE_TO_2_2026-08-31.md` |

---

### INC-05: Topology drift — replica B lost post-scale (ACTIVE)

| Field | Value |
|-------|-------|
| **TYPE** | INCIDENT / DISCOVERED_INCONSISTENCY |
| **DATE** | Observed 2026-09-01 |
| **SYMPTOM** | PM2 only `synqdrive`; :3002 down; nginx still dual-upstream |
| **ROOT_CAUSE** | Deploys used pre-#1472 `vps-deploy-release.sh` (single restart) |
| **SEVERITY** | P1 — scaling invariant violated; degraded nginx |
| **RECOMMENDED_FOLLOWUP** | Merge #1472; restore replica B; P1.8.3 audit |

---

## Controlled failover evidence (P1.8.2)

| Metric | Value |
|--------|-------|
| Stop leader | `synqdrive` |
| New leader | `synqdrive-b` |
| Duration | 32s |
| Max leaders during | 1 |
| External health | PASS |

---

## Rollback procedures

| Scenario | Procedure |
|----------|-----------|
| Failed deploy (#1472) | Automatic `vps_replica_rollback` |
| Operator rollback | `vps-rollback-production-release.sh` |
| Scale-to-2 rollback | nginx backup + `pm2 delete synqdrive-b` + verify A (P1.8.2) |
| Bad release | Previous release symlink + PM2 restart both |

---

## What must not happen silently

1. Mixed SHA across replicas
2. Split scheduler brain (leader count > 1)
3. DIMO budget × replica multiplication
4. Reconciliation double execution
5. Deploy success with dead nginx upstream
