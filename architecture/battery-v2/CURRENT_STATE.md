# Battery V2 — Current State Snapshot

**Snapshot date:** 2026-09-01  
**Knowledge maturity:** Bootstrap — partial reconstruction from code + recent architecture memos + tests  
**Production deploy note:** Stage 1 pipeline defect closure (#1445) merged 2026-08-30; production deploy verified 2026-08-31 (`bfcf9ddb7`+ on VPS). Post-fix natural-trip validation remains **ongoing**.

## Executive summary

Battery V2 Stage 1 operates in **shadow mode** (`BATTERY_V2_REST_SHADOW_ENABLED` may be true in production; publication and readiness default **false** in `.env.example`). The strongest reconstructed areas are:

1. LV Rest Window session opening convergence (trip-finalization → arming → reconciliation)
2. ICE opening vs measurement policy split (#1393)
3. REST target asynchronous liveness (metadata vs Bull job vs DLQ vs reconciliation)
4. Canonical trip-end anchor and session identity when authoritative finalized trip is known

Large areas remain **not yet reconstructed** (HV authority, full consumer/read model, all legacy compatibility paths).

## Confidence matrix

| Area | Maturity | Epistemic status | Notes |
|------|----------|------------------|-------|
| Trip-end anchor authority | High | CONFIRMED | `resolveLvRestWindowAnchorAt()` prefers `tripEndAt` |
| Session opening convergence | High | CONFIRMED | Single arming operation; multiple entry paths |
| ICE opening vs measurement split | High | CONFIRMED | Separate policy functions in code |
| REST target metadata FSM | Medium-high | CONFIRMED | Statuses in `lv-rest-window-target.metadata.ts` |
| Orphaned ENQUEUED recovery | Medium-high | CONFIRMED | `hasLiveJob()` + `PENDING_EVALUATION` path |
| PENDING_EVALUATION deferral | Medium-high | CONFIRMED | Handler + reconciliation reschedule |
| Trip lifecycle isolation | Medium | CONFIRMED | Try/catch around battery enqueue at trip finalize |
| Orphaned RUNNING target | Low | GAP | Explicitly **not** closed by #1445 |
| SKIPPED REST target semantics | Low | UNKNOWN | Status exists; full semantics not reconstructed |
| Bridge fallback without finalized trip | Low | UNKNOWN | ±120s fallback documented; not fully traced |
| HV / PHEV authority model | None | UNKNOWN | Not bootstrapped |
| Publication / readiness layers | Low | INFERRED | Flags exist; consumers not fully mapped |
| Legacy `battery_features` bridge | Low | PARTIAL | Reconciliation bridge exists; full legacy model not reconstructed |

## Feature flags (verified in code template)

| Flag | `.env.example` default | Role |
|------|------------------------|------|
| `BATTERY_V2_REST_SHADOW_ENABLED` | `false` | Gates shadow REST pipeline paths |
| `BATTERY_V2_PUBLICATION_ENABLED` | `false` | Publication layer (not authoritative in Stage 1) |
| `BATTERY_V2_READINESS_ENABLED` | `false` | Readiness layer (not authoritative in Stage 1) |

Production may override defaults via `backend.env` — treat runtime flag values as **environment evidence**, not code defaults.

## Strong-confidence lifecycle (reconstructed)

```
Trip finalization (authoritative COMPLETED trip)
  → trip.endTime anchor
  → LV_REST_WINDOW session arming / BATTERY_LV_REST_SESSION_OPEN job
  → REST_60M / REST_6H target scheduling (metadata + Bull job)
  → LIVE_VOLTAGE evidence in window
  → BATTERY_REST_TARGET_EVALUATE
  → BatteryMeasurement (VALID / MISSED / etc.)
  → (shadow metrics; publication/readiness not authoritative)
```

Parts after assessment → publication are **not yet reconstructed** in this bootstrap.

## Unresolved contradictions

None recorded yet in bootstrap. See [contradictions/OPEN_CONTRADICTIONS.md](./contradictions/OPEN_CONTRADICTIONS.md).

## Major open gaps

| ID | Summary |
|----|---------|
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | `RUNNING` metadata without live Bull job after handler crash |
| `BAT-V2-GAP-SKIPPED-REST-001` | `SKIPPED` REST target semantics |
| `BAT-V2-GAP-BRIDGE-FALLBACK-001` | Bridge trip resolution when no authoritative finalized trip |
| `BAT-V2-GAP-HV-AUTHORITY-001` | HV/PHEV signal and assessment authority |
| `BAT-V2-GAP-CONSUMER-READ-001` | Which UI/API surfaces consume canonical vs legacy data |

## Latest production-validated evidence (historical)

| ID | Summary | Date |
|----|---------|------|
| `BAT-V2-EVID-PROD-EA7696B6-001` | Missing LV session after trip finalize + deploy interrupt | 2026-08-30 |
| `BAT-V2-EVID-PROD-61715ECD-001` | ICE opening rejection at trip end (pre-#1393) | 2026-08-28 |
| `BAT-V2-EVID-PROD-4D2BEF5F-001` | Stuck REST ENQUEUED + PROVIDER_UNAVAILABLE DLQ | 2026-08-30 |

Post-#1445 production validation of natural trips: **UNKNOWN** at bootstrap time.

## Explicit non-claims

Battery V2 Stage 1 is **not finished**. This snapshot does **not** assert:

- perfect liveness in all crash/restart scenarios
- historical data repair or backfill
- Stage 2 activation
- publication/readiness correctness
- complete health-model authority for all powertrains
