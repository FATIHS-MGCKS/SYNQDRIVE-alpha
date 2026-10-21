# M3.0E — Post-merge production deploy + recovery convergence closure

**Date:** 2026-09-03  
**Merged baseline:** PR #1519 → `main` @ `0e0f09259f206aef44bd66eb4c142f7aee3fe29c`  
**Production release:** `20260903101734_v4994`  
**Deploy time (T0):** 2026-09-03T10:26:26Z  
**Observation window:** ~19 minutes (3 reconciliation ticks @ 5 min)

## Verdict

```
FULL_FLEET_ACTIVATION_READY = YES
```

**NEXT_ACTION = DIRECT_FULL_FLEET_BATTERY_V2_ACTIVATION** (not performed in M3.0E)

## Deploy authority

| Field | Value |
|-------|-------|
| `MAIN_SHA` | `0e0f09259f206aef44bd66eb4c142f7aee3fe29c` |
| `PR_1519_PRESENT` | YES |
| `DEPLOYED_SHA` | `0e0f09259f206aef44bd66eb4c142f7aee3fe29c` |
| Release path | `/opt/synqdrive/releases/20260903101734_v4994` |
| Migrations | 329 applied, 0 pending |
| PM2 | `synqdrive` (3001) + `synqdrive-b` (3002) online |
| Scheduler | Exactly 1 leader (`synqdrive-b`) at deploy convergence gate |
| Health | `https://app.synqdrive.eu/api/v1/health` → `{"status":"ok"}` |

## Production flags (authoritative `backend.env`)

| Flag | Value | Source |
|------|-------|--------|
| `BATTERY_V2_PUBLICATION_ENABLED` | `false` | `/opt/synqdrive/shared/backend.env` |
| `BATTERY_V2_REST_SHADOW_ENABLED` | `true` | `/opt/synqdrive/shared/backend.env` |
| `BATTERY_V2_RECONCILIATION_ENABLED` | `true` | code default |
| `BATTERY_V2_RECONCILIATION_INTERVAL_MS` | `300000` | code default |
| `BATTERY_V2_RECONCILIATION_BATCH` | `25` | code default |
| `BATTERY_V2_OBSERVATION_STALE_MS` | `120000` | code default |
| `BATTERY_V2_DLQ_REPLAY_ENABLED` | `false` | code default |

## T0 baseline (post-deploy, ~10:28 UTC)

### BullMQ `battery.v2`

| State | Count |
|-------|-------|
| wait | 0 |
| active | 0 |
| failed | 100 |
| completed | 1000 |

**Failed classification (historical, pre-deploy):** 55 `BATTERY_ASSESSMENT_RECOMPUTE`, 43 `BATTERY_REST_TARGET_EVALUATE`, 2 `BATTERY_LV_REST_SESSION_OPEN`. Top errors: empty reason (40), missing restWindowId (27), no eligible observation (16), lock contention assess (15). **Post-deploy failed: 0.**

### PKG-01 handoffs (canonical REST targets, 30d)

| Status | Count |
|--------|-------|
| ENQUEUED | 46 |
| MISSING | 15 |
| EXECUTED | 0 |
| FAILED (metadata) | 0 |
| legacy 54000 recoverable | 0 |

3 vehicles with multiple ENQUEUED handoffs (historical fan-out backlog).

### PKG-02

| Status | Count |
|--------|-------|
| MISSING | 5 |
| publications (30d) | 0 |

### Reservations

`battery:v2:assess-dispatch:*` count = **0** (no stale/leaked reservations at T0).

## Reconciliation tick deltas

| Tick | Time (UTC) | ENQUEUED | MISSING | EXECUTED | failed queue | post-deploy failed | reservations | assessments post-deploy |
|------|------------|----------|---------|----------|--------------|-------------------|--------------|------------------------|
| T0 | 10:28 | 46 | 15 | 0 | 100 | 0 | 0 | 0 |
| T1 | 10:34 | 42 | 14 | 3 | 97 | 0 | 0 | 3 |
| T2 | 10:40 | 40 | 14 | 6 | 94 | 0 | 0 | 4 |
| T3 | 10:45 | 38 | 14 | 9 | 91 | 0 | 0 | 5 |
| Final | 10:46 | 35 | 14 | 12 | 88 | 0 | 0 | 6 |

**Net movement (T0→Final):** ENQUEUED −11, EXECUTED +12, failed queue −12 (shrinking, not growing).

## Mechanism evidence

### A. Per-vehicle serialization

No recurrence of pre-#1519 17/17/11 burst. Three backlog vehicles (`c10351f8`, `a60c0749`, `19fedd4b`) show **one EXECUTED handoff per ~5 min tick** per target type, not concurrent fan-out.

### B. Reservation lifecycle

Reservations remained **0** across all ticks — acquire/process/release cycle completes without leaks. No `AUTHORITY_UNAVAILABLE` or ownership mismatch events post-deploy.

### C. Legacy PostgreSQL 54000 recovery

- Post-deploy `54000` / `index row size` log events: **0**
- Post-deploy failed jobs: **0**
- New assessment `idempotency_key` length: **146** (bounded digest format `lv-estimated-health:{vehicleId}:CAN…`, not oversized raw fingerprint)
- Duplicate `assess:` idempotency keys (7d): **0**

### D. Idempotency

Digest-based keys persisted; no duplicate canonical assessment rows for equivalent identity.

### E. Handoff convergence

ENQUEUED → EXECUTED progression observed every tick. No new ambiguous looping states.

## PKG-02 state (publication flag OFF)

- `publications_post_deploy` = **0** (no customer-facing publication persistence)
- PKG-02 handoff metadata `EXECUTED` = 6 (internal handoff tracking only; expected with reconciliation running while publication gate OFF)

## New-failure delta (post-deploy since 10:26:26Z)

| Class | Count |
|-------|-------|
| PostgreSQL 54000 | 0 |
| index row size exceeds maximum | 0 |
| text = uuid | 0 |
| operator does not exist | 0 |
| LOCK_CONTENTION (new) | 0 |
| AUTHORITY_UNAVAILABLE | 0 |
| reservation ownership mismatch | 0 |
| reservation refresh failure | 0 |
| HANDLER_FAILED (new) | 0 |
| post-deploy BullMQ failed jobs | 0 |
| unexpected publication persistence | 0 |

## Remaining risks (non-blocking for activation gate)

1. **Backlog not fully drained:** 35 ENQUEUED + 14 MISSING handoffs remain; convergence is forward-moving at ~1 batch/tick — full drain requires additional reconciliation cycles (expected).
2. **Historical failed queue depth:** 88 terminal BullMQ records remain (pre-deploy); depth is **decreasing**, not growing.
3. **Reconciliation throughput:** batch=25 limits repair rate; large fleets may need hours to fully converge — not a regression, operational capacity characteristic.

## Observability helper

Read-only snapshot script: `backend/scripts/ops/battery-v2-m3-0e-convergence-snapshot.sh` (extends M3 canary observability for M3.0E closure runs).
