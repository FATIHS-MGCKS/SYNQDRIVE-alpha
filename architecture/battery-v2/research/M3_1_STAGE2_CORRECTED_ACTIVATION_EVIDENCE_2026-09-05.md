# M3.1 Corrected Stage-2 Production Activation — Immediate Post-Cutover Evidence

**Activation timestamp (canonical T0):** `2026-09-05T23:36:12Z`  
**Release:** `20260905231643_v4994`  
**Deployed SHA:** `a4377f3a200ca45a97b7ce422caf8d92faddabbe`  
**Guard:** PR #1527 / `BATTERY_V2_PKG01_PRE_CUTOVER_GUARD_VERSION=2026-09-03-valid-only-handoff`  
**Operator path:** `sudo BATTERY_V2_STAGE2_PREFLIGHT_ACK=YES bash /opt/synqdrive/current/backend/scripts/ops/vps-enable-battery-v2-stage2-production.sh`

## Preflight (immediate-before-activation)

| Gate | Result |
|------|--------|
| `PKG01_GUARD_DEPLOYED` | YES |
| `SCHEDULER_TOPOLOGY_PREFLIGHT` | PASS |
| `SCHEDULER_LEADERS` | 1 (3001=LEADER, 3002=FOLLOWER) |
| `PKG01_ENQUEUED_VALID` | 0 |
| `PKG01_ENQUEUED_UNRESOLVED` | 0 |
| `PKG01_PRE_T0_VALID_BACKLOG_GATE` | PASS |
| `STAGE2_TARGET_CONTRACT_VALID` | YES |
| Pre-activation contract | `REST_SHADOW=false`, `PUBLICATION=true`, `RECONCILIATION=true` (invalid M3.1 mismatch) |

## Activation result

| Field | Value |
|-------|-------|
| `ACTIVATION_EXIT_CODE` | 0 |
| `ATOMIC_ROLLBACK_OCCURRED` | NO |
| `BACKUP_FILE` | `/opt/synqdrive/shared/backend.env.bak-battery-v2-stage2-20260905233537` |
| Post-activation env | `REST_SHADOW=true`, `PUBLICATION=true`, `RECONCILIATION=true` |
| Rolling restart | Both replicas restarted; SHA invariant OK |
| Scheduler convergence | PASS after transient zero-leader window |
| `NEW_STAGE2_T0` | `2026-09-05T23:36:12Z` |

Historical failed-cutover T0 `2026-09-03T11:08:02Z` is **not** reused.

## Post-activation topology

| Check | Result |
|-------|--------|
| `POST_ACTIVATION_PM2_HEALTH` | PASS (synqdrive + synqdrive-b online) |
| `POST_ACTIVATION_SCHEDULER_HEALTH` | PASS |
| `POST_ACTIVATION_SCHEDULER_LEADERS` | 1 |
| `POST_DEPLOY_MIXED_SHA` | NO (`a4377f3a200c` both replicas) |
| External health | `https://app.synqdrive.eu/api/v1/health` PASS |

Effective config: `/opt/synqdrive/current/backend/.env` → `/opt/synqdrive/shared/backend.env` (both replicas restarted post-mutation).

## Runtime contract (Stage-2)

Per `battery-v2-cutover.policy.spec.ts` Stage-2 semantics with deployed flags:

| Flag / mode | Effective |
|-------------|-----------|
| `CANONICAL_REST_PIPELINE_ACTIVE` | YES (`REST_SHADOW=true`) |
| `LEGACY_REST_CAPTURE_ACTIVE` | NO |
| `LV_REST_SHADOW_ONLY_MODE` | NO (`PUBLICATION=true`) |
| `PUBLICATION_ENABLED` | YES |
| `RECONCILIATION_ENABLED` | YES |

## PKG-01 immediate smoke (2 reconciliation ticks)

**Pre-cutover baseline:** 24 ENQUEUED (0 VALID, 24 non-VALID, 0 unresolved) — 23 CONTAMINATED + 1 MISSED per forensic classification.

| Metric | Value |
|--------|-------|
| Reconciliation ticks observed since T0 | 2 (`23:40:43Z`, `23:45:42Z`) |
| `PKG01_PRE_T0_ENQUEUED_BEFORE` | 24 |
| `PKG01_PRE_T0_ENQUEUED_AFTER` | 5 |
| Terminalized in-window (24→5) | 19 |
| Total `EXECUTED/POLICY_SKIPPED` | 22 (includes 3 pre-existing) |
| `PKG01_PRE_T0_ASSESS_ENQUEUED` | 0 |
| `PKG01_PRE_T0_PUBLICATION_HANDOFFS` | 0 |
| `PKG01_PRE_T0_CUSTOMER_PUBLICATIONS` | 0 |

**Remaining 5 ENQUEUED:** all 8–9 days old — outside reconciliation 7-day measurement lookback (`CANONICAL_REST_ASSESSMENT_HANDOFF_LOOKBACK_MS`). Preflight audits full ENQUEUED backlog; reconciliation uses bounded lookback (documented in preflight output). These identities are non-VALID; guard blocks assess enqueue; no assess/publication work observed since T0.

## Safety delta (vs pre-cutover snapshot)

| Check | Result |
|-------|--------|
| `NEW_FAILURE_CLASS` | NO (no new 54000, LOCK_CONTENTION, AUTHORITY_UNAVAILABLE in battery logs since T0) |
| `NEW_LOGICAL_DUPLICATE` | NO |
| `RESERVATION_LEAK` | NO |
| `RECONCILIATION_STORM` | NO |
| BullMQ battery-v2 queues | all wait/active = 0 post-smoke |

## Pipeline vs natural evidence

| Field | Value |
|-------|-------|
| `CANONICAL_PIPELINE_ENABLED` | YES |
| `NATURAL_E2E_EVIDENCE_OBSERVED` | NO (expected — requires time + qualifying vehicle rest) |

## Verdict

| Field | Value |
|-------|-------|
| `IMMEDIATE_STAGE2_SMOKE` | **PASS** |
| `M3_1_STATUS` | **STAGE2_ACTIVATED_PENDING_PRODUCTION_VALIDATION** |
| `PRODUCTION_VALIDATED` | **PENDING_CORRECTED_ACTIVATION_EVIDENCE** |

## Pending validation (not executed in this run)

1. **T+30m canonical production validation** from `NEW_STAGE2_T0=2026-09-05T23:36:12Z`
2. **≥6h production validation** after 30m PASS
3. Optional: bounded lookback follow-up for 5 stale ENQUEUED identities (>7d) — document-only unless authorized remediation path exists
