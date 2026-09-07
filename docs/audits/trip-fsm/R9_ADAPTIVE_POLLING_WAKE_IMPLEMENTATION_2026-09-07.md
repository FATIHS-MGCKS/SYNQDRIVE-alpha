# IMPLEMENTATION ARTIFACT — PRE-CANONICAL

# Trip FSM R9 — Adaptive Polling / Provider Wake Model

**Date:** 2026-09-07  
**Branch:** `trip-fsm/r9-adaptive-polling-wake`  
**Baseline SHA:** `06095af91ce6f58366734a182ac5962830e858db`  
**R8 prerequisite merge SHA:** `6ea95124343e15e971220cb0c672239ac4b077d6` (verified ancestor)

## Mission

Close P4-F04 and P4-F05 by making DIMO Vehicle Trigger speed/ignition events the **primary low-latency wake path** for RESTING vehicles, while preserving activity-tier scheduler polling as durable fallback.

## Current polling graph (pre-R9 behavior documented)

```
@Interval(30s) DimoSnapshotScheduler
  → CONNECTED + AVAILABLE/RENTED + tokenId cohort
  → deriveSnapshotPollingTier()
  → hysteresis (applySnapshotPollingHysteresis)
  → isSnapshotPollDue(providerFetchedAt)
  → enqueue snapshot-{vehicleId}
```

**Tier defaults (unchanged in R9):**

| Tier | Default interval |
|------|------------------|
| ACTIVE_DRIVING | 30s |
| RECENTLY_ACTIVE | 60s |
| RESTING_STANDBY | 5m |
| LONG_IDLE | 30m |

**Movement promotion threshold:** `WORKER_SNAPSHOT_MOVEMENT_SPEED_KMH` default 3 km/h  
**Active demotion hold:** 90s

### Root cause P4-F04

LONG_IDLE due logic keys off `providerFetchedAt`. A vehicle that begins moving cannot promote itself until SynqDrive fetches new telemetry. A 30m LONG_IDLE interval can delay first live start candidate or miss short trips between polls.

### Root cause P4-F05

After trip completion, RESTING applies a fixed 120s complete cooldown before start scoring runs on ordinary scheduled snapshots.

## R9 integration seam

DIMO trigger subscriptions already include `speed` and `isIgnitionOn`. Pre-R9, `DimoWebhookController` only ACK/logged these signals.

## Wake-only authority rule

Webhooks MUST NOT:

- mutate Trip FSM directly
- write partial VLS for trip purposes
- call TripDecisionEngine lifecycle mutations

Webhooks MAY:

- authenticate/normalize provider events
- classify eligible snapshot wakes
- request coalesced canonical snapshot fetch via `SnapshotWakeCoordinatorService`

## Snapshot wake coordinator

Shared enqueue path for scheduler + provider wake:

- Single BullMQ jobId: `snapshot-{vehicleId}`
- Terminal job recycle (failed/completed)
- Coalesce while queued/active via Redis pending wake record
- Drain pending / schedule bounded `WAKE_PROBE` after job completion
- No parallel provider fetch for same vehicle

**Wake context shape:**

```typescript
{
  source: 'DIMO_TRIGGER',
  reason: 'SPEED_MOVEMENT' | 'IGNITION_ON',
  providerObservedAt: string | null,
  receivedAt: string,
  signalName: 'speed' | 'isIgnitionOn',
  probeGeneration: 0 | 1
}
```

## Trusted complete cooldown bypass

Preserves 120s / 30s / 60s smart cooldown for ordinary polling. Trusted provider wake may bypass **only** the complete cooldown early return when:

1. FSM = RESTING, `lastRestingReason === 'complete'`
2. Valid `providerObservedAt` strictly after `lastActivityAt` rest anchor
3. Wake + full snapshot pass R4 freshness / future-skew rules
4. Full snapshot `sourceTimestamp >= providerObservedAt`

Does **not** bypass scoring, confirmation, merge, or lifecycle ownership.

## Bounded probe

- Max one follow-up (`probeGeneration = 1`)
- Delay = `RECENTLY_ACTIVE` tier interval from `SnapshotPollingTierConfig` (default 60s)
- Triggered on stale monotonic skip, snapshot behind wake, trip-start eval error, or trusted wake without candidate

## Observability

