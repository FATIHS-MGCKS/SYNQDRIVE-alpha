# KS MS 661 — R12 POST-#1603 CUSUM retry / stop-boundary loss root-cause audit (2026-09-12)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R12-KS661-POST-1603-CUSUM-001 |
| **Source type** | PRODUCTION_OBSERVATION + CODE_TRACE (read-only Production) |
| **Audited production SHA** | `f6f5eaa3a9fd9525d10b5d0b8130e7ed42eeaa50` (release `20260911234818_v4994`) |
| **Repository main @ audit** | `49b07a023e39b5cec71015da749984e9af1b3e05` |
| **PR #1603 merge** | `9e3a5a19c` — confirmed ancestor of deployed SHA |
| **Deploy capturedAt (UTC)** | `2026-09-11T23:58:46Z` |
| **Audit observedAt (UTC)** | `2026-09-12T05:31:00Z` (terminal follow-up snapshot; bounded read-only) |
| **Vehicle** | KS MS 661 — `vehicleId` `c10351f8-b6a2-4258-947f-631aeaa6d359`; DIMO `tokenId` **187361** |
| **Canonical tripId** | `a05fa903-9ea7-4f20-8281-5cf185233c1a` |
| **Classification** | **FAIL_PENDING_FIX** — new POST-#1603 defect class; #1603 lock-order class **not reproduced** |

## Operator ground truth (Europe/Berlin CEST = UTC+02:00)

| Label | Local | UTC |
|-------|-------|-----|
| Driver start | ~06:31 | ~04:31 |
| Driver stop | ~07:02 | ~05:02 |

Forensic window: **`2026-09-12T04:15:00Z` → `2026-09-12T05:35:00Z`**

---

## Phase 0 — freeze identities

| Field | Value |
|-------|-------|
| CURRENT_MAIN_SHA | `49b07a023e39b5cec71015da749984e9af1b3e05` |
| PRODUCTION_SHA_A | `f6f5eaa3a9fd9525d10b5d0b8130e7ed42eeaa50` |
| PRODUCTION_SHA_B | `f6f5eaa3a9fd9525d10b5d0b8130e7ed42eeaa50` |
| SAME_SHA_ALL_REPLICAS | YES |
| PR_1603_PRESENT_IN_PRODUCTION_TREE | YES (`9e3a5a19c` ancestor of `f6f5eaa3a…`) |
| CANONICAL_TRIP_ID | `a05fa903-9ea7-4f20-8281-5cf185233c1a` |
| VEHICLE_ID | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| DIMO_TOKEN_ID | **187361** |
| DEPLOYED_BEFORE_DRIVE | YES (~4h40m before canonical start) |

---

## Phase 1 — complete FSM timeline (UTC)

| Event | UTC | Source |
|-------|-----|--------|
| Canonical trip start | 04:31:00 | Production trip row |
| Start recognized | 04:37:41 | PM2 / tracking |
| Last meaningful movement | 05:06:52.636 | `vehicle_trip_detection` |
| Provider stop boundary latched | 05:06:59 | Evidence `stopBoundaryAt` (pre-reopen) |
| POSSIBLE_END entered | 05:09:02.763 | PM2 `possible_end_entered` |
| PEC → END_VALIDATION scheduled | 05:11:03 | PM2 `end_validation_scheduled` |
| END_VALIDATION attempt 1 | 05:11:03.781 | Tracking run 290 ms |
| CUSUM result `cusum_still_ongoing` | 05:11:03 | EV `resultSummary.reason` |
| FSM → ACTIVE_TRIP (reopen) | 05:11:03 | EV `resultState` + transition |
| First ACTIVE_TRACKING after reopen | ~05:11:33 | `scheduleActiveTick` default 30s delay |
| First empty-core KEEP_OPEN w/ null boundary | ~05:11:33+ | ACTIVE empty-core path |
| Follow-up audit snapshots | 05:17, 05:26, 05:31 | Read-only re-checks |
| Expected ~05:20Z retry window | passed | No PEC/EV/CUSUM 2/3 |

