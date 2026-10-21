# Battery V2 — Signal & Lifecycle Authority

**Epistemic status:** CONFIRMED (bootstrap scope)

## Authority hierarchy (LV REST)

### 1. Trip end anchor — `BAT-V2-AUTH-TRIP-END-001`

When `tripEndAt` is present on the signal/event:

- Anchor = `trip.endTime` (authoritative finalized trip)
- Session idempotency: `lv-rest:{vehicleId}:{anchorMs}`
- `trip_id` on session should match finalized trip when explicitly supplied

**Code:** `resolveLvRestWindowAnchorAt()` returns `signal.tripEndAt ?? signal.lastActivityAt!`

**Conditional:** When only bridge path supplies `lastActivityAt` without authoritative trip, anchor authority degrades — see `BAT-V2-GAP-BRIDGE-FALLBACK-001`.

### 2. Opening gate — `BAT-V2-AUTH-LV-OPEN-001`

Function: `isEngineOffForRestWindowOpening()`

Used by: `canOpenRestWindowCandidate`, `isValidRestSnapshot`

Precedence (from #1393 architecture memo, verified in `lv-rest-window.policy.ts`):

1. Strong RUNNING: `ignitionOn === true` → reject
2. Strong OFF: `ignitionOn === false` + measured `speedKmh <= 0.5` → accept (outranks load proxy)
3. Ambiguous: conservative reject / proxy fallback

**Missing speed is not stationary evidence.**

### 3. Measurement quality — `BAT-V2-AUTH-LV-MEASURE-001`

Function: `isEngineOffForRest()`

Used by: REST target evaluation, `lv-rest-measurement-quality.ts`

Conservative: residual `engine_load` may still reject in-window observations even when opening gate would accept.

### 4. REST target evaluation authority — `BAT-V2-AUTH-REST-EVAL-001`

Canonical evaluation service decides VALID / MISSED / retryable pending — handler persists metadata only.

**No fabrication:** missing evidence → `MISSED` or `PENDING_EVALUATION`, not synthetic voltage.

## What is NOT authoritative

| Source | Role |
|--------|------|
| `provider_fetched_at` alone | Not rest-window anchor |
| Persisted target metadata `ENQUEUED` | Not proof of Bull job liveness |
| Legacy architecture memos | Evidence only — verify against code |
| Synthetic unit tests | Not production validation |

## Superseded authority notes

Pre-#1393: `engine_load > 5` proxy alone could block ICE opening at key-off — **superseded for opening** by `BAT-V2-DEC-1393-001`; measurement path unchanged.