- `synqdrive_trip_snapshot_wake_total{source,reason,outcome}`
- `synqdrive_trip_snapshot_wake_to_fetch_seconds`
- `synqdrive_trip_snapshot_wake_probe_total{reason,outcome}`
- `synqdrive_snapshot_polling_tier_vehicles{tier}`
- `synqdrive_snapshot_fast_tier_ratio`

R8 recognition metrics unchanged; wake provenance persisted in `startWake` on POSSIBLE_START evidence.

## Finding status

| Finding | Status |
|---------|--------|
| P4-F04 | RESOLVED_BY_R9 (architecture — production trigger coverage is R11) |
| P4-F05 | RESOLVED_BY_R9 |
| P5-F10 | PARTIALLY_RESOLVED_BY_R5 (R10) |

## Production safety

- **Deploy:** NOT PERFORMED
- **Production mutations:** NONE
- **DIMO provider mutations:** NONE
- **Schema migration:** NONE
- **DIMO_TRIGGER_BOOTSTRAP:** unchanged disabled-by-default

---

## R9A — Durable Wake Handoff / Bounded Probe Closure (2026-09-07)

Technical closure hardening on branch `trip-fsm/r9-adaptive-polling-wake` atop R9 commit `e2516573298cfa6f0431118e62dcec46add3f2a7`.

### Original defects closed

| ID | Defect | R9A fix |
|----|--------|---------|
| A | `afterSnapshotJob()` called `requestSnapshot()` while canonical `snapshot-{vehicleId}` job still **ACTIVE** → successor self-coalesced and never durably scheduled | Post-terminal **successor mailbox** (`synqdrive:snapshot-wake:successor:{vehicleId}`) + lightweight `snapshot.wake.handoff` queue job (`wake-handoff-{vehicleId}`) dispatches canonical enqueue only after terminal/active-safe window |
| B | `consumePendingWake()` GET→DEL before snapshot work → coalesced wake lost on race | **Durable pending mailbox** with versioned records; `claimPendingWakeForRun()` is read-only; `acknowledgePendingWake(version)` CAS-delete |
| C | SCHEDULED Bull job retained physical `origin` while logically processing provider wake → probe semantics refused | `resolveEffectiveWakeOrigin()` separates physical queue provenance from logical wake origin; `shouldRequestWakeProbe()` uses effective origin |
| D | Early provider fetch failure left `fsmState=null`; probe branch unreachable for PROVIDER_WAKE | Resolve FSM on fetch failure path; probe only when FSM **RESTING**; null FSM fail-closed |
| Obs | Scheduler tier occupancy counted `rawTier` before hysteresis | Occupancy + fast-tier ratio use **effectiveTier**; zero cohort resets all gauges to 0 |

### Durable mailbox ACK semantics

- Pending key: `synqdrive:snapshot-wake:pending:{vehicleId}` with monotonic `version`.
- Claim: read-only at snapshot start — no destructive pre-work ACK.
- ACK: Redis Lua compare-and-delete on exact `version` only.
- Newer wake during run bumps version → stale ACK no-ops (preserves newer wake).
- Queue enqueue failure retains pending wake for scheduler/recovery.

### Successor scheduling semantics

- Successor record stores `{ origin, wakeContext, notBeforeMs }` with TTL.
- `afterSnapshotJob()` never enqueues canonical snapshot directly (always handoff while current job still active in `finally`).
- Handoff processor waits until canonical job not active/queued, respects `notBeforeMs`, then calls `requestSnapshot()` (serialized canonical path only — **no provider fetch in handoff**).
- Generation bound preserved: probeGeneration 0 → max one generation-1 successor; generation 1 never schedules generation 2.
- Probe delay unchanged: `RECENTLY_ACTIVE` interval (default 60s).

### Crash / retry / multi-replica reasoning

- All wake/successor authority in Redis keys with TTL — survives worker crash.
- Handoff jobs use stable `wake-handoff-{vehicleId}` id with terminal recycle.
- CAS ACK prevents cross-replica stale deletion.
- COALESCED external wakes persist pending mailbox before returning.

### Tests (R9A matrix)

Focused suites under `snapshot-wake*`, `dimo-snapshot*`, `dimo-webhook*`, `snapshot-wake-r9a-orchestration`, scheduler metrics — **258 tests PASS** in targeted pattern run.

