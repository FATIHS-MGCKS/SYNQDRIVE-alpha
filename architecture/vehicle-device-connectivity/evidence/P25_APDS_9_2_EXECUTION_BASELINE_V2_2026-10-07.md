# P25 APDS-9.2 — Actual-poll baseline execution semantics (V2)

| Field | Value |
|-------|-------|
| **Production base** | `3c12875dc464ac9a0693957c794c935d101dd43f` |
| **Invalid Run 1 T0** | `2026-10-07T13:41:51.992Z` |
| **Invalid run stopped** | `2026-10-07T14:39:56Z` (shadow OFF, cohort JSON unchanged) |
| **APDS_RUN_1_STATUS** | `INVALID_SUPERSEDED` |
| **Execution contract** | `P25_APD_SHADOW_EXECUTION_V2` |
| **Policies** | `P25_APD_B2_V1`, `P25_APD_B4_V1` (unchanged) |

## Containment (Phase 0)

- `WORKER_APD_SHADOW_ENABLED=false` on Production replicas `synqdrive` / `synqdrive-b`.
- Production SHA unchanged; **no** APDS-9.2 deploy in this task.
- Forensic rows from Run 1 preserved (no delete/patch).

## V2 semantics

- **Pre-queue** policy evaluation persists forensic rows only; **no** `lastAllowed` advance.
- **Durable** `lastAllowed` from latest V2 row per policy with `real_poll_status=SUCCESS`, advancing decision, `real_poll_completed_at` set.
- **Enqueue outcome** patched after `requestSnapshot()` (`ENQUEUED` / `RECOVERED_TERMINAL` / `COALESCED` / `QUEUE_FAILED` / `PERSIST_FAILED`).
- **Success** correlates `real_poll_id` = `DimoPollLog.id`; **failure** sets `real_poll_status=FAILURE` without success completion time.
- **Coalesced** opportunities never advance durable `lastAllowed` or claim covering poll identity.

## Forensic authority (APDS-9.1)

Run 1 invalidated: pre-queue `lastAllowed`, coalesced outcome gap, live sequence ≠ offline actual-poll replay.

## Next

Deploy APDS-9.2 RC from `3c12875dc` + delta only → migrate → shadow OFF smoke → new T0 (separate activation task).