### Mandatory timeline fields

```
POSSIBLE_END_FIRST_AT=2026-09-12T05:09:02.763Z
END_VALIDATION_FIRST_AT=2026-09-12T05:11:03.781Z
CUSUM_ATTEMPT_1_AT=2026-09-12T05:11:03.781Z
CUSUM_ATTEMPT_1_RESULT=cusum_still_ongoing
FSM_STATE_IMMEDIATELY_AFTER_ATTEMPT_1=ACTIVE_TRIP
POSSIBLE_END_AT_AFTER_ATTEMPT_1=NULL (DB column cleared by buildPossibleEndToActiveReset)
POSSIBLE_END_ENTERED_AT_AFTER_ATTEMPT_1=NULL (DB column cleared)
STOP_BOUNDARY_AFTER_ATTEMPT_1=EXPLICITLY_ABSENT (stripped from lastEvidenceSummary)
FIRST_ACTIVE_TRACKING_AFTER_ATTEMPT_1=~2026-09-12T05:11:33Z (30s default tick)
FIRST_STOP_BOUNDARY_NULL_AT=2026-09-12T05:11:03Z (same transition write)
FIRST_EMPTY_CORE_KEEP_OPEN_AT=~2026-09-12T05:11:33Z (first post-reopen ACTIVE empty-core tick)
```

Post-reopen ACTIVE tracking summaries (05:17–05:31 audits):

- `innerGateReason=vls_stale_provider_observation`
- `stopBoundaryAt=null` in run forensics
- `emptyCoreDeferralStreak` ≈ 11–14
- `nextCheckDelayMs` ≈ 524000–582000 (~8.7–9.7 min)
- No new `POSSIBLE_END` / `END_VALIDATION` / `FINALIZE`

---

## Phase 2 — `cusum_still_ongoing` return path (code trace)

### Handler chain

1. `processEndValidation` — `trip-detection-orchestration.service.ts` **3362–3402**
2. `decisionEngine.evaluateEndCandidate` → `shouldReopen=true`, `endMode='CUSUM_ONGOING'` — `trip-decision.engine.ts` **191–201**
3. `buildPossibleEndToActiveReset({ priorSummary })` — `trip-end-cycle-reset.ts` **234–255**
4. `stripEndCycleEvidenceForActiveReopen(priorSummary)` — deletes `stopBoundaryAt` — **205–212**, keys **14–40**
5. `cancelPendingEndCycleJobs` + `scheduleActiveTick` (no `schedulePossibleEndCheck`)

### Report fields

```
CUSUM_STILL_ONGOING_HANDLER_FILE=backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts
CUSUM_STILL_ONGOING_HANDLER_FUNCTION=processEndValidation
CUSUM_STILL_ONGOING_HANDLER_LINES=3362-3402

POST_CUSUM_STATE_TRANSITION_FILE=backend/src/modules/vehicle-intelligence/trips/trip-end-cycle-reset.ts
POST_CUSUM_STATE_TRANSITION_FUNCTION=buildPossibleEndToActiveReset
POST_CUSUM_STATE_TRANSITION_LINES=234-255

CLOCK_CLEAR_OR_PRESERVE_FILE=backend/src/modules/vehicle-intelligence/trips/trip-end-cycle-reset.ts
CLOCK_CLEAR_OR_PRESERVE_FUNCTION=buildPossibleEndToActiveReset + stripEndCycleEvidenceForActiveReopen
CLOCK_CLEAR_OR_PRESERVE_LINES=14-40, 205-255, 437-444 (clearPossibleEndClockFields)
```

**Clock/boundary actions on reopen:**