Gates: `npx tsc --noEmit` PASS, `npm run build` PASS, `npx prisma validate` PASS (with DATABASE_URL), `git diff --check` PASS.

### Finding status (R9A)

| Finding | Status |
|---------|--------|
| P4-F04 | **RESOLVED_BY_R9_ARCHITECTURE** (durable low-latency wake path — production trigger coverage remains R11) |
| P4-F05 | **RESOLVED_BY_R9** (orchestration-level trusted complete-cooldown bypass regression added) |

### Remaining dependency

- Production validation of wake latency, handoff dispatch under multi-replica PM2, and DIMO trigger subscription coverage — **R11 / pre-merge authority alignment gate** (not performed in R9A).

---

## R9B — Atomic Wake Mailbox & Handoff Rearm Closure (2026-09-07)

**Supersedes R9A “closed” claim for liveness/atomicity.** R9A correctly landed logical wake origin, early-fetch FSM resolution, effective-tier metrics, zero-cohort reset, cooldown bypass integration, and webhook regressions — but independent review found five remaining race classes. R9B closes them on commit atop R9A `5c6da72ac65dece509e318fdd7eea060f886dda1`.

### BEFORE (R9A residual defects)

| ID | Defect |
|----|--------|
| R9B-1 | Handoff queue self-coalescing: `dispatchSuccessorHandoff()` called `enqueueHandoffJob()` while **current** `wake-handoff-{vehicleId}` was ACTIVE → no-op → job completed with `removeOnComplete` → stranded successor Redis |
| R9B-2 | Post-coalesce persistence race: `requestSnapshot()` persisted pending wake **after** coalesce detection → wake could be stranded between snapshot terminal and mailbox write |
| R9B-3 | Pending mailbox GET/merge/SET in Node — write/write race under concurrent DIMO wakes |
| R9B-4 | Stale ACK preserved newer Redis value but did not guarantee near-term consumer for version N+1 |
| R9B-5 | Successor mailbox SET/DEL without version — stale dispatcher could delete newer successor |
| R9B-6 | Fresh trusted provider wake + caught-up FRESH snapshot + no POSSIBLE_START did not schedule bounded generation-1 probe |

### WHY

Wake path must be **durable-first** and **multi-replica safe**. Coalesce is an optimization, not persistence. Handoff deferral must re-arm the **current** Bull job (via `moveToDelayed` / typed defer), never duplicate stable jobIds while ACTIVE.

### CHANGE

| Area | R9B implementation |
|------|-------------------|
| Handoff rearm | `SnapshotWakeHandoffDeferError` + processor `moveToDelayed()`; no recursive `enqueueHandoffJob()` while ACTIVE |
| Durable-first | `persistPendingWakeAtomic()` **before** canonical enqueue when `wakeContext` present |
| Atomic pending merge | Redis Lua `ATOMIC_PENDING_WAKE_MERGE_SCRIPT` — monotonic version, latest providerObservedAt, receivedAt tie-break |
| Newer wake consumer | `reconcileOutstandingPendingWake()` after stale ACK / mid-run wake |
| Successor CAS | Versioned successor + Lua merge (earliest `notBeforeMs`, newest wake) + `acknowledgeSuccessorHandoff(version)` |
| Fresh no-candidate probe | `shouldRequestWakeProbe()` returns true for FRESH caught-up provider wake with no POSSIBLE_START |
| Handoff failure audit | All defer/failure paths retain successor + pending; success clears exact version only |

### VALIDATION

- Focused R9/R9A/R9B suites: **271 tests PASS** (`snapshot-wake*`, `dimo-snapshot*`, `dimo-webhook*`, handoff processor, orchestration cooldown)
- Race regressions: active handoff self-rearm, durable-first ordering, concurrent pending merge, stale ACK → successor, successor CAS, urgent notBefore, fresh no-candidate probe
- Gates: `npx tsc --noEmit` PASS, `npm run build` PASS, `npx prisma validate` PASS, `git diff --check` PASS

### NON_EFFECTS

- Polling tier intervals, movement threshold, cooldown durations unchanged
- Trip Start scoring, R4 freshness policy, Trip End, CUSUM/CH/merge rules unchanged
- R1–R8 behavior preserved
- No Production or DIMO provider mutations

### REMAINING GAPS

