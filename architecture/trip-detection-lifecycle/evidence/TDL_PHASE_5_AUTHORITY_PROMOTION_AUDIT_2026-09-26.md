# TDL Phase 5 — `AUTHORITY_ACTIVE` promotion gate + full FSM graph completion (read-only)

| Field | Value |
|-------|-------|
| **Evidence IDs** | **TDL-EVID-PHASE5-FSM-CODE-001** (CURRENT_CODE — transition matrix, execution graph, writer graph) · **TDL-EVID-PHASE5-PROD-BASELINE-001** (PRODUCTION_OBSERVATION — live baseline re-observation) |
| **Observed at (UTC)** | `2026-09-26T12:22Z` – `2026-09-26T12:27Z` |
| **Standard** | [`MODULE_AUTHORITY_STANDARD.md`](../../MODULE_AUTHORITY_STANDARD.md) §6 promotion gate + §8 Gate A |
| **Audit mode** | READ_ONLY (repository + Production) |
| **Verdict** | **`PROMOTE_AUTHORITY_ACTIVE`** |

---

## Phase 0 — Anchors

| Key | Value |
|-----|-------|
| **CURRENT_MAIN_SHA** (audit repository) | `0b44b146fe82997a04940d7e03c4f8c198490501` (`origin/main` @ task start; merge of PR #1793) |
| **LIVE_PRODUCTION_SHA** | `2b54a357854c9d44f638ee857f72936967c04992` |
| **LIVE_RELEASE_ID** | `20260926094359_v4994` (`/opt/synqdrive/current` → `/opt/synqdrive/releases/20260926094359_v4994`) |
| **PRODUCTION_ACCESS_STATUS** | **`VERIFIED_READ_ONLY`** (SSH `synqdrive-admin`; `readlink`, `git rev-parse`, `pm2 ls`, env `grep`, read-only SQL, Redis `LLEN`/`ZCARD`/`HMGET`/`SCAN`) |
| **Last TDL production anchor (task / prior OQ evidence)** | `8a1d9c6586cbddc41bb6c94870f9d51226d71aa2` @ `20260925182907_v4994` |

**Ancestry:**

| Relation | Result |
|----------|--------|
| `8a1d9c658…` ancestor of live `2b54a357…` | **YES** |
| live `2b54a357…` ancestor of `origin/main` `0b44b146…` | **YES** |
| Runtime delta `2b54a357…` → `0b44b146…` (`backend/`, `frontend/`) | **NONE** — 5 commits, all `architecture/` docs (Battery V2 F2/F3 records, TDL OQ-010, TDL OQ-005) |
| Runtime delta `8a1d9c658…` → `2b54a357…` in TDL scope | **NONE** — 64 backend files changed, all non-TDL: Battery V2 longitudinal/rest-session/HV charge session, charging stations, ERD recharge projection/provenance, `config/`, `shared/ops/load-backend-env*`; `trip-metrics.service.ts` diff adds **only** Battery V2 counters |

**Conclusion:** Live Production contains **newer non-TDL commits only** relative to the last TDL production anchor. No TDL runtime delta requires a separate audit. Repository and Production are recorded separately; for TDL runtime code they are **identical** (`main` adds docs only).

Marker check in the live Production tree (`git grep` @ `2b54a357…`): `resolveEndCycleToken` (R10), `pendingFinalizeCycleToken` (R10), `readEmptyCoreDeferralStreak` / `providerSilenceCandidateAt` (R11/R12), `ensurePossibleEndClockDurability` (#1600), `TripTrackingHandoffLockContentionError`, `resolveChSkipResumeRevalidationHandoffReason` (#1674), `CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS` (QS V1), `SnapshotWakeIntakeService` (R9), `buildMidGapSplitActiveFsmExtras` (R6/QS) — **all present**.

---

## Phase 1 — Standard 1.0 core file gate

All 20 mandatory files exist:

`README.md` · `AUDIT_MANIFEST.md` · `CURRENT_STATE.md` · `AGENT_CONTRACT.md` · `KNOWLEDGE_GRAPH.md` · `graph/schema.yaml` · `graph/nodes.yaml` · `graph/edges.yaml` · `graph/invariants.yaml` · `decisions/DECISION_REGISTER.md` · `evidence/EVIDENCE_INDEX.md` · `evidence/PRODUCTION_BASELINE.md` · `contradictions/KNOWLEDGE_GAPS.md` · `contradictions/OPEN_CONTRADICTIONS.md` · `research/CHANGE_LEDGER.md` · `research/FAILED_APPROACHES.md` · `research/OPEN_HYPOTHESES.md` · `research/OPEN_QUESTIONS.md` · `scripts/validate-graph.mjs` · `scripts/validate-graph.sh`

| Check | Before this pass | After this pass |
|-------|------------------|-----------------|
| **MANDATORY_CORE_FILES_PRESENT** | YES | **YES** |
| **MANDATORY_CORE_FILES_ADEQUATE** | NO — graph lacked FSM states/transitions/execution/boundaries; decision register missing R1–R8 / single-writer / Route V2 decisions and carried stale R10–R12 status; baseline stale (`8a1d9c658…`); hypotheses stale; 3 failed approaches absent from graph | **YES** — corrected in this PR (see Phases 2–16) |

No duplicate semantic documents created. The only new file is this promotion evidence record.

---

## Phase 2 — Live FSM states (machine graph)

| Graph node | Enum value | `fsm_role` | Runtime reachable |
|------------|-----------|------------|-------------------|
| `TDL-STATE-RESTING-001` | `RESTING` | `LIVE_RUNTIME_STATE` (initial + terminal rest) | YES |
| `TDL-STATE-POSSIBLE-START-001` | `POSSIBLE_START` | `LIVE_RUNTIME_STATE` | YES |
| `TDL-STATE-ACTIVE-TRIP-001` | `ACTIVE_TRIP` | `LIVE_RUNTIME_STATE` | YES |
| `TDL-STATE-IDLE-WITHIN-TRIP-001` | `IDLE_WITHIN_TRIP` | `LIVE_RUNTIME_STATE` | YES |
| `TDL-STATE-POSSIBLE-END-001` | `POSSIBLE_END` | `LIVE_RUNTIME_STATE` | YES |
| `TDL-STATE-ENDED-001` | `ENDED` | **`SCHEMA_COMPAT_ONLY`** | **NO** (`NOT_RUNTIME_REACHABLE`; TDL-DEC-OQ005-001) |

**`LIVE_FSM_RUNTIME_STATE_COUNT=5`** · **`ENDED_GRAPH_CLASSIFICATION=SCHEMA_COMPAT_ONLY / NOT_RUNTIME_REACHABLE`** (zero incoming or outgoing transitions; validator-enforced).

Initial row: `getOrCreateDetectionState` upserts a lazily created row with Prisma default `RESTING` (1:0..1 per vehicle, TDL-DEC-OQ003-001).

---

## Phase 3 — Complete transition matrix (derived from code @ `0b44b146…`)

**Method:** every `this.transitionState(…)` call site (34 call sites + the method definition at line 431, all in `trip-detection-orchestration.service.ts`) mapped to its enclosing method and entry guard; recovery targets read from `evaluateTripLifecycleInvariant` (`trip-lifecycle-invariant.ts`). The only other `VehicleTripDetectionState` writers are `getOrCreateDetectionState` (create, default RESTING) and `acquireWorkerLock` / `releaseWorkerLock` (lock columns only; no `state` write). No transition is inferred from enum names.

Common to all rows: **PERSISTENCE_WRITER** = `TripDetectionOrchestrationService.transitionState` (`prisma.vehicleTripDetectionState.update`), executed under the per-vehicle DB worker lock (`workerLockedUntil` / `workerRunToken`). **VehicleTrip** lifecycle writes happen only in `TripDecisionEngine`.

| ID | FROM → TO | TRIGGER | GUARD | DECISION_AUTHORITY | QUEUE / JOB | FAILURE / RECOVERY PATH | EVIDENCE |
|----|-----------|---------|-------|--------------------|-------------|-------------------------|----------|
| **TDL-TR-001** | RESTING → POSSIBLE_START | `dimo.snapshot.poll` job (ACTIVITY_TIERED scheduler tick **or** R9 wake handoff) → `DimoSnapshotProcessor` → `evaluateSnapshotForTripStart` | FSM `RESTING`; resting-reason cooldown (`discard` / `timeout` / `complete`) unless bypass; live-start freshness (`FRESH`/`STALE`/`MISSING`); start decision positive | `TripDecisionEngine.evaluateStartCandidate` (pure evaluation) + start detectors | Enqueues `POSSIBLE_START` (`trip-ps-{vehicleId}`) on `dimo.trip-tracking` | Snapshot fetch failure → no transition; next tier tick or R9 successor snapshot re-evaluates | TDL-EVID-OQ009-R9-INGRESS-001; TDL-EVID-OQ007-R1R8-COV-001 |
| **TDL-TR-002** | POSSIBLE_START → ACTIVE_TRIP | `POSSIBLE_START` job → `processPossibleStart` confirmation; **or** lifecycle recovery `ADOPT_ONGOING` (start/merge orphan) | Lock acquired; FSM `POSSIBLE_START`; elapsed ≤ `CONFIRM_MAX_WAIT_MS`; confirmation policy; QS merge check | `TripDecisionEngine.createTrip` **or** `reopenTripForMerge` (previous trip within Qualified Stop ≤ 300 000 ms) | Schedules `ACTIVE_TICK` **before** battery await (R3) | PS exception rethrown → BullMQ retry (R3); committed trip without FSM advance → R2 `ADOPT_ONGOING`; lost job → recovery scheduler re-enqueue | TDL-EVID-OQ007-R1R8-COV-001; TDL-EVID-QS-V1-PROD-ACCEPT-001 |
| **TDL-TR-003** | POSSIBLE_START → RESTING | `POSSIBLE_START` job | Elapsed since confirmation anchor > `CONFIRM_MAX_WAIT_MS` (2 sites: early expiry + post-evaluation expiry) | Orchestration timeout policy (no trip row exists) | None (resting reason `timeout` drives cooldown) | Lost job → recovery scheduler re-enqueues `POSSIBLE_START` | TDL-EVID-OQ007-R1R8-COV-001 |
| **TDL-TR-004** | ACTIVE_TRIP → IDLE_WITHIN_TRIP | `ACTIVE_TICK` → `processActiveTick` | Continuity verdict `IDLE` | `TripDecisionEngine.evaluateContinuity` (EndContinuityDetector findings) | Reschedules `ACTIVE_TICK` | Fetch error → same-state empty-core deferral with bounded backoff (R11) | TDL-EVID-R11-IMPL-001; TDL-EVID-R12-IMPL-001 |
| **TDL-TR-005** | IDLE_WITHIN_TRIP → ACTIVE_TRIP | `ACTIVE_TICK`; lifecycle recovery | Continuity `ACTIVE` (credible post-pause movement); **or** live mid-gap Qualified Stop split (gap > 300 000 ms, drift known) repoints FSM to second trip; **or** R2 `REPOINT_ACTIVE_TRIP` / `ADOPT_ONGOING` (missing pointer) | `evaluateContinuity`; `TripDecisionEngine.splitTripAtGap`; `evaluateTripLifecycleInvariant` | Reschedules `ACTIVE_TICK` | Split commit phase tracked (`POST_COMMIT`); split-first-completed + FSM stale → R2 repoint | TDL-EVID-R10-KS-MX-001; TDL-EVID-QS-V1-PROD-ACCEPT-001 |
| **TDL-TR-006** | ACTIVE_TRIP → ACTIVE_TRIP (same-state) | `ACTIVE_TICK`; lifecycle recovery | Continuity `ACTIVE` metrics/anchor update; empty-core deferral evidence; mid-gap QS split (gap > 300 000 ms; `drift==null` fails closed — R6) repoints to second trip; R2 repoint / missing-pointer adopt | `evaluateContinuity`; `splitTripAtGap`; QS policy | Reschedules `ACTIVE_TICK` (backoff when empty core) | Empty-core bounded backoff; fetch-error deferral | TDL-EVID-QS-V1-PROD-ACCEPT-001; TDL-EVID-OQ007-R1R8-COV-001 |
| **TDL-TR-007** | IDLE_WITHIN_TRIP → IDLE_WITHIN_TRIP (same-state) | `ACTIVE_TICK` | Continuity `IDLE` (pause evidence refresh); empty-core deferral | `evaluateContinuity` | Reschedules `ACTIVE_TICK` | Empty-core bounded backoff | TDL-EVID-R11-IMPL-001 |
| **TDL-TR-008** | ACTIVE_TRIP → POSSIBLE_END | `ACTIVE_TICK` | Continuity `POSSIBLE_END`; **or** empty-core end gate with provider stop boundary / provider-silence candidate (R11/R12); **or** ClickHouse-assisted end (`CLICKHOUSE_TRIP_ASSIST_ENABLED`) | `evaluateContinuity`; `resolvePossibleEndBoundaryCandidate`; `tryApplyClickHouseAssistedEnd` | Schedules `POSSIBLE_END_CHECK`; CH assist HIGH → `scheduleFinalize` | PE clock durability reconciled on later ticks (#1600) | TDL-EVID-R12-IMPL-001; TDL-EVID-R11-IMPL-001 |
| **TDL-TR-009** | IDLE_WITHIN_TRIP → POSSIBLE_END | `ACTIVE_TICK` | Same as TR-008 | Same as TR-008 | Same as TR-008 | Same as TR-008 | TDL-EVID-R12-IMPL-001 |
| **TDL-TR-010** | POSSIBLE_END → ACTIVE_TRIP | `POSSIBLE_END_CHECK` / `END_VALIDATION`; CH assist cancellation; lifecycle recovery | Activity resumed **after end boundary** (R10); CUSUM `still ongoing` reopen; CH skip-resume revalidation → resumed (#1674); CH assist HIGH cancelled by resumed DIMO activity; R2 repoint | `buildPossibleEndToActiveReset`; `TripDecisionEngine.evaluateEndCandidate` | `cancelPendingEndCycleJobs`; schedules `ACTIVE_TICK` | Stale EV/FIN jobs rejected by end-cycle token (R10) | TDL-EVID-R10-KS-MX-001; TDL-EVID-R12-IMPL-001 |
| **TDL-TR-011** | POSSIBLE_END → POSSIBLE_END (same-state) | `POSSIBLE_END_CHECK` / `END_VALIDATION` / `scheduleFinalize` | Clock durability reconcile; EV scheduled/started evidence; CUSUM inconclusive (attempt++); detector/fetch failure evidence; CH skip-resume deferral/handoff; CUSUM or CH end validated (`cusumValidatedAt`); max-attempt fallback (`COMPOSITE_INACTIVITY`, LOW); pending-finalize evidence stamp | `evaluateEndCandidate` (ChangePointEndDetector); CH end assist | Reschedules `POSSIBLE_END_CHECK` / `END_VALIDATION`; enqueues `FINALIZE` with `endCycleToken` | Bounded CUSUM retry budget (#1627); fetch failures recorded, not terminal; recovery scheduler `onStuckTrip` for stuck POSSIBLE_END | TDL-EVID-R12-IMPL-001; TDL-EVID-OQ007-R1R8-COV-001 |
| **TDL-TR-012** | POSSIBLE_END → RESTING | `FINALIZE` job → `processFinalize`; lifecycle recovery | End-cycle admission (`evaluateEndCycleJobAdmission`: token match, or tokenless `requestedAt ≥ possibleEndEnteredAt`; never from `ACTIVE_TRIP`); pre-write admission re-check; quality check; **or** R2/R7 `RESET_TO_RESTING` (referenced trip terminal) | `TripDecisionEngine.finalizeTrip` (COMPLETED) **or** `discardTrip` (CANCELLED) | Post-finalize handoff: `TripPostFinalizeAnalysisProducer` (DI V2), `enqueueBehaviorEnrichment` (legacy HF), Battery V2 rest window | Lock contention → `TripTrackingHandoffLockContentionError` → BullMQ retry; stale token → skip + tracking run; COMPLETED but RESTING write failed → R7 `RESET_TO_RESTING` on next preflight | TDL-EVID-R10-KS-MX-001; TDL-EVID-OQ001-HANDOFF-001; TDL-EVID-OQ005-ENDED-001 |
| **TDL-TR-013** | ACTIVE_TRIP → RESTING | `ACTIVE_TICK`; lifecycle recovery | `activeTripId` missing and invariant preflight returns `continue`; **or** R2 `RESET_TO_RESTING` (referenced trip already terminal, e.g. after reconciliation STALE_ONGOING repair) | `evaluateTripLifecycleInvariant` | None | Fail-closed on `CONFLICT_*` (blocked, logged; no silent write) | TDL-EVID-OQ007-R1R8-COV-001 |
| **TDL-TR-014** | IDLE_WITHIN_TRIP → RESTING | Same as TR-013 | Same as TR-013 | Same as TR-013 | None | Same as TR-013 | TDL-EVID-OQ007-R1R8-COV-001 |

**`LIVE_FSM_TRANSITION_COUNT=14`** — 11 state-changing + 3 same-state (meaningful persisted self-transitions).

**Verified absent (no productive code path):** RESTING → ACTIVE_TRIP (invariant returns `CONFLICT_MISMATCH`, fail-closed) · ACTIVE_TRIP/IDLE_WITHIN_TRIP → POSSIBLE_START · POSSIBLE_START → POSSIBLE_END · ACTIVE_TRIP → FINALIZE (end-cycle admission returns `stale_active_trip`; rejected alternative in TDL-DEC-R12-001) · any → `ENDED` · `ENDED` → any.

Recovery routes via `executeLifecycleRecoveryAction` are included inside TR-002, TR-005, TR-006, TR-010, TR-012, TR-013, TR-014 — they add triggers to existing pairs; they do not create additional state pairs.

---

## Phase 4 — Execution graph

```
Provider wake:  DIMO trigger (speed / ignition)
  → DimoWebhookController                         [DIMO Integration boundary]
  → SnapshotWakeIntakeService                     → Redis pending mailbox (durable-first)
  → canonical dimo.snapshot.poll job (stable jobId snapshot-{vehicleId})
  → SnapshotWakeCoordinatorService (coalesce while QUEUED/ACTIVE; successor mailbox)
  → snapshot.wake.handoff → SnapshotWakeHandoffProcessor (never provider-fetch)
  → canonical dimo.snapshot.poll enqueue          [SnapshotWakeHandoffRecoveryScheduler 60s re-arms orphans]

Scheduled:     DimoSnapshotScheduler @Interval(30s) leader-gated, ACTIVITY_TIERED due-time
  → same canonical dimo.snapshot.poll queue

Both:          DimoSnapshotProcessor → VehicleLatestState write → TripDetectionOrchestrationService.evaluateSnapshotForTripStart

FSM tracking:  dimo.trip-tracking → TripTrackingProcessor (concurrency WORKER_TRIP_TRACKING_CONCURRENCY, Production 5)
  POSSIBLE_START → processPossibleStart
  ACTIVE_TICK → processActiveTick
  POSSIBLE_END_CHECK → processPossibleEndCheck
  END_VALIDATION → processEndValidation
  FINALIZE → processFinalize

Recovery:      TripTrackingRecoveryScheduler @Interval(120s) → re-enqueue per non-RESTING state; onStuckTrip / SUSPICIOUS_LONG_OPEN → reconciliation
               TripLifecycleRecoveryService + evaluateTripLifecycleInvariant → ADOPT_ONGOING / REPOINT_ACTIVE_TRIP / RESET_TO_RESTING (FSM only)
               TripReconciliationScheduler (15 min fast, 4 h warm, 03:00 daily) → TripReconciliationService → TripDecisionEngine repair APIs

Lifecycle writer:  TripDecisionEngine (createTrip, reopenTripForMerge, splitTripAtGap, finalizeTrip, discardTrip, createRepairedTrip, finalizeRepairedTrip, repairTripBoundaries*)
Persistence:       VehicleTripDetectionState · VehicleTripTrackingRun · VehicleTrip · VehicleTripWaypoint · TripRepair · VehicleTripRouteArtifact
```

---

## Phase 5 — End-to-end data flow and module boundaries

```
provider evidence (DIMO snapshot / trigger)
  → VehicleLatestState + snapshot core
  → start detection (TR-001) → FSM row POSSIBLE_START
  → confirmation → VehicleTrip ONGOING via TripDecisionEngine (TR-002)
  → ACTIVE_TICK tracking → VehicleTripWaypoint + VehicleTripTrackingRun
  → stop / end evidence (continuity, empty-core stop boundary, CH assist) → POSSIBLE_END (TR-008/009)
  → PEC → END_VALIDATION (CUSUM) → FINALIZE
  → VehicleTrip COMPLETED (or CANCELLED) via TripDecisionEngine
  → FSM RESTING (TR-012)
  → post-finalize handoff  ══ MODULE BOUNDARY ══
       → Driving Intelligence V2 (TripPostFinalizeAnalysisProducer → DrivingAnalysisInitService)   [DI authority]
       → Automatic Trip Enrichment legacy HF (enqueueBehaviorEnrichment → trip.behavior.enrichment) [KG-ATE authority]
       → Battery V2 LV rest window hook                                                            [Battery V2 authority]

DIMO segments → TripReconciliationService (repair evidence) → TripDecisionEngine repair mutation → TripRepair audit
Route V2: TripsService.enrichTrip → TripRouteArtifactMaterializerService → TripRouteChunkedMatcherService
          → MapboxChunkMatchingClientService → MapboxService.matchMapboxChunkDetailed → VehicleTripRouteArtifact
```

Route artifacts are **TDL-owned**; the three route-enrich entry points (legacy HF P010, DI `DRIVING_ROUTE_ENRICH` P014, manual HTTP P034) are downstream callers. Behavior/scoring built on routes is **not** TDL.

---

## Phase 6 — Authority / writer graph (encoded as authority nodes + invariants)

| Authority | Graph node | Invariant |
|-----------|-----------|-----------|
| `TripDecisionEngine` = sole canonical `VehicleTrip` lifecycle writer | `TDL-AUTH-LIFECYCLE-001` | `TDL-INV-LIFECYCLE-AUTHORITY-001` |
| `TripDetectionOrchestrationService` = sole live FSM `state` writer | `TDL-AUTH-FSM-PERSIST-001` | `TDL-INV-FSM-SINGLE-STATE-WRITER-001` |
| DIMO segments = repair/validation evidence, not live boundary authority | `TDL-AUTH-DIMO-SEGMENT-EVIDENCE-001` | `TDL-INV-DIMO-SEGMENT-EVIDENCE-ONLY-001` |
| Driving Intelligence = downstream analysis, not lifecycle writer | `TDL-CONS-DI-V2-001` | `TDL-INV-DOWNSTREAM-NOT-LIFECYCLE-WRITER-001` |
| ATE legacy HF = downstream enrichment, not lifecycle writer | `TDL-CONS-ATE-LEGACY-001` | `TDL-INV-DOWNSTREAM-NOT-LIFECYCLE-WRITER-001` |
| Qualified Stop V1: ≤ 300 000 ms SAME_TRIP; > 300 000 ms SPLIT | `TDL-POL-QS-V1-001` | `TDL-INV-QS-V1-DURATION-001` |
| `MAX_IGNORABLE_UNCOVERED_SPAN_SECONDS=180` separate from QS duration | `TDL-POL-UNCOVERED-SPAN-001` | `TDL-INV-UNCOVERED-SPAN-SEPARATE-001` |
| End-cycle token admission for EV/FIN jobs | `TDL-AUTH-END-CYCLE-TOKEN-001` | `TDL-INV-FINALIZE-ONLY-FROM-POSSIBLE-END-001` |
| Per-vehicle DB worker lock | `TDL-AUTH-WORKER-LOCK-001` | — |
| ENDED not runtime reachable | `TDL-STATE-ENDED-001` | `TDL-INV-ENDED-UNREACHABLE-001` |

---

## Phase 7 — Failure and recovery graph

| Failure class | TDL response | Mechanism | Graph |
|---------------|-------------|-----------|-------|
| Provider silence | **Recovers** | Provider-silence candidate / stop boundary feeds POSSIBLE_END (R12, #1635) | TR-008/009; `TDL-REC-EMPTY-CORE-001` |
| Empty core (no fresh core points) | **Retries** (bounded) | Same-state deferral, exponential backoff with jitter; end gate once boundary evidence exists (R11) | TR-006/007; `TDL-REC-EMPTY-CORE-001` |
| Snapshot fetch failure | **Retries / falls back** | No transition; next ACTIVITY_TIERED tick or wake successor snapshot | TR-001; `TDL-PIPE-SNAPSHOT-SCHEDULER-001` |
| Wake coalescing | **Recovers** | Coalesce into QUEUED/ACTIVE canonical job; pending mailbox preserved | `TDL-ORCH-WAKE-COORD-001`; R9 invariants |
| Wake successor handoff | **Recovers** | Successor mailbox + `snapshot.wake.handoff`; 60 s orphan re-arm | `TDL-REC-WAKE-HANDOFF-RECOVERY-001` |
| Worker lock contention | **Retries** | Handoff jobs throw `TripTrackingHandoffLockContentionError` → BullMQ retry; non-handoff jobs return (next schedule) | `TDL-AUTH-WORKER-LOCK-001` |
| Stale end-cycle jobs | **Rejects** | `evaluateEndCycleJobAdmission` token / requestedAt admission; skip logged as tracking run | `TDL-AUTH-END-CYCLE-TOKEN-001` |
| POSSIBLE_START timeout | **Falls back** | TR-003 → RESTING (`timeout` cooldown) | TR-003 |
| POSSIBLE_END timeout / max attempts | **Falls back** | Max-attempt fallback finalize (`COMPOSITE_INACTIVITY`, LOW) | TR-011 → TR-012 |
| Activity resume | **Recovers** | TR-010; pending EV/FIN cancelled | TR-010 |
| CUSUM ongoing reopen | **Recovers** | TR-010 `CUSUM_STILL_ONGOING` | TR-010 |
| Tracking recovery (lost jobs) | **Recovers** | `TripTrackingRecoveryScheduler` 120 s re-enqueue | `TDL-REC-TRACKING-RECOVERY-001` |
| Lifecycle invariant drift | **Recovers / fails closed** | ADOPT / REPOINT / RESET; `CONFLICT_*` blocked | `TDL-REC-LIFECYCLE-INVARIANT-001` |
| Reconciliation repair (stuck, missing trip) | **Reconciles** | `TripReconciliationService` → `TripDecisionEngine` repair APIs; low-confidence left `PROPOSED` | `TDL-REC-RECONCILIATION-001` |
| Partial boundary repair | **Reconciles** | Extension-only when containment + single-trip intersection pass (`TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=true`) | `TDL-REC-RECONCILIATION-001`; TDL-DEC-OQ006-001 |
| Mid-gap / Qualified Stop split | **Splits (fail-closed)** | Gap > 300 000 ms + known drift → `splitTripAtGap`; `drift==null` no split | TR-005/006; `TDL-POL-QS-V1-001` |
| Post-repair downstream refresh | **Reconciles** | `BoundaryRefreshLifecycleService` lease + stale recovery | `TDL-REC-BOUNDARY-REFRESH-001` |
| Post-finalize downstream handoff | **Delegates** | DI V2 producer + PG job ledger; DI reconciliation owns retry (TDL-DEC-OQ001-001) | `TDL-CONS-DI-V2-001` |

---

## Phase 8 — Graph completeness vs OQ-010 (41 productive paths)

| Class | Paths | Graph target |
|-------|-------|--------------|
| **GRAPH_MAPPED** (TDL-owned node/edge) | P001, P002, P003, P004, P005, P006, P024, P025, P026, P027, P028, P029, P031, P037 | Snapshot worker, handoff worker, trip-tracking worker, lifecycle authority, orchestrator, detector resolvers, reconciliation + segment evidence, boundary refresh, tracking recovery |
| **BOUNDARY_MAPPED** (explicit downstream/neighbor consumer node) | P007, P008–P023, P030, P032, P033, P034, P035, P036, P038, P039, P040, P041 | `TDL-CONS-DI-V2-001` (P007, P013–P023, P033, P039, P041), `TDL-CONS-ATE-LEGACY-001` (P008–P012, P034–P036, P038, P040), `TDL-CONS-TRIP-METADATA-001` (P030, P032) |

| Metric | Value |
|--------|------:|
| **OQ010_PRODUCTIVE_PATH_COUNT** | **41** |
| **PRODUCTIVE_PATHS_GRAPH_MAPPED** | **14** |
| **PRODUCTIVE_PATHS_BOUNDARY_MAPPED** | **27** |
| **PRODUCTIVE_PATHS_UNMAPPED** | **0** |

Each node carries `oq010_paths`; `validate-graph.mjs` enforces that P001–P041 each map exactly once. No low-level helper nodes were added to inflate counts.

---

## Phase 9 — Decision register completeness

| Scope item | Decision |
|------------|----------|
| Single lifecycle writer + FSM persistence split | **TDL-DEC-P1-001** (new) |
| R1–R8 current behavioral contracts | **TDL-DEC-R1R8-001** (new; consolidated with supersession map R5 → R10–R12) |
| R9 adaptive wake | TDL-DEC-R9-001 … R9F-001, R9-CX-001 |
| R10 motor-off / pause, end-cycle token | TDL-DEC-R10-001, TDL-DEC-R10-002 — status **PROPOSED → VALIDATED** |
| R11 liveness / empty core | TDL-DEC-R11-001 — **PROPOSED → VALIDATED** |
| R12 terminal / end-cycle hardening | TDL-DEC-R12-001 — **PROPOSED → VALIDATED** |
| Qualified Stop V1 | TDL-DEC-QS-V1-001 |
| OQ-001 … OQ-010 | TDL-DEC-OQ001-001 … TDL-DEC-OQ010-001, TDL-DEC-OQ005-001 |
| Route V2 / chunked matching authority | **TDL-DEC-ROUTE-V2-001** (new) |
| DIMO segment repair hierarchy | TDL-DEC-OQ006-001 |
| Post-finalize handoff boundary | TDL-DEC-OQ001-001 (+ TDL-DEC-OQ010-001 dual pipeline) |
| Promotion | **TDL-DEC-PHASE5-001** (new) |

**R10–R12 status correction rationale:** code merged, CI-validated, deployed on historical releases, and present in live `2b54a357…` (marker check, Phase 0). `VALIDATED` (not `PRODUCTION_VALIDATED`) is the accurate decision status: natural Production behavior is partially observed (QS acceptance, PE clock durability on drive `fc93f98f…`) but not sealed for every path. Prior `PROPOSED` / "Not deployed" preserved as status history in each section.

**`DECISION_REGISTER_COMPLETE_FOR_DECLARED_SCOPE=YES`** → **TDL-GAP-011 RESOLVED**.

---

## Phase 10 — Production baseline (live @ `2b54a357…`)

| Field | Value | Class |
|-------|-------|-------|
| **LIVE_PRODUCTION_SHA / LIVE_RELEASE_ID** | `2b54a357…` / `20260926094359_v4994` | CURRENTLY_REOBSERVED |
| **PM2 topology** | Two fork-mode apps `synqdrive` + `synqdrive-b` (`instances=1` each) + `pm2-logrotate`; both **online**, uptime ~67 min @ ~12:23Z (processes started ~11:16Z, after the 09:43Z release; cause not investigated — outside TDL scope) | CURRENTLY_REOBSERVED |
| **Snapshot polling mode** | `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED=true` → **ACTIVITY_TIERED**; `WORKER_SNAPSHOT_INTERVAL_MS=30000`; `WORKER_SNAPSHOT_CONCURRENCY=8` | CURRENTLY_REOBSERVED |
| **Trip tracking concurrency** | `WORKER_TRIP_TRACKING_CONCURRENCY=5` | CURRENTLY_REOBSERVED |
| **FSM shadow** | `TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED=true`; `TRIP_FSM_SHADOW_VEHICLE_IDS` set (allowlist; value not recorded) | CURRENTLY_REOBSERVED |
| **Repair mode** | `TRIP_REPAIR_COVERAGE_MODE` unset → code default **`shadow`**; `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=true` | CURRENTLY_REOBSERVED |
| **Qualified Stop threshold** | `TRIP_SAME_TRIP_MAX_STOP_MS` and legacy `TRIP_MID_GAP_SPLIT_MS` unset → **`CANONICAL_DEFAULT` 300 000 ms** | CURRENTLY_REOBSERVED |
| **ClickHouse trip assist** | `CLICKHOUSE_TRIP_ASSIST_ENABLED=true` | CURRENTLY_REOBSERVED |
| **DI V2** | `DRIVING_INTELLIGENCE_V2_ENABLED=true`; `DRIVING_V2_DIMO_SEGMENT_VALIDATION_ENABLED=false` | CURRENTLY_REOBSERVED |
| **FSM state distribution** @ `12:26:26Z` | 6 rows — **6 RESTING**; 0 with `active_trip_id`; 0 worker-locked | CURRENTLY_REOBSERVED |
| **Scheduler-eligible cohort** | **6** (AVAILABLE/RENTED + DIMO CONNECTED + tokenId) — equals FSM row count | CURRENTLY_REOBSERVED |
| **Trips** | 2284 COMPLETED, 20 CANCELLED, **0 ONGOING**; 20 completed / 24 h; 105 completed / 7 d | CURRENTLY_REOBSERVED |
| **Tracking runs (24 h)** | 625 total — ACTIVE_TRACKING 372, POSSIBLE_END_CHECK 127, POSSIBLE_START_VALIDATION 63, END_VALIDATION 47, FINALIZATION_CHECK 16; last run `11:48:25Z` | CURRENTLY_REOBSERVED |
| **Queues** | `dimo.snapshot.poll` wait 0 / active 0 / delayed 1; `dimo.trip-tracking` wait 0 / active 0 / delayed 0 / failed 2 (retained, finished 2026-06-22 and 2026-07-11: FK violation on `dimo_poll_logs`, DB recovery window — **historical**, not current); `snapshot.wake.handoff` all 0; wake pending/successor mailbox keys 0 | CURRENTLY_REOBSERVED |
| **TripRepair** | all-time APPLIED 1223 / PROPOSED 8595 / REJECTED 25 / SUPPRESSED 1088; 7 d APPLIED 19 / PROPOSED 69 / SUPPRESSED 282 | CURRENTLY_REOBSERVED |
| **ENDED rows** | 0 live / 0 tracking all-time | CARRIED_FORWARD_FROM_RECENT_VERIFIED_EVIDENCE (TDL-EVID-OQ005-ENDED-001, same DB, same release) |
| **R9 authorized provider cohort** | 5/5 speed+ignition; stale mirror separate (DIM-GAP-005) | CARRIED_FORWARD_FROM_RECENT_VERIFIED_EVIDENCE (TDL-EVID-OQ009-R9-INGRESS-001) |
| **QS natural acceptance** | `PASS_WITH_EVIDENCE_GAPS` | CARRIED_FORWARD_FROM_RECENT_VERIFIED_EVIDENCE (TDL-EVID-QS-V1-PROD-ACCEPT-001) |

**Worker/queue liveness:** tracking runs of every job type within 24 h, 20 finalized trips within 24 h, empty wait queues, zero current failures, zero stuck non-RESTING FSM rows → TDL workers **live**.

---

## Phase 11 — Contradiction classification

| ID | CURRENT_FACT | WHY | EVIDENCE | PROMOTION_CLASS |
|----|--------------|-----|----------|-----------------|
| TDL-CX-001 | R8/R9 drift at `01541c2ab…` resolved at `0ba96e03…` | Historical only | PRODUCTION_BASELINE | **RESOLVED** |
| TDL-CX-002 | P2 SQL claims marked HISTORICAL | Historical only | TDL-EV-P2-001 | **RESOLVED** |
| TDL-CX-003 | ENDED schema compat; 0 writers; 0 rows | Bounded by OQ-005 | TDL-EVID-OQ005-ENDED-001 | **RESOLVED** (bounded; optional enum cleanup is not a blocker) |
| **TDL-CX-004** | P2–P5 audits target pre-R1 `3d5040b67…`; current architecture re-derived from code @ `0b44b146…` in this pass (transition matrix + execution graph) | Historical audits are labeled supporting evidence; no current claim depends on them | This record; EVIDENCE_INDEX classifications | **HISTORICAL_NON_BLOCKING** |
| **TDL-CX-005** | 8595 PROPOSED repairs vs 0 ONGOING trips. `PROPOSED` = low-confidence repair candidates recorded for review; they **never** mutate `VehicleTrip`. Class comment promises "auto-expiry" but no expiry/review path exists in code | Not a live-state contradiction: PROPOSED rows are audit trail, not open trips. Remaining issue is an unbounded audit backlog and comment/code drift | Phase 10 SQL; `trip-reconciliation.service.ts` class comment vs absence of expiry path | **EXPLICIT_NON_BLOCKING_LIMITATION** |
| **TDL-CX-006** | DI registry section and project rules phrase "Trip Detection / DIMO Segments own trip boundaries"; code + TDL-DEC-OQ006-001: live FSM + `TripDecisionEngine` own boundaries, DIMO segments are repair evidence | TDL authority states the hierarchy precisely; the imprecise wording lives in neighbor docs (DI section, project rules), owned by other workstreams | TDL-EVID-OQ006-BOUNDARY-001 | **EXPLICIT_NON_BLOCKING_LIMITATION** |

No contradiction is classified **BLOCKING**.

---

## Phase 12 — Knowledge gap classification

| Gap | Current fact | PROMOTION_CLASS |
|-----|-------------|-----------------|
| TDL-GAP-005 ClickHouse trip-assist | Runtime path reconstructed (`tryApplyClickHouseAssistedEnd` in TR-008/010/011); flag **true** on live Production; mirror **contents** not audited | **EXPLICIT_NON_BLOCKING_LIMITATION** |
| TDL-GAP-008 Mapbox/FMM failure recovery | Failure taxonomy reconstructed (TDL-EVID-OQ004-ROUTE-COV-001); canonical matcher `matchMapboxChunkDetailed`; FMM no Production callsite; handler artifact contract follow-up | **EXPLICIT_NON_BLOCKING_LIMITATION** |
| TDL-GAP-010 machine graph | Full FSM (5 live + ENDED compat), 14 transitions, execution/recovery/boundary graph, OQ-010 mapping | **RESOLVED** |
| TDL-GAP-011 decision register | Complete for declared scope (Phase 9) | **RESOLVED** |
| TDL-GAP-013 natural R9 wake delivery | Historical start wake proven; recent fleet wake KPIs not measured | **EXPLICIT_NON_BLOCKING_LIMITATION** |
| TDL-GAP-014 natural LTE empty-core revalidation | R11/R12 on Production; natural re-drive not re-observed | **EXPLICIT_NON_BLOCKING_LIMITATION** |
| TDL-GAP-015 per-field VLS freshness | Known design limitation of single `sourceTimestamp`; proposal only | **EXPLICIT_NON_BLOCKING_LIMITATION** |
| TDL-GAP-009 | Historical | **RESOLVED** (historical) |

These are scientific/product validation gaps, not architecture reconstruction gaps: current behavior, ownership, and uncertainty are documented for each.

---

## Phase 13 — Hypothesis hygiene

| ID | Result |
|----|--------|
| TDL-HYP-001 small cohort ↔ 6 FSM rows | **CONFIRMED** — TDL-DEC-OQ003-001; re-observed 6 rows = 6 eligible |
| TDL-HYP-002 route gap ↔ Mapbox/FMM failures | **SUPERSEDED** by TDL-DEC-OQ004-001 — gap explained by eligibility + pre-Route-V2 era; Mapbox affects quality, not artifact existence (Mapbox-causation part **rejected**) |
| TDL-HYP-003 R9 wake reduces PS latency | **Remains open** research hypothesis — non-blocking |

---

## Phase 14 — Human / machine graph consistency

Checked `KNOWLEDGE_GRAPH.md`, `graph/nodes.yaml`, `graph/edges.yaml`, `graph/invariants.yaml`, `CURRENT_STATE.md`, `README.md`, `DECISION_REGISTER.md` for: same 5+1 states, same 14 transitions, same authorities, same boundaries, same decision statuses (validator-enforced across register ↔ nodes ↔ KNOWLEDGE_GRAPH table), same anchors (`0b44b146…` / `2b54a357…`).

Corrections applied: three pre-existing edges with reversed flow direction (`downstream_of` used where the source feeds the target) changed to `upstream_of`; relation direction now defined in `AGENT_CONTRACT.md`. Three failed approaches listed in `FAILED_APPROACHES.md` but missing from the graph (TDL-FAIL-R9A-002, R9C-001, R9F-001) added; validator now indexes `TDL-FAIL-*`.

**`HUMAN_MACHINE_GRAPH_CONSISTENT=YES`**

---

## Phase 17 — Gate A checklist

| # | Item | Result | Basis |
|---|------|--------|-------|
| 1 | REGISTRY_STATUS_HANDLED | **PASS** | `NOT_STARTED` → `AUDIT_IN_PROGRESS` (2026-09-06) → gate evaluated here |
| 2 | REPOSITORY_SHA_CAPTURED | **PASS** | `0b44b146…` |
| 3 | PRODUCTION_SHA_CAPTURED_SEPARATELY | **PASS** | `2b54a357…` / `20260926094359_v4994` |
| 4 | PRODUCTION_ACCESS_VERIFIED | **PASS** | `VERIFIED_READ_ONLY` |
| 5 | NO_UNAUTHORIZED_PROD_MUTATION | **PASS** | Read-only commands only; a temporary SQL file was copied to the VPS `/tmp` for `psql -f` and deleted in the same command (no application, DB, Redis, env, or PM2 state touched) |
| 6 | COMPLETE_COMPONENT_RECONSTRUCTION | **PASS** | Phases 2–4, 6 |
| 7 | COMPLETE_DATA_FLOW_RECONSTRUCTION | **PASS** | Phase 5 |
| 8 | TENANT_AUTH_BOUNDARIES_INSPECTED | **PASS** | FSM row `organizationId` + OQ-001.1 org invariant (`STRUCTURALLY_IMPOSSIBLE` orphan); trip read API `@UseGuards(RolesGuard, VehicleOwnershipGuard, VehicleIntelligencePermissionGuard)` + `resolveOrganizationId` scoping; worker jobs carry `organizationId`; DIMO webhook signature handling (optional HMAC — Vehicle Triggers unsigned) owned by DIMO Integration |
| 9 | FAILURE_RECOVERY_DOCUMENTED | **PASS** | Phase 7 |
| 10 | DECISIONS_WHY_PRESERVED | **PASS** | Phase 9 |
| 11 | EVIDENCE_INDEXED | **PASS** | EVIDENCE_INDEX row + graph evidence nodes with source types |
| 12 | GAPS_CONTRADICTIONS_HYPOTHESES_SEPARATED | **PASS** | Phases 11–13 |
| 13 | HUMAN_MACHINE_GRAPH_ALIGNED | **PASS** | Phase 14 |
| 14 | MODULE_VALIDATOR_PASS | **PASS** | `validate-graph.sh` (extended: transitions, FSM completeness, OQ-010 mapping, FAIL index) |
| 15 | CENTRAL_REGISTRY_VALIDATOR_PASS | **PASS** | `validate-module-registry.sh` |
| 16 | REGISTRY_ENTRY_SYNCHRONIZED | **PASS** | Overview row + detailed section updated |
| 17 | LIMITATIONS_EXPLICIT | **PASS** | Explicit limitations list below |

**GATE_A_TOTAL_CHECKS=17 · GATE_A_PASS=17 · GATE_A_FAIL=0**

---

## Explicit non-blocking limitations

1. **QS V1** Production acceptance **`PASS_WITH_EVIDENCE_GAPS`** — no natural > 300 s SPLIT / POST_SPLIT_TRIP2 observed (`QS_V1_PROMOTION_CLASS=EXPLICIT_LIMITATION_NOT_AUTOMATIC_BLOCKER`).
2. TDL-GAP-005 ClickHouse mirror contents not audited.
3. TDL-GAP-008 Route V2 handler artifact contract follow-up.
4. TDL-GAP-013 recent natural R9 wake rates unmeasured.
5. TDL-GAP-014 natural LTE empty-core re-drive not re-observed post-R12.
6. TDL-GAP-015 VLS single `sourceTimestamp` per-field freshness.
7. TDL-CX-005 `PROPOSED` repair backlog without expiry/review path (comment/code drift).
8. TDL-CX-006 neighbor wording (DI registry section, project rules) imprecise about DIMO segment role.
9. `ENDED` enum label retained as schema debt (optional PostgreSQL enum migration; not a blocker).
10. Dual post-finalize pipelines (DI V2 ∥ legacy HF) — bounded debt (TDL-DEC-OQ010-001).
11. R10–R12 decisions `VALIDATED`, not `PRODUCTION_VALIDATED`, for every path.

---

## Phase 18 — Verdict

**`PROMOTE_AUTHORITY_ACTIVE`** — every Gate A item passes; remaining items are explicit limitations per `MODULE_AUTHORITY_STANDARD.md` §6 ("open product or research gaps do not automatically block").

Registry: `AUDIT_IN_PROGRESS` → **`AUTHORITY_ACTIVE`**.

**Mutations performed:** none (no deploy, restart, DB/Redis/BullMQ write, env change, provider call, or migration).