| Field | Action |
|-------|--------|
| `possibleEndAt` / `possibleEndEnteredAt` (DB) | Cleared via `clearPossibleEndClockFields()` |
| `endValidationAttempts` | Reset to **0** |
| `stopBoundaryAt` / `stopBoundarySource` | **Deleted** from evidence (`END_CYCLE_REOPEN_STRIP_KEYS`) |
| `stopBoundaryTrust` / `stopBoundaryEvidenceState` | **May remain** (not in strip list) — orphan metadata |
| `possibleEndEnteredAt` (evidence JSON) | Not in strip list — can remain stale in summary |
| End-cycle token | Cleared (`possibleEndEnteredAt` null → `resolveEndCycleToken` null) |
| Attempt 2 scheduling | **Not scheduled** — only `scheduleActiveTick` |

Contrast — **inconclusive** path (attempt counter preserved): `processEndValidation` **3475–3492** stays in `POSSIBLE_END`, sets `endValidationAttempts: completedAttempt`, calls `schedulePossibleEndCheck(TRIP_END_VALIDATION_RETRY_MS)`.

---

## Phase 3 — intended CUSUM retry contract (code + tests)

| Question | Answer | Proof |
|----------|--------|-------|
| A) Remain POSSIBLE_END on `cusum_still_ongoing`? | **NO** — transition to ACTIVE_TRIP | `processEndValidation` 3364–3383 |
| B) ACTIVE_TRIP with durable pending-end context? | **Partial** — strips end-cycle evidence including boundary; resets attempts | `buildPossibleEndToActiveReset` + `trip-end-cycle-reset.spec.ts` |
| C) PEC recreates candidate? | **YES** — only orchestrated retry path after reopen | PEC `3093–3131` schedules EV when `attempts < maxAttempts` while in POSSIBLE_END |
| D) Direct schedule attempt 2/3? | **NO** for CUSUM ongoing | Ongoing ≠ inconclusive; no PEC reschedule on reopen |
| E) Authoritative attempt counter | `vehicle_trip_detection.endValidationAttempts` | Incremented only while state stays POSSIBLE_END |
| F) Max attempts | `TRIP_END_VALIDATION_MAX_ATTEMPTS` default **3** | `trip-detection-orchestration.service.ts` 299–300, PEC 3094 |
| G) Retry delay | Inconclusive: `TRIP_END_VALIDATION_RETRY_MS` (60s); Reopen: ACTIVE tick 30s + empty-core backoff | 3491, 3385, 1985–2004 |
| H) Must survive attempt 1 for retry | Trusted `stopBoundaryAt` + provenance for empty-core re-admission under stale VLS | `assessBoundaryBackedEmptyCoreSilence` + `trip-fsm-r12-stop-boundary-end-liveness.spec.ts` K1 |

```
EXPECTED_POST_CUSUM_STATE=ACTIVE_TRIP
EXPECTED_RETRY_TRIGGER=empty-core ACTIVE tick → POSSIBLE_END re-entry → PEC → END_VALIDATION
EXPECTED_RETRY_DELAY=~30s first ACTIVE tick + empty-core backoff (exponential, max ~582s observed)
EXPECTED_MAX_ATTEMPTS=3 (while in POSSIBLE_END episode only)
EXPECTED_BOUNDARY_DURABILITY_CONTRACT=trusted stopBoundaryAt must remain readable for boundary-backed silence when VLS stale
EXPECTED_CLOCK_DURABILITY_CONTRACT=PE DB clocks cleared on reopen; retry requires new POSSIBLE_END episode
```

**Critical design tension:** R12 boundary-backed silence (`trip-empty-core-end-gate.ts` **277–284**) requires `stopBoundaryProvenance.boundaryAt`, but reopen **explicitly deletes** `stopBoundaryAt`. Unit test **2/10** (`trip-end-validation-r5.spec.ts` **243–271**) **expects** this strip — behavior is intentional in code/tests but **incompatible** with stale-VLS re-admission after physical stop.

---

## Phase 4 — stop-boundary loss WRITE/READ matrix