- Production validation under multi-replica PM2 and live DIMO trigger coverage — **pre-merge governance alignment** on PR #1553 after integrating latest `origin/main` (`architecture/trip-detection-lifecycle/` AUDIT_IN_PROGRESS)
- Optional: local BullMQ+Redis integration test (not required for R9B unit closure; deferred)

### Governance note (2026-09-07)

`origin/main` includes merged PR #1554: Trip Detection & Lifecycle registry status is **`AUDIT_IN_PROGRESS`** (not `NOT_STARTED`). R9B did not modify canonical authority files on this stale-base branch by policy.

---

## R9C — BullMQ Delay & Single-Probe Liveness Closure (2026-09-07)

**Supersedes R9B “closed” claim for BullMQ completion protocol, generation-1 requeue, fresh-no-candidate ordering, successor execution liveness, and waiting/changeDelay semantics.** R9B correctly landed durable-first pending persistence, atomic Redis merges, monotonic versions, versioned successor CAS, logical wake origin, provider-fetch failure handling, and effective-tier metrics — but independent review found four remaining runtime defects. R9C closes them on commit atop R9B `208852d945cc8d5aad263caa28fadb186d8cab37`.

### BEFORE (R9B residual defects)

| ID | Defect |
|----|--------|
| R9C-1 | Handoff processor called `job.moveToDelayed()` then **returned normally** — BullMQ 5.x requires `throw new DelayedError()` or worker may mark job completed/failed |
| R9C-2 | Generation-1 runs could still hit generic `claimedPendingWake && !probeEligible` successor branch → repeated generation-1 provider polls |
| R9C-3 | `afterSnapshotJob()` checked `wakeAlreadyCoveredBySnapshot()` **before** probe eligibility → fresh covered generation-0 + no POSSIBLE_START never received bounded 60s probe |
| R9C-4 | `dispatchSuccessorHandoff()` ignored `acknowledgeSuccessorHandoff(version) === false` after successful canonical enqueue → newer successor Redis could strand without dispatcher execution |
| R9C-5 | `enqueueHandoffJob()` called `changeDelay()` on **waiting** jobs — BullMQ API valid only for delayed jobs |

### WHY

Post-terminal wake handoff must obey BullMQ processor contracts, enforce **one probe per wake episode**, separate coverage from start-evidence decisions, and guarantee **execution liveness** for newer successor versions — not only CAS data preservation.

### CHANGE

| Area | R9C implementation |
|------|-------------------|
| BullMQ defer protocol | `SnapshotWakeHandoffProcessor`: `moveToDelayed(..., token)` then `throw new DelayedError()` |
| Generation-1 terminal guard | `finalizeGenerationOneEpisode()` runs **before** probe/coverage/successor branches; generation 1 never schedules another probe |
| Fresh no-candidate ordering | `shouldRequestWakeProbe()` evaluated before coverage short-circuit; covered + no candidate schedules exactly one generation-1 probe |
| Stale successor ACK rearm | `dispatchSuccessorHandoff()`: if exact-version ACK fails, reload latest successor + throw `SnapshotWakeHandoffDeferError` to re-arm current handoff job |
| Waiting vs delayed enqueue | `waiting` → return (already runnable); `delayed` → `changeDelay(remainingMs from notBeforeMs)` only |
| Successor merge tie-break | Equal `providerObservedAt` → newer `receivedAt` wins (aligned with pending mailbox Lua) |

### VALIDATION

- Focused R9/R9A/R9B/R9C suites + R1–R8 regression pattern runs
- New regressions: DelayedError protocol, generation-1 terminal matrix, fresh covered no-candidate `afterSnapshotJob`, null-timestamp probe bound, stale successor ACK rearm race, waiting/changeDelay semantics, successor receivedAt tie-break
- Gates: `npx tsc --noEmit`, `npm run build`, `npx prisma validate`, `git diff --check`
- **Production validation:** NOT PERFORMED

### NON_EFFECTS

- Polling tier intervals, movement threshold, cooldown durations unchanged
- Trip Start scoring, R4 freshness policy, Trip End, CUSUM/CH/merge rules unchanged
- R1–R8 behavior preserved
- No Production or DIMO provider mutations
- Canonical Trip Detection authority not updated on this stale-base technical commit

### REMAINING GAPS

