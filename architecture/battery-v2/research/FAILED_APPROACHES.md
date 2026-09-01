# Battery V2 — Failed / Insufficient Approaches

Approaches that were **demonstrably insufficient** — not merely old code.

---

## BAT-V2-FAIL-OBS-ONLY-OPEN-001

| Field | Content |
|-------|---------|
| **Approach** | Rely on next `BATTERY_OBSERVATION_CLASSIFY` / bridge cycle after trip finalization to open LV Rest session |
| **WHY IT SEEMED REASONABLE** | Observations already drive FSM; trip det-state reaches RESTING shortly after anchor |
| **WHY IT FAILED** | Last observation at anchor with frozen `source_timestamp` → no post-anchor cycle → no `TRIP_ENDED` emission |
| **EVIDENCE** | `BAT-V2-EVID-PROD-61715ECD-001`, `BAT-V2-EVID-ARCH-LIVENESS-001` |
| **REPLACED BY** | `BAT-V2-DEC-1383-001` — trip-finalization enqueue + reconciliation |
| **LESSON** | Session **existence** must not depend on future telemetry timing |

---

## BAT-V2-FAIL-ENQUEUE-ONLY-RECON-001

| Field | Content |
|-------|---------|
| **Approach** | Reconciliation only re-enqueued `BATTERY_LV_REST_SESSION_OPEN` without direct session arming |
| **WHY IT SEEMED REASONABLE** | Durable job identity should eventually create session via handler |
| **WHY IT FAILED** | Lost jobs without DLQ left no session; deploy interrupt on trip `ea7696b6` |
| **EVIDENCE** | `BAT-V2-EVID-PROD-EA7696B6-001`, `BAT-V2-EVID-ARCH-PIPELINE-CLOSURE-001` |
| **REPLACED BY** | Direct `ensureLvRestWindowForFinalizedTrip()` in reconciliation (#1445) |
| **LESSON** | Reconciliation must mutate durable session state, not only re-enqueue |

---

## BAT-V2-FAIL-ENQ-META-LIVENESS-001

| Field | Content |
|-------|---------|
| **Approach** | Treat persisted `ENQUEUED` metadata as proof target is scheduled; skip reconciliation |
| **WHY IT SEEMED REASONABLE** | Metadata written at enqueue time; avoids duplicate jobs |
| **WHY IT FAILED** | Bull job could be missing (restart, Redis cleanup, abnormal removal) with no DLQ → permanent stall |
| **EVIDENCE** | Adversarial review #1445; `BAT-V2-EVID-TEST-ORPHAN-ENQ-001` |
| **REPLACED BY** | `hasLiveJob()` check + `PENDING_EVALUATION` recovery (`BAT-V2-LIVE-ORPHAN-ENQ-001`) |
| **LESSON** | Metadata state ≠ queue liveness |

---

## BAT-V2-FAIL-BULL-SHORT-RETRY-001

| Field | Content |
|-------|---------|
| **Approach** | Throw retryable error on missing REST evidence → BullMQ 3×5s retry |
| **WHY IT SEEMED REASONABLE** | Standard queue retry for transient failures |
| **WHY IT FAILED** | Legitimate evidence grace (~30m) >> Bull retry window (~15s) → DLQ / stuck ENQUEUED |
| **EVIDENCE** | Session `4d2bef5f` production shape; `BAT-V2-EVID-TEST-PEND-EVAL-001` |
| **REPLACED BY** | `PENDING_EVALUATION` + reconciliation cadence (`BAT-V2-LIVE-PEND-EVAL-001`) |
| **LESSON** | Evidence-waiting is a **persisted deferral** problem, not a short Bull retry problem |

---

## BAT-V2-FAIL-BULK-DLQ-001

| Field | Content |
|-------|---------|
| **Approach** | Scheduler bulk `clearReplayableDeadLetters()` before reconciliation |
| **WHY IT SEEMED REASONABLE** | Clear transient DLQ backlog automatically |
| **WHY IT FAILED** | Cleared DLQ before reconcile could rescue ENQUEUED+DLQ in same tick; destroyed per-entity semantics |
| **EVIDENCE** | #1445 adversarial review; `BAT-V2-EVID-ARCH-PIPELINE-CLOSURE-001` |
| **REPLACED BY** | Per-entity clear on `recovery: true` enqueue only |
| **LESSON** | DLQ recovery must be **entity-scoped** and coordinated with metadata state |

---

## BAT-V2-FAIL-HISTORICAL-REPAIR-SCAN-001

| Field | Content |
|-------|---------|
| **Approach** | Recurring reconciliation scan to repair historical trip-binding mis-matches |
| **WHY IT SEEMED REASONABLE** | Fixes production mis-bound sessions automatically |
| **WHY IT FAILED** | Violates no-backfill policy; masks creation-time bugs; tenant safety risk |
| **EVIDENCE** | #1445 scope constraints; removal from `reconcileAll()` |
| **REPLACED BY** | Creation-time invariant + P2002 race repair at mutation boundary |
| **LESSON** | Repair at **mutation boundary**, not periodic historical rewrite |