| FIELD | CANONICAL_WRITER | POST-CUSUM_WRITER | POST-CUSUM_READER | VALUE_BEFORE | VALUE_AFTER | LOSS | PROVEN_CAUSAL |
|-------|------------------|-------------------|-------------------|--------------|-------------|------|---------------|
| `stopBoundaryAt` | `mergeProviderStopBoundaryCandidate` (ACTIVE/empty-core) | `stripEndCycleEvidenceForActiveReopen` | `readActiveStopBoundaryAt`, `readStopBoundaryProvenance` | `2026-09-12T05:06:59Z` | **absent** | **EXPLICIT delete** | YES |
| `stopBoundarySource` | merge stop boundary | strip | provenance readers | `stationary_ignition_off_qualified` | absent | EXPLICIT | YES |
| `stopBoundaryTrust` | merge | **not stripped** | orphan — no boundaryAt | `true` | `true` (orphan) | INDIRECT unreadable | YES |
| `stopBoundaryEvidenceState` | merge | not stripped | forensics only | `QUALIFIED` | may remain | INDIRECT | partial |
| `possibleEndAt` | POSSIBLE_END transition | `clearPossibleEndClockFields` | PEC gates | `05:06:59Z` | NULL | EXPLICIT | YES |
| `possibleEndEnteredAt` | POSSIBLE_END transition | `clearPossibleEndClockFields` | `resolveEndCycleToken` | `05:09:02Z` | NULL | EXPLICIT | YES |
| `endValidationAttempts` | EV inconclusive / PEC | reset **0** on reopen | PEC `attempts < max` | 1 (in-flight) | **0** | EXPLICIT reset | YES |
| `endValidationScheduledAt` | PEC/EV | strip | stale guards | set | absent | EXPLICIT | YES |
| `emptyCoreDeferralStreak` | ACTIVE deferral | strip then re-increment | backoff | 0 at reopen | ~11–14 @ audit | INDIRECT | YES |
| `lastMeaningfulMovementAt` | ACTIVE/CUSUM | may update from CUSUM evidence | empty-core anchor | `05:06:52Z` | preserved unless CUSUM movement | preserved | NO (not root) |

**Loss mechanism classification:** **A — explicitly deleted** (`END_CYCLE_REOPEN_STRIP_KEYS` includes `stopBoundaryAt`). Not stale-provider rejection of an existing boundary — boundary removed before stale check runs.

---

## Phase 5 — ACTIVE_TRIP re-entry gate

First post-reopen ACTIVE empty-core path (`trip-detection-orchestration.service.ts` **1721–2028**):

1. `corePoints.length === 0`
2. `readActiveStopBoundaryAt(evidencePatch)` → **null** (stripped @ 05:11:03)
3. `readStopBoundaryProvenance(priorSummary)` → **null** (requires `stopBoundaryAt`)
4. `resolveProviderStopBoundaryCandidate` → **null** (VLS observation stale vs `TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS`)
5. `emptyCoreGateStopBoundary` → **null**
6. `assessSuccessfulEmptyCoreEndEligibility` → **KEEP_OPEN**, `innerGateReason=vls_stale_provider_observation`
7. `mergeEmptyCoreDeferral` + long backoff — **no POSSIBLE_END**

```
ACTIVE_REENTRY_FIRST_BLOCK_REASON=vls_stale_provider_observation (empty-core KEEP_OPEN — no trusted stopBoundaryAt for boundary-backed silence)
BOUNDARY_STILL_EXISTS_IN_EVIDENCE=NO (stopBoundaryAt explicitly stripped; orphan stopBoundaryTrust may remain)
BOUNDARY_READABLE_AFTER_CUSUM=NO (readStopBoundaryProvenance returns null without stopBoundaryAt)
BOUNDARY_TRUST_STILL_VALID=orphan metadata only — not consumable
BOUNDARY_REUSE_ALLOWED_BY_DESIGN=YES when stopBoundaryAt present (R12 K1 test) — but stripped on reopen
FIRST_CAUSAL_BREAK=processEndValidation cusum_still_ongoing → buildPossibleEndToActiveReset → stripEndCycleEvidenceForActiveReopen deletes stopBoundaryAt before ACTIVE empty-core can use boundary-backed silence
```

