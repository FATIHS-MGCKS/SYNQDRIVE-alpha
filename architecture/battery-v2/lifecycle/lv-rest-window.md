# LV Rest Window Lifecycle

**Epistemic status:** CONFIRMED (core FSM); full transition table not exhaustively listed

## Canonical operation

`LvRestWindowSessionArmingService.ensureLvRestWindowForFinalizedTrip()`

Single convergence point for:

- Primary trip-finalization path (via job handler)
- Reconciliation self-heal
- Observation bridge delegation

## FSM states (high level)

`LvRestWindowState` includes: `CANDIDATE`, `RESTING`, `INVALIDATED`, `COMPLETED`, `EXPIRED`, …

Events: `TRIP_ENDED`, `REST_SNAPSHOT`, invalidation events

**Anchor resolution:** `resolveLvRestWindowAnchorAt()` — `tripEndAt ?? lastActivityAt`

## Session DB record

- Type: `LV_REST_WINDOW`
- Status lifecycle: `PLANNED` → `ACTIVE` → `COMPLETED` (mapping via `mapSessionStatusToLvRestWindowState`)

## PLANNED (CANDIDATE) liveness

Reconciliation includes `PLANNED` sessions in REST target scheduling — unpromoted windows still reach evaluation (quality policy adjudicates MISSED/VALID).

**Evidence:** `battery-v2-reconciliation.service.ts` session status filter includes `PLANNED`

## Lookback limits

Anchors older than FSM max rest window (24h) are not armed (`anchor_outside_max_window`).

**Source:** `BATTERY_V2_LV_REST_SESSION_LIVENESS_2026-08-28.md` (architecture evidence)