- **Pre-merge governance alignment** on PR #1553: integrate latest `origin/main`, update `architecture/trip-detection-lifecycle/` authority, DIMO governance treatment
- Optional gated BullMQ+Redis integration test (`RUN_BULLMQ_WAKE_INTEGRATION=1`) — unit DelayedError + coordinator regressions sufficient for R9C technical closure

---

## R9D — Final Wake Delivery & Continuation Authority Seal (2026-09-07)

**Supersedes R9C “technical closure” claim for delivery liveness.** R9C correctly landed BullMQ `DelayedError` protocol, generation-1 terminal guard, fresh covered no-candidate probe ordering, stale successor ACK rearm, waiting/changeDelay separation, and successor receivedAt tie-break — but independent review found three remaining delivery defects. R9D closes them on commit atop R9C `700133e8f89a820ccc033fe2a3f094d6f2e92ee5`.

### BEFORE (R9C residual defects)

| ID | Defect |
|----|--------|
| R9D-A | **ACTIVE post-finalize coalesce tail race:** `requestSnapshot()` persisted pending wake then returned `COALESCED` against ACTIVE canonical job with **no** durable successor/handoff — wake stranded until LONG_IDLE |
| R9D-B | **Continuation bypass:** `reconcileOutstandingPendingWake()`, uncovered generation-0 successor, and dispatch paths could schedule provider fetches without current RESTING/eligibility re-check |
| R9D-C | **Redis READ_ERROR → null:** `loadSuccessorHandoff()` collapsed read failures into missing; handoff job could complete while successor still existed in Redis |
| R9D-D | **Missing real BullMQ+Redis integration evidence:** R9C referenced gated integration but did not ship runnable proof |

### WHY

Every accepted `wakeContext` coalesced against an ACTIVE canonical worker must still have a **provable future consumer**. Continuation authority must gate all start-wake successor execution. Liveness-critical Redis reads must never be treated as absent on transient failure.

### CHANGE

| Area | R9D implementation |
|------|-------------------|
| Coalesce delivery contract | `enqueueStableSnapshotJob()` classifies `COALESCED_QUEUED` vs `COALESCED_ACTIVE` vs `COALESCED_UNKNOWN`; ACTIVE/UNKNOWN coalesce schedules durable successor + stable handoff via `ensureCoalescedWakeConsumer()` |
| Continuation authority | `classifyWakeContinuation()` + `resolveWakeContinuation()` gate `scheduleDurableSuccessor()`, `reconcileOutstandingPendingWake()`, `dispatchSuccessorHandoff()`, probe scheduling, active-coalesce consumer |
| CAS-safe retirement | Obsolete start wakes retired via exact-version pending ACK only; failed CAS inspects newer record |
| Strict durable reads | `loadPendingWakeStrict()` / `loadSuccessorHandoffStrict()` return `FOUND \| MISSING \| READ_ERROR`; handoff defers on `READ_ERROR` |
| Integration gate | `RUN_BULLMQ_WAKE_INTEGRATION=1` + `npm run test:snapshot-wake:bullmq-integration` using `redis-memory-server` + real BullMQ worker |

### VALIDATION

- Focused R9/R9A/R9B/R9C/R9D suites + R1–R8 regression pattern runs
- Tail-race barrier test (empty finalize → ACTIVE coalesce → durable successor → post-terminal dispatch)
- Continuation matrix + Redis READ_ERROR matrix + duplicate wake cardinality
- Real BullMQ integration: `moveToDelayed` + `DelayedError` → DELAYED (not COMPLETED) → terminal → dispatch + exact ACK clear
- Gates: `npx tsc --noEmit`, `npm run build`, `npx prisma validate`, `git diff --check`
- **Production validation:** NOT PERFORMED

### NON_EFFECTS

- Polling tier intervals, movement threshold, cooldown durations unchanged
- Trip Start scoring, R4 freshness policy, Trip End, CUSUM/CH/merge rules unchanged
- R1–R8 behavior preserved (R9C passes preserved)
- No Production or DIMO provider mutations
- Canonical Trip Detection authority not updated on this stale-base technical commit

### REMAINING PRODUCTION DEPENDENCIES

- **Pre-merge governance alignment** on PR #1553: integrate latest `origin/main`, update `architecture/trip-detection-lifecycle/`, DIMO governance treatment, registry validators
- Live multi-replica PM2 wake latency + DIMO trigger subscription coverage — **R11 / governance gate** (not performed in R9D)