**Verdict:** Real bug is **(1) valid prior boundary destroyed** on reopen, not incorrect stale-data policy. Stale VLS policy is **correct** for fresh inference; durable trusted boundary **should** bypass via boundary-backed silence — but cannot after strip.

---

## Phase 6 — CUSUM attempt counter audit

```
CUSUM_ATTEMPT_COUNTER_PERSISTED=vehicle_trip_detection.endValidationAttempts (Prisma column)
CUSUM_ATTEMPT_COUNTER_STORAGE=DB column + forensics completedEndValidationAttempt in evidence (stripped on reopen)
CUSUM_ATTEMPT_COUNTER_SCOPE=per POSSIBLE_END episode (resets to 0 on ACTIVE reopen)
ATTEMPT_2_TRIGGER_CODE_PATH=processPossibleEndCheck while state=POSSIBLE_END && attempts < 3 → scheduleEndValidation (3093-3131)
ATTEMPT_2_BLOCKED_BY=FSM never re-enters POSSIBLE_END after reopen (empty-core gate KEEP_OPEN without boundary)
ATTEMPT_3_BLOCKED_BY=same as attempt 2
```

**Proof:** `maxAttempts=3` is **not guaranteed** by FSM orchestration after CUSUM ongoing reopen. It is **conditional** on reconstructing a POSSIBLE_END candidate. Production: attempt 1 completed in first episode; reopen reset counter; second episode never started → attempts 2–3 **impossible**.

Observed: `CUSUM_ATTEMPTS_TOTAL=1`, `persistedAttemptsAfterReset=0` in EV tracking run summary.

---

## Phase 7 — `end_time` vs FSM ONGOING

Writer: ACTIVE tick with core data — `trip-detection-orchestration.service.ts` **2376–2380**:

```typescript
// ONGOING endTime is provisional/worker-anchored — not canonical physical boundary (R1/P5-F01).
endTime: now,
```

| Field | Value |
|-------|-------|
| END_TIME_WRITER | `processActiveTracking` trip enrichment update |
| END_TIME_SEMANTICS | Rolling provisional cursor while ONGOING — last processed tick anchor |
| END_TIME_PROVISIONAL | YES |
| END_TIME_CAN_SEED_RETRY_BOUNDARY | NO — architecture explicitly excludes from canonical boundary (R1/P5-F01) |
| END_TIME_CURRENTLY_USED_BY_FSM | NO for stop boundary / POSSIBLE_END candidacy |
| END_TIME_CAUSAL_TO_BUG | NO — populated `05:07:33` while ONGOING is expected; not root cause |

Reference: `event-trip-association.domain.ts` — `end_time` is moving cursor, not completion signal.

---

## Phase 8 — failure class comparison

| Class | Reproduced? |
|-------|-------------|
| PRE-#1600 PE clock loss / null clocks while POSSIBLE_END | **NO** — clocks durable through first EV; cleared only on intentional reopen |
| POST-#1600 PRE-#1603 PEC lock → 0 EV tracking runs | **NO** — EV tracking run count **1**, lock misses **0** |
| POST-#1603 NEW | **YES** |

```
PRE_1600_FAILURE_REPRODUCED=NO
PRE_1603_LOCK_ORDER_FAILURE_REPRODUCED=NO
NEW_FAILURE_CLASS=POST-1603 CUSUM ongoing reopen strips trusted stop boundary → empty-core cannot re-admit POSSIBLE_END under stale VLS → CUSUM attempts 2–3 never reachable → trip stuck ONGOING
NEW_FAILURE_FIRST_BROKEN_LIFECYCLE_BOUNDARY=END_VALIDATION attempt 1 completion → buildPossibleEndToActiveReset → stripEndCycleEvidenceForActiveReopen (stopBoundaryAt deleted) while downstream retry contract requires boundary-backed empty-core re-entry
```

---

## Phase 9 — test coverage gap

