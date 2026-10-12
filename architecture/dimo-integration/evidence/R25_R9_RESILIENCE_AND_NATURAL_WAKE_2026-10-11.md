# R2.5 — Resilience engineering + natural wake observation

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-R25-RESILIENCE-001` |
| **Production SHA** | `92d3d61133ad524ae6d328dd0f603c525b0bd178` |
| **R2.4 recovery UTC** | `2026-10-11T20:40:46Z` (speed), `20:40:55Z` (ignition) |
| **Observation class** | **`EARLY_OBSERVATION`** (<24h; not T+24h audit) |

## 1. Provider health (GET @ ~20:47Z)

| Check | Speed | Ignition |
|-------|-------|----------|
| status | **enabled** | **enabled** |
| failureCount | **0** | **0** |
| subscribers | 4 (186946, 187361, 187784, 192922) | same |
| 187336 | **0** links | **0** |
| 190497 | no R9 | no R9 |

**R24_RECOVERY_STILL_HEALTHY:** **YES** (within early window).

## 2. Natural traffic (post-recovery)

| Stage | Evidence | Result |
|-------|----------|--------|
| **A** Subscription | Provider GET | **YES** |
| **B** DIMO trigger fire | nginx `DIMO-Webhook/1.0` POST **200** @ 20:41–20:47 UTC (15 lines in access log for hour 20) | **YES** |
| **C** SynqDrive ingress | `DimoWebhookController` log `Received DIMO webhook: type=dimo.trigger, tokenId=187361` @ 20:41:38+ UTC | **YES** |
| **D** Wake → snapshot / trip | `DimoSnapshotScheduler` recovery log @ 20:41:39; no explicit `wakeOutcome` in sampled lines; mixed 403 snapshot for unrelated vehicle | **PARTIAL** |

**NATURAL_SPEED_EVENT_OBSERVED:** **INFERRED** (paired 75/72 byte responses; metric not in nginx line).  
**NATURAL_IGNITION_EVENT_OBSERVED:** **INFERRED** (dual POST pattern).  
**WAKE_ADMISSION_OBSERVED:** **NOT_EXPLICIT_IN_LOGS**  
**WAKE_TO_SNAPSHOT_VERIFIED:** **PARTIAL** (scheduler activity after webhook; full trip FSM not proven).

**END_TO_END_VERIFICATION:** **`PARTIAL_EARLY_OBSERVATION`** — not `PENDING_NATURAL_TRAFFIC` only; ingress + controller confirmed for cohort vehicle **187361**.

Correlate: nginx `20:41:38` 200×2 ↔ PM2 `tokenId=187361` receive.

## 3. Deployment root cause (unchanged)

VO5C joint orchestrator **global nginx 503** during Phase 1 → DIMO failureCount → `failed`. **Not fixed in production.** See `R9_DEPLOYMENT_AVAILABILITY_RCA.md`.

## 4. Engineering deliverables (offline)

| Item | Location |
|------|----------|
| Chosen design A+B | `research/R25_WEBHOOK_SAFE_DEPLOY_AND_MONITORING.md` |
| nginx webhook-safe snippet lib | `backend/scripts/ops/lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh` |
| Circuit monitor | `backend/scripts/ops/r9-r25-circuit-monitor.mjs` |
| Failure matrix | design doc § matrix |

**MONITORING_PRODUCTION_ACTIVE:** **NO**

## 5. R2.4 JSON hygiene

Invalid prefix `MODE=READ_ONLY` removed from sanitized JSON; console captures preserved as `*.console-capture.txt` per file.

## 6. Local 187336 (separate workstream)

| Signal | State |
|--------|-------|
| registry | ACTIVE |
| DIMO consent | ACTIVE |
| Provider webhooks | **0** (R2.3) |
| Privacy/billing risk | **OPEN** — VO5C offboard + P4A/MFA pending |

## 7. T+24h follow-up (read-only)

1. Run `r9-r25-circuit-monitor.mjs` (cron candidate; needs owner activation).
2. Re-run `r9-post-get-audit.mjs` — failureCount delta.
3. nginx aggregate `r22-nginx-dimo-webhook-aggregate.sh` for 2026-10-12.
4. PM2 grep `DimoWebhookController` + SnapshotWake outcomes for cohort tokenIds.
5. Compare against **187336** still 0 subs.

## Owner approvals still required

- Merge engineering PR + **VPS orchestrator** adoption of webhook-safe maintenance snippet.
- Production cron for circuit monitor.
- VO5C local offboard for 187336 (separate).