---

## R9F — Unknown Continuation Retry Completeness Seal (2026-09-07)

**Supersedes R9E “technical closure” for UNKNOWN paths outside active handoff dispatch.** R9E correctly sealed UNKNOWN defer in `dispatchSuccessorHandoff()`, ACTIVE coalesce UNKNOWN retry, obsolete successor CAS, and bounded pending retirement — but independent review found UNKNOWN continuation in `afterSnapshotJob()`, `reconcileOutstandingPendingWake()`, and `scheduleDurableSuccessor()` still preserved pending without always establishing a bounded retry handoff.

### BEFORE

| Gap | Behavior |
|-----|----------|
| R9F-A | `handleNonEligibleWakeContinuation(UNKNOWN)` returned without scheduling retry handoff |
| R9F-B | `scheduleDurableSuccessor(UNKNOWN)` returned `CONTINUATION_BLOCKED` with no execution path |
| R9F-C | `scheduleUnknownContinuationRetryHandoff()` swallowed enqueue failures as silent success |
| R9F-D | Stale obsolete classification could target latest pending version instead of exact episode version |

### CHANGE

| Area | R9F implementation |
|------|-------------------|
| UNKNOWN policy | Generation-0 wakes preserve pending/successor and schedule `scheduleUnknownContinuationRetryHandoff()` consistently across afterSnapshot/reconcile/scheduleDurable/gen1-stale-ACK paths |
| Explicit outcomes | `HANDOFF_SCHEDULED` / `QUEUE_FAILED` / `PERSIST_FAILED`; `scheduleDurableSuccessor` returns `UNKNOWN_RETRY_SCHEDULED` without pending ACK |
| Exact-version association | `resolveGenerationZeroRetryWake()` + bounded `retireExactPendingWakeBounded()` preserve R9E CAS semantics |
| Integration | Extended BullMQ test: reconcile UNKNOWN → delayed handoff → DB recovery → canonical dispatch |

### VALIDATION

- R9F matrix A–H + all prior R9–R9E suites remain green
- BullMQ integration **4/4 PASS**
- **Production validation:** NOT PERFORMED

### NON_EFFECTS

- No polling/scoring/Trip End changes; all verified R9E behavior preserved
- No Production or DIMO provider mutations

### REMAINING PRODUCTION DEPENDENCIES

- Pre-merge governance alignment on PR #1553 (integrate `origin/main`, update canonical authority)

---

## R9E — Continuation Unknown & Obsolete CAS Final Seal (2026-09-07)

**Supersedes R9D “technical closure” claim for continuation UNKNOWN and obsolete CAS liveness.** R9D correctly landed ACTIVE coalesce delivery, continuation classifier, strict durable reads, and real BullMQ integration — but independent review found four remaining narrow races. R9E closes them on commit atop R9D `febad3e246262e97276466f8381d956591428b69`.

### BEFORE (R9D residual defects)

| ID | Defect |
|----|--------|
| R9E-A | `dispatchSuccessorHandoff()` returned **success** on `continuation=UNKNOWN` while successor Redis remained — handoff job completed with no bounded dispatcher |
| R9E-B | `ensureCoalescedWakeConsumer()` on ACTIVE coalesce + UNKNOWN left pending wake without lightweight retry handoff |
| R9E-C | Obsolete successor retirement ignored stale ACK — newer successor version could strand after handoff completion |
| R9E-D | `scheduleDurableSuccessor()` / `handleNonEligibleWakeContinuation()` could ACK **latest** pending under **stale** obsolete classification |
| R9E-E | Unbounded recursive pending retirement when CAS ACK repeatedly failed |

### CHANGE

| Area | R9E implementation |
|------|-------------------|
| UNKNOWN dispatch | `continuation_unknown` → `SnapshotWakeHandoffDeferError` + BullMQ DelayedError rearm; successor preserved |
| UNKNOWN ACTIVE coalesce | `scheduleUnknownContinuationRetryHandoff()` persists successor + stable handoff without provider fetch |
| Obsolete successor CAS | `retireExactSuccessorWakeBounded()` — ACK exact version, reload/reclassify on CAS miss, rearm on eligible newer |
| Exact pending retirement | `retireExactPendingWakeBounded()` — max 3 iterations, reclassify before each ACK, never apply stale classification to newer version |
| Centralized outcomes | `DurableRetirementOutcome` helper semantics shared by pending/successor retirement paths |