| Coverage | Present? | Location |
|----------|----------|----------|
| Attempt 1 CUSUM ongoing reopen | YES | `trip-end-validation-r5.spec.ts` 243–271 |
| Attempt 2 after ongoing reopen | **NO** | — |
| Attempt 3 full chain | **NO** | — |
| Boundary durable after CUSUM reject | **NO** — test expects strip | `trip-end-cycle-reset.spec.ts` 25–49 |
| Full physical retry chain to RESTING | **NO** | — |
| Boundary-backed silence (unit) | YES | `trip-fsm-r12-stop-boundary-end-liveness.spec.ts` K1 |
| CUSUM ongoing + empty-core re-entry integration | **NO** | — |

```
EXISTING_TEST_COVERS_ATTEMPT_1=YES
EXISTING_TEST_COVERS_ATTEMPT_2=NO
EXISTING_TEST_COVERS_ATTEMPT_3=NO
EXISTING_TEST_COVERS_BOUNDARY_AFTER_CUSUM_REJECT=NO (inverse — asserts strip)
EXISTING_TEST_COVERS_FULL_PHYSICAL_RETRY_CHAIN=NO
TEST_GAP_PROVEN=YES
```

**Why CI allowed #1603 to pass:** #1603 tests lock-order + natural chain under **single** POSSIBLE_END episode. CUSUM ongoing reopen strip is **test-expected** behavior. No integration test spans: EV ongoing reopen → ACTIVE empty-core stale VLS → second PEC → FINALIZE.

### Minimal RED integration test design (DO NOT IMPLEMENT)

File (proposed): `trip-r12-cusum-reopen-boundary-retry.postgres-redis.integration.spec.ts`

1. Seed KS MS 661-shaped detection: trusted `stopBoundaryAt=05:06:59Z`, empty core stream, stale VLS timestamp.
2. Transition to POSSIBLE_END via empty-core (boundary-backed silence).
3. Run PEC → schedule EV.
4. Mock `evaluateEndCandidate` → `shouldReopen=true`, `endMode=CUSUM_ONGOING`, `appearsOngoing=true`.
5. Assert after EV: state ACTIVE_TRIP, **`readActiveStopBoundaryAt` still returns trusted boundary** (RED today: null).
6. Advance worker clock; run ACTIVE tick with stale VLS + empty core.
7. Assert POSSIBLE_END re-entry (RED today: KEEP_OPEN).
8. Run PEC attempt 2 path; eventually EV confirm → FINALIZE → RESTING; `activeTripId` cleared.
9. No manual repair / STALE_ONGOING.

---

## Phase 10 — root cause classification

```
PRIMARY_ROOT_CAUSE_CLASS=B BOUNDARY_DURABILITY_DEFECT
PRIMARY_ROOT_CAUSE_FILE=backend/src/modules/vehicle-intelligence/trips/trip-end-cycle-reset.ts
PRIMARY_ROOT_CAUSE_FUNCTION=stripEndCycleEvidenceForActiveReopen (via buildPossibleEndToActiveReset)
PRIMARY_ROOT_CAUSE_LINES=14-40, 205-212, 234-255
PRIMARY_ROOT_CAUSE_STATE=END_VALIDATION → ACTIVE_TRIP reopen after cusum_still_ongoing
PRIMARY_ROOT_CAUSE_PROVEN=YES
CONFIDENCE=HIGH

SECONDARY_ROOT_CAUSE_CLASS=C RETRY_ORCHESTRATION_DEFECT (maxAttempts=3 conditional on POSSIBLE_END re-entry; reopen does not preserve retry substrate)
```

---

## Phase 11 — fix implementation (PR #1617, NOT DEPLOYED)

### Narrow correction shipped in code

Introduced explicit **`ActiveReopenReason`**: `ACTIVITY_RESUMED` | `CUSUM_STILL_ONGOING`.

| Path | Caller | Boundary on reopen |
|------|--------|-------------------|
| **ACTIVITY_RESUMED** | PEC activity resumed (`processPossibleEndCheck`), `cancelPossibleEndForResumedActivity` | **Strip** (unchanged) |
| **CUSUM_STILL_ONGOING** | `processEndValidation` when `shouldReopen && endMode !== CUSUM_VALIDATED` | **Preserve** trusted provenance only |

