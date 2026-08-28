# Battery V2 Stage 1 — Post-Merge Deployment and Production Validation Plan (2026-08-28)

Scope: deployment verification, runtime observability, and the evidence contract for
validating the PR #1383 LV_REST_WINDOW session-liveness fix in production.

This record does **not** change Battery V2 behavior, evaluation policy, or feature
flags. Stage 1 is **not** validated by this record. Publication and readiness remain
disabled; Stage 2 is not started.

## 1. Deployed revision

| Item | Value |
|------|-------|
| `origin/main` | `5cc9c22032346c6d2df1738444520c93da8c72b5` |
| Deployed release | `20260828152525_v4994` |
| Previous release | `20260827203855_v4994` (`61a3578e8db4b6aa99d6b15bde7ad0c8a8a4de8a`) |
| PR #1383 merge commit | `f104f522ec22c37f22398eab997f229517748028` (squash) |

PR #1383 was squash-merged, so the PR-branch commits (`7da349d0`,
`a8cb7cd7`) are not themselves reachable from `main`. Content equivalence is the
inclusion proof: the squash diff `6c38d8c2..f104f522` is identical to the PR diff
(26 files, +1604/-20), and every source file touched by the PR is byte-identical
(same git blob) at PR head `a8cb7cd7` and at `origin/main`.

The only migration pending at deploy time came from #1385, not #1383:
`20260828120000_rpm_candidate_event_trip_reconciliation_index` — an additive
`CREATE INDEX IF NOT EXISTS` on `rpm_webhook_candidates(vehicle_id, observed_at)`.

## 2. Runtime proof that the merged code is live

`BatteryV2ReconciliationService` emits the `restSessions` counter only in the
post-#1383 code. Reconciliation ticks before the restart had no such key; the
first tick after the restart reported `restSessions: 6`.

Because `reconcileMissingLvRestSessions()` returns `0` immediately when
`isBatteryV2RestShadowEnabled()` is false, a non-zero counter is also runtime
proof that `BATTERY_V2_REST_SHADOW_ENABLED=true` is in effect.

## 3. Recovery path exercised on pre-deploy trips

The 24 h reconciliation lookback legitimately covers trips that completed before
the deployment. On the first post-deploy tick, recovery discovered 9 settled
`COMPLETED` trips, skipped 1 with an existing session for the canonical anchor and
2 whose policy profile does not support LV rest windows, and enqueued the
remaining 6 as `BATTERY_LV_REST_SESSION_OPEN`.

All 6 executed and were adjudicated by the canonical opener:

| Outcome | Count | Reason |
|---------|-------|--------|
| `not_eligible` | 5 | `active_trip` — the vehicle had already started a new trip |
| `not_eligible` | 1 | `engine_not_off` |

Observed properties: deterministic job identity
`lv-rest-open:{vehicleId}:{anchorMs}`, zero dead letters, zero duplicate sessions,
zero `P2002` escapes. Three `LOCK_CONTENTION` retries occurred where several
anchors for the same vehicle were enqueued in one tick; the per-vehicle lock
serialized them and the BullMQ retry policy absorbed them without exhausting
attempts.

## 4. Open finding — pre-existing eligibility gates limit recovery

Both rejection reasons above come from `canOpenRestWindowCandidate()` in
`lv-rest-window.policy.ts`, which predates #1383 and which the canonical opener
deliberately does not bypass. Two consequences matter for Stage 1 validation:

1. **`active_trip`** — recovery finds the missed trip (the #1383 hardening), but
   the FSM declines to open a historical window while the vehicle is driving
   again. Recovery is therefore effective only while the rest period is still
   current.
2. **`engine_not_off`** — when `vehicle_latest_states.source_timestamp` equals
   `trip.endTime` exactly, the opener treats that observation as real at-anchor
   evidence and uses its full context. If that final observation carries
   `engine_load > 5`, `isEngineOffForRest()` fails and no session opens. This is
   what happened to the original defect trip `61715ecd` (anchor
   `2026-08-28T12:01:35Z`, `is_ignition_on = false` but `engine_load = 10.19`).

The delayed observation-bridge path never hit case 2, because by the time a later
observation arrived the engine context had settled. The immediate path sees the
trip-end instant instead.

This is a policy/data-quality question, not a #1383 regression: the pre-#1383
bridge called the same gate with the same signal builder. It is recorded here as a
risk to the upcoming natural-trip validation and requires a separate decision. No
policy change was made.

## 5. Evidence contract for the qualifying natural trip

`backend/scripts/ops/battery-v2-lv-rest-liveness-evidence.ts` is read-only and
collects the full Section 10 evidence set. It derives job and session identities
with the same builders the runtime uses, so reported identities are runtime
identities.

```bash
cd /opt/synqdrive/current/backend
npx ts-node -r tsconfig-paths/register \
  scripts/ops/battery-v2-lv-rest-liveness-evidence.ts \
  --deployed-sha=5cc9c22032346c6d2df1738444520c93da8c72b5 \
  --since=2026-08-28T15:32:25Z
```

`--since` restricts the report to trips whose `endTime` is at or after the
deployment, which is what makes a trip "qualifying".

Reported per trip: org/vehicle/trip ids; `trip.startTime`/`endTime`/status;
detection state with `activeTripId`, `lastActivityAt`, `updatedAt`; the
`BATTERY_LV_REST_SESSION_OPEN` idempotency key, derived BullMQ job id and any
dead-letter row; the LV_REST_WINDOW session id, `tripId`, anchor, whether the
anchor equals `trip.endTime`, FSM state, status, quality, `createdAt` and a
duplicate count; per-target `scheduledFor`/`enqueuedAt`/`bullJobId`/status/
`completedAt` plus the persisted REST_60M / REST_6H measurement and its quality;
and `source_timestamp`, `provider_fetched_at`, last LIVE_VOLTAGE `observedAt` /
`receivedAt`, and the count of LIVE_VOLTAGE rows strictly after the anchor.

### Liveness verdict

The critical assertion is that the session exists without a post-anchor provider
observation. The script states this directly:

- `OBSERVATION_INDEPENDENT` — a session exists and zero LIVE_VOLTAGE rows exist
  after the anchor. This is the behavior #1383 exists to prove.
- `INCONCLUSIVE` — a session exists but post-anchor observations also exist, so
  the old path could have produced it too. Correct behavior, weaker evidence.
- `NO_SESSION` — no session for the canonical anchor.

### Acceptance for the qualifying trip

- session exists with `tripId` set to the finalized trip,
- `anchor == trip.endTime` exactly,
- session `idempotencyKey == lv-rest:{vehicleId}:{trip.endTime ms}`,
- duplicate count `0`,
- REST_60M and REST_6H each scheduled exactly once,
- no dead-letter row for the session-open identity.

Stage 1 may be considered for validation only after REST_60M and REST_6H both
execute naturally at `anchor + 60m` and `anchor + 6h` and produce measurements
adjudicated by existing policy. Time is not accelerated and no observation,
trip, session, or timestamp is fabricated.