### VALIDATION

- R9E matrix A–H regressions (UNKNOWN defer, ACTIVE coalesce retry, obsolete stale ACK, newer wake preservation, bounded ACK failure, READ_ERROR rearm)
- Extended BullMQ integration: UNKNOWN continuation → DELAYED → DB recovery → dispatch + ACK clear
- All prior R9–R9D focused suites + R1–R8 regressions remain green
- **Production validation:** NOT PERFORMED

### NON_EFFECTS

- No polling/tier/scoring/Trip End/CUSUM/merge changes
- All verified R9D behavior preserved
- No Production or DIMO provider mutations
## R9 PRE-MERGE GOVERNANCE ALIGNMENT (2026-09-07)

### Integration

| Field | Value |
|-------|-------|
| **PRE_ALIGNMENT_HEAD** | `5db173db86b15ecb8bfb44df3ad5c773505fead0` |
| **INTEGRATED_ORIGIN_MAIN** | `a4725514866a03099e7a1e485ccf0b7ea37d6fec` |
| **POST_REBASE_HEAD** | `1186e9d23a9b07e24da17b06a72f2614038db77a` |
| **Method** | Clean rebase onto `origin/main` (includes #1554 canonical authority) |

### #1554 authority reconciliation

- Canonical authority path: `architecture/trip-detection-lifecycle/` (not recreated)
- Audit evidence preserved verbatim: `docs/audits/trip-fsm/` (this file)
- Phase 4 partial graph/decisions/validators added under canonical authority

### Canonical authority files updated

`README.md`, `CURRENT_STATE.md`, `AUDIT_MANIFEST.md`, `AGENT_CONTRACT.md`, `KNOWLEDGE_GRAPH.md`, `graph/*`, `decisions/DECISION_REGISTER.md`, `evidence/EVIDENCE_INDEX.md`, `contradictions/KNOWLEDGE_GAPS.md`, `research/CHANGE_LEDGER.md`, `research/FAILED_APPROACHES.md`, `research/OPEN_HYPOTHESES.md`, `architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`

### DIMO governance determination

**Decision:** PR #1553 does **not** require DIMO Integration `NOT_STARTED` → `AUDIT_IN_PROGRESS` bootstrap before merge.

**Rule/evidence:** [`MODULE_INVENTORY_DISCOVERY_2026-09-06.md`](../../architecture/MODULE_INVENTORY_DISCOVERY_2026-09-06.md) retains separate modules — Trip Detection owns FSM/snapshot-start path; DIMO Integration owns provider gateway. R9 changes to `dimo-webhook.controller.ts` / `dimo.module.ts` are **Trip Detection start-liveness ingress wiring** on an existing webhook surface (delegate to `SnapshotWakeIntakeService`), not a new provider auth/telemetry/segment/trigger-registration architecture. Cross-module obligation satisfied by documenting affected paths in Trip Detection authority + `TDL-CX-006`. Dedicated DIMO Integration audit remains deferred until a DIMO-specific workstream.

### Registry status

| Module | Before | After |
|--------|--------|-------|
| Trip Detection & Lifecycle | `AUDIT_IN_PROGRESS` | `AUDIT_IN_PROGRESS` |
| DIMO Integration | `NOT_STARTED` | `NOT_STARTED` |

### Validators run

- `bash architecture/scripts/validate-module-registry.sh` — PASS
- `bash architecture/trip-detection-lifecycle/scripts/validate-graph.sh` — PASS
- `git diff --check` — PASS

### Technical regressions (post-main integration)

- R9 focused tests — PASS
- R1–R8 relevant regressions — PASS
- `npm run test:snapshot-wake:bullmq-integration` — 4/4 PASS
- `npx tsc --noEmit`, `npm run build`, `npx prisma validate` — PASS

### Production status

- **No fresh Production audit** in this package
- Prior baseline: `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` @ `2026-09-06T23:47:41Z`
- R8/R9 **NOT_ON_PRODUCTION** at observed release
- **No Production or DIMO provider mutations**

### Remaining dependency

- **R11** — Production/canary validation after deploy (blocks `AUTHORITY_ACTIVE`, not PR merge governance)