**Implementation files:**

- `trip-end-cycle-reset.ts` — `resolveTrustedStopBoundaryForCusumRetry`, `stripEndCycleEvidenceForActiveReopen({ reopenReason, workerNow, lastMeaningfulMovementAt })`, `buildPossibleEndToActiveReset({ reopenReason })`
- `trip-detection-orchestration.service.ts` — pass `reopenReason: 'CUSUM_STILL_ONGOING'` on CUSUM reopen; `ACTIVITY_RESUMED` on movement resume paths

**Preservation guard (fail-closed):**

- Requires `readStopBoundaryProvenance` with `trust === true`
- Requires valid provider event timestamp vs `workerNow`
- **Rejects** preservation when `lastMeaningfulMovementAt` is strictly after boundary (credible post-boundary movement)
- Does **not** remove `stopBoundaryAt` / `stopBoundarySource` from global `END_CYCLE_REOPEN_STRIP_KEYS`

**Attempt counter semantics:** **UNCHANGED** — `endValidationAttempts` reset to `0` on reopen; attempt 2+ requires new `POSSIBLE_END` episode (R12 policy).

### RED / GREEN tests

| Test | Role |
|------|------|
| `trip-r12-cusum-ongoing-boundary-retry.spec.ts` | Unit contract: CUSUM preserve vs ACTIVITY strip vs movement invalidation |
| `trip-r12-cusum-ongoing-boundary-retry.postgres-redis.integration.spec.ts` | KS MS 661 POST-#1603 lifecycle: EV1 ongoing → boundary durable → POSSIBLE_END re-entry → EV2 → FINALIZE → RESTING |
| `trip-end-cycle-reset.spec.ts` | CUSUM preserve unit |
| `trip-end-validation-r5.spec.ts` | Updated test 2/10 for boundary preservation |

**BASE RED signature (pre-fix):** `stripEndCycleEvidenceForActiveReopen` deleted `stopBoundaryAt` on all reopen paths → `BASE_CUSUM_ONGOING_REOPEN_STRIPS_BOUNDARY=YES`, `BASE_REENTRY_TO_POSSIBLE_END=NO`.

**POST-FIX GREEN (integration):** asserts `POST_FIX_BOUNDARY_DURABLE=YES`, `POST_FIX_POSSIBLE_END_REENTRY=YES`, `POST_FIX_LATER_END_VALIDATION_REACHED=YES`, terminal COMPLETED + RESTING.

### #1603 non-regression

No changes to PEC→EV lock deferral, `TripTrackingHandoffLockContentionError`, or FINALIZE lock-miss paths. Existing `trip-r12-pec-ev-lock-collision.postgres-redis.integration.spec.ts` remains in CI matrix.

---

## Mandatory closure fields

```
R12_PHYSICAL_ACCEPTANCE_STATUS=FAIL_PENDING_FIX (Production drive unrepaired; fix in PR #1617 only)
PRODUCTION_MUTATED=NO
FAILED_TRIP_REPAIRED=NO
CODE_CHANGED=YES (PR #1617 fix branch)
DEPLOYED=NO
```

## Related evidence

- Initial acceptance: [KS_MS_661_R12_POST_1603_PHYSICAL_ACCEPTANCE_2026-09-12.md](KS_MS_661_R12_POST_1603_PHYSICAL_ACCEPTANCE_2026-09-12.md)
- #1603 lock-order (not reproduced): [KS_MS_661_R12_DISPATCH_GAP_ROOT_CAUSE_2026-09-11.md](KS_MS_661_R12_DISPATCH_GAP_ROOT_CAUSE_2026-09-11.md)
- R12 boundary-backed silence design: [TDL-DEC-R12-001_IMPLEMENTATION_2026-09-09.md](TDL-DEC-R12-001_IMPLEMENTATION_2026-09-09.md)
