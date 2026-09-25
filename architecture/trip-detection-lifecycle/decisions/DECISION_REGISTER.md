# Trip Detection & Lifecycle — Decision Register (partial, post-R9)

Append-only architectural decisions. R9 packages indexed at abstraction level; detail in supporting audit evidence.

| Decision ID | Title | STATUS | Evidence |
|-------------|-------|--------|----------|
| TDL-DEC-R9-001 | R9 adaptive polling wake subsystem | VALIDATED | TDL-EVID-R9-AUDIT-001 |
| TDL-DEC-R9A-001 | Durable-first wake mailboxes | VALIDATED | TDL-EVID-R9-AUDIT-001 |
| TDL-DEC-R9B-001 | Handoff rearm without self-coalescing stable jobId | VALIDATED | TDL-EVID-R9-AUDIT-001 |
| TDL-DEC-R9C-001 | Generation-1 probe terminal bound | VALIDATED | TDL-TEST-R9-001 |
| TDL-DEC-R9D-001 | Continuation RESTING + eligibility authority | VALIDATED | TDL-EVID-R9-AUDIT-001 |
| TDL-DEC-R9E-001 | UNKNOWN handoff defer and obsolete CAS retirement | VALIDATED | TDL-TEST-R9-001 |
| TDL-DEC-R9F-001 | UNKNOWN bounded retry outside handoff dispatch | VALIDATED | TDL-TEST-R9-001 |
| TDL-DEC-R9-CX-001 | DIMO webhook → Trip wake delegation boundary | VALIDATED | TDL-EVID-R9-AUDIT-001; [DIM-DEC-R9-001](../../dimo-integration/decisions/DECISION_REGISTER.md) |
| TDL-DEC-R10-001 | End-boundary-anchored activity resume + stale finalize guards | PROPOSED | TDL-EVID-R10-KS-MX-001 |
| TDL-DEC-R10-002 | Legacy tokenless FINALIZE admission without silent token assignment | PROPOSED | TDL-EVID-R10-KS-MX-001 |
| TDL-DEC-R11-001 | Empty-core evidence contract (pause, provider anchor, stop boundary) | PROPOSED | TDL-EVID-R11-IMPL-001; TDL-EVID-KS-MS-661-PROPOSAL-001; TDL-EVID-KS-MS-661-002; KS661 audit corpus |
| TDL-DEC-OQ002-001 | drive-profile ownership — Battery V2 owns; TDL non-owner | VALIDATED | TDL-EVID-OQ002-DRIVE-PROFILE-001 |
| TDL-DEC-OQ006-001 | DIMO segment vs live FSM boundary authority | VALIDATED | TDL-EVID-OQ006-BOUNDARY-001 |
| TDL-DEC-OQ007-001 | R1–R8 Production validation coverage — scope reduction + active-contract matrix | VALIDATED | TDL-EVID-OQ007-R1R8-COV-001 |

---

## TDL-DEC-R10-002

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | Tokenless FINALIZE jobs returned `ok` from `isEndCycleTokenStale` whenever FSM ≠ `ACTIVE_TRIP` — cycle-A legacy job could finalize cycle-B episode |
| **WHY** | Review gap: A→resume→B with legacy waiting job while FSM again `POSSIBLE_END`; `ACTIVE_TRIP` guard alone insufficient |
| **CHANGE** | Tokenless jobs require `requestedAt` ≥ `possibleEndEnteredAt`; optional `pendingFinalizeCycleToken` evidence stamp; pre-write admission re-check before `finalizeTrip`; pre-clock episodes without entered-at clock retain backward compat |
| **ALTERNATIVES REJECTED** | Assign current `endCycleToken` to tokenless jobs at consume time (masks stale jobs as current) |
| **EXPECTED EFFECT** | Stale legacy jobs rejected; valid cycle-B jobs still complete; duplicate consumer does not double-complete |
| **VALIDATION** | `trip-fsm-motor-off-pause-r10.spec.ts` H–J; `trip-finalize-end-cycle.postgres.integration.spec.ts` (gated) |
| **PRODUCTION STATUS** | **Not deployed** |
| **DEPLOY PREREQUISITE** | All PM2 trip-tracking replicas must run R10+ before legacy tokenless safety is authoritative — old workers bypass new guards during rolling deploy |
| **EVIDENCE** | TDL-EVID-R10-KS-MX-001 |

---

## TDL-DEC-R10-001

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | `hasActivityResumed` scanned fetched points without `resumeAfterAt`; stale waiting `FINALIZE` jobs blocked re-enqueue (`skipped`); `processFinalize` lacked end-cycle correlation |
| **WHY** | KS MX 2026-09-08: false resume during motor-off gap; true end @ ~05:02:45 not persisted despite `scheduleFinalize` @ 05:17:36 |
| **CHANGE** | Anchor resume to end boundary; `endCycleToken=possibleEndEnteredAt` on `ev`/`fin` jobs; recycle waiting slot before finalize enqueue; abort stale jobs via `isEndCycleTokenStale`; cancel pending end-cycle jobs on resume |
| **ALTERNATIVES REJECTED** | Movement-after-end finalize guard (blocked legitimate ends); broad timeout tuning; mid-gap split threshold change |
| **EXPECTED EFFECT** | Motor-off pauses within same journey stay on end path until fresh post-boundary motion; resumed trips cannot be closed by stale finalize jobs |
| **VALIDATION** | `trip-fsm-motor-off-pause-r10.spec.ts`, `trip-detection.spec.ts` |
| **PRODUCTION STATUS** | **Not deployed** — fix on branch only |
| **NON_EFFECTS** | Does not change R9 RESTING-only primary wake; does not alter mid-gap split drift thresholds |
| **EVIDENCE** | TDL-EVID-R10-KS-MX-001 |

---

## TDL-DEC-R9-CX-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Prior governance alignment deferred DIMO authority despite substantive `dimo-webhook.controller.ts` changes |
| **WHY** | Cross-module substantive integration requires both owning authorities per AGENTS.md |
| **CHANGE** | Document boundary: DIMO owns provider webhook endpoint/auth/envelope; Trip Detection owns wake evidence, eligibility, mailboxes, handoff, FSM semantics |
| **OWNERSHIP** | DIMO Integration = provider gateway; Trip Detection = wake/lifecycle authority |
| **FAILURE SEMANTICS** | DIMO returns `wakeOutcome` from Trip intake; webhook auth failures remain DIMO-owned |
| **NON_EFFECTS** | DIMO does not become Trip FSM authority; Trip Detection does not own DIMO provider transport |
| **EVIDENCE** | TDL-EVID-R9-AUDIT-001; DIM-DEC-R9-001 |
| **PRODUCTION STATUS** | Runtime **deployed** @ `0ba96e03…`; provider R9 trigger wiring **validated** (5/5 active cohort — TDL-EV-R9-CANARY-001). **Natural end-to-end wake not PRODUCTION_VALIDATED.** |
| **OPEN GAPS** | Natural R9 wake observation (DIM-GAP-006 cross-ref); segment reconciliation split (TDL-CX-006 partial); stale mirror for 190497 (DIM-GAP-005 cross-ref) |

---

## TDL-DEC-R9-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Tiered snapshot polling only; provider trigger wake lacked durable start-liveness path |
| **WHY** | RESTING vehicles could miss trip starts when polling cadence lagged provider ignition/speed signals |
| **CHANGE** | R9 start-liveness ingress subsystem around canonical `dimo.snapshot.poll` path |
| **NON-EFFECTS** | Does not replace TripDecisionEngine lifecycle authority or R4 start scoring |
| **EVIDENCE** | TDL-EVID-R9-AUDIT-001 |

---

## TDL-DEC-R9A-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Destructive mailbox consume and same-ID successor self-coalescing races |
| **WHY** | Lost wakes under concurrent provider events and ACTIVE canonical jobs |
| **CHANGE** | Atomic Redis pending/successor mailboxes; durable-first coalesce; logical wake origin |
| **EVIDENCE** | TDL-EVID-R9-AUDIT-001 |

---

## TDL-DEC-R9B-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Stable handoff jobId reused for successor dispatch coalesced against itself |
| **WHY** | Post-terminal successor never ran |
| **CHANGE** | Separate handoff queue; BullMQ DelayedError rearm design (completed in R9C) |
| **EVIDENCE** | TDL-EVID-R9-AUDIT-001 |

---

## TDL-DEC-R9C-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Generation-1 probes could chain; stale successor ACK ordering issues |
| **WHY** | Unbounded probe recursion and handoff false completion |
| **CHANGE** | Gen-1 terminal guard; fresh-covered-no-candidate ordering; DelayedError protocol |
| **EVIDENCE** | TDL-TEST-R9-001 |

---

## TDL-DEC-R9D-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | ACTIVE tail-race dropped post-finalize successor; READ_ERROR treated as MISSING |
| **WHY** | Coalesce after snapshot completion could strand pending wake without successor |
| **CHANGE** | Continuation classifier (RESTING + eligible); strict FOUND/MISSING/READ_ERROR reads |
| **EVIDENCE** | TDL-EVID-R9-AUDIT-001 |

---

## TDL-DEC-R9E-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | UNKNOWN handoff false success; obsolete successor/pending ACK used latest version under stale classification |
| **WHY** | Handoff completed while successor remained; newer wakes deleted incorrectly |
| **CHANGE** | UNKNOWN → SnapshotWakeHandoffDeferError; bounded exact-version retirement |
| **EVIDENCE** | TDL-TEST-R9-001 |

---

## TDL-DEC-R9F-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | UNKNOWN outside dispatchSuccessorHandoff had no bounded execution path |
| **WHY** | reconcile/afterSnapshot/scheduleDurable paths preserved pending but never scheduled retry |
| **CHANGE** | scheduleUnknownContinuationRetryHandoff applied consistently with explicit enqueue outcomes |
| **EVIDENCE** | TDL-TEST-R9-001 |

---

## TDL-DEC-R11-001

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **NUMBERING** | Trip Detection decision register R11 — distinct from R9 canary / unrelated CI R11 labels |
| **CI / MERGE** | Runtime subset merged @ `32526c95a` (#1584); Jest A–J PASS; design-only 45 s TTL, PD-2, Ignition-OFF webhook **not activated** |
| **DESIGN BASIS** | [KS_MS_661_EMPTY_CORE_SOLUTION_PROPOSAL_2026-09-08.md](../evidence/KS_MS_661_EMPTY_CORE_SOLUTION_PROPOSAL_2026-09-08.md) (PROPOSED contract); Production forensics TDL-EVID-KS-MS-661-001 … TEMPORAL-001 |
| **BEFORE** | Worker-time empty-core anchor; stale VLS/engine-load blocks; inner gate reason overwritten; no pause tagging; fixed 30 s tick only |
| **WHY** | KS MS 661 @ `684950419…`: empty-core gate never reached `POSSIBLE_END`; dual block operational timer + fresh/stale VLS ACTIVE; post-IDLE **`vls_engine_load_active` → stale/UNKNOWN** — **not** `vls_row_absent` (see TDL-EVID-KS-MS-661-002) |
| **CHANGE** | Provider operational anchor; `stopBoundaryAt` + explicit ignition-OFF VLS anchoring; pause detection; inner/outer forensics; fetch taxonomy; bounded backoff; active continuity post-boundary filter; **no PD-2**; **no default 45 s TTL** |
| **TIME BOUNDARIES** | End corroboration + operational silence: **120 s** (`TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS`); backoff 30–600 s + jitter; **45 s positive TTL = PROPOSED only (PD-3, not activated)** |
| **VALIDATION** | TDL-EVID-R11-IMPL-001 — Jest scenarios A–**J** CI PASS @ merge `32526c95a`; design prototype S1–S9 (TDL-EVID-KS-MS-661-SCENARIOS-001) |
| **MERGE STATUS** | **Merged to main** @ `32526c95a` (#1584) |
| **PRODUCTION STATUS** | **Deployed** @ `f7eb94cb…` (`20260909024150_v4994`, TDL-EV-R11-PROD-DEPLOY-001) — **POST_DEPLOY_HEALTH_CONFIRMED**; scenario `KS_MS_661_NATURAL_DRIVE_R11`: start/resume **observed** (TDL-EVID-KS-MS-661-R11-NATURAL-001 Axes A/B/D PASS); end path **NOT validated** (Axis E FAIL — 0× POSSIBLE_END, `stopBoundaryAt` null) |
| **NON_EFFECTS** | R10 finalize guards unchanged; PD-2 LOW UNKNOWN candidacy not enabled; Ignition-OFF DIMO webhook not registered; no provider subscription changes |
| **EVIDENCE** | TDL-EVID-R11-IMPL-001; TDL-EVID-KS-MS-661-002; TDL-EVID-KS-MS-661-PROPOSAL-001; TDL-EVID-KS-MS-661-TEMPORAL-001; TDL-EVID-KS-MS-661-REPRO-001; **TDL-EVID-KS-MS-661-R11-NATURAL-001** |

---

## TDL-DEC-R12-001

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | `stopBoundaryAt` primarily from IDLE transition; ACTIVE_TRIP stationary shutdown without IDLE leaves boundary null; stale UNKNOWN VLS blocks empty-core end forever |
| **WHY** | KS MS 661 R11 natural drive (`TDL-EVID-KS-MS-661-R11-NATURAL-001`): Axis E FAIL — trip `3b26019d…` stuck ACTIVE_TRIP; completed later via STALE_ONGOING repair @ 06:51:54Z |
| **CHANGE** | `resolveProviderStopBoundaryCandidate()` on ACTIVE_TICK; `assessBoundaryBackedEmptyCoreSilence()` for trusted boundary + `vls_stale_provider_observation` only; credible post-boundary movement filter; `resolvePossibleEndBoundaryCandidate()` prefers provider stop boundary |
| **ALTERNATIVES REJECTED** | Coerce UNKNOWN→INACTIVE; timer-only end fallback; direct finalize from ACTIVE_TRIP; global 45s TTL; PD-2 |
| **EXPECTED EFFECT** | Normal POSSIBLE_END after parked vehicle sleep when provider-time stop boundary exists; short pauses preserve same trip; fresh movement still blocks end |
| **VALIDATION** | TDL-EVID-R12-IMPL-001 — **CI_VALIDATED** @ `091c478af…` run 34360964547 (first head `f92cd1ff…` failed run 34354237230) |
| **PRODUCTION STATUS** | **Not deployed** |
| **NON_EFFECTS** | 120s threshold unchanged; R10 finalize guards unchanged; UNKNOWN semantic unchanged; no provider subscription changes |
| **EVIDENCE** | TDL-EVID-R12-IMPL-001; TDL-EVID-KS-MS-661-R11-NATURAL-001 |

---

## TDL-DEC-QS-V1-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Divergent mid-gap thresholds (180_000 ms legacy default) across orchestration, merge/reopen, reconciliation, and quality read paths |
| **WHY** | Operators and repair logic need one canonical qualified-stop duration for same-trip vs split decisions |
| **CHANGE** | Single max same-trip qualified stop **300_000 ms**; `durationMs <= max` → SAME_TRIP; `durationMs > max` → SPLIT; shared resolver/config across orchestration, live mid-gap, merge/reopen, reconciliation, `TripQualityDetector` |
| **INDEPENDENT AUTHORITY** | `MAX_IGNORABLE_UNCOVERED_SPAN_SECONDS=180` remains repair/coverage — **not** the V1 qualified-stop contract |
| **VALIDATION** | CI + Production read-only acceptance TDL-EVID-QS-V1-PROD-ACCEPT-001 |
| **PRODUCTION STATUS** | **PRODUCTION_PRESENT** @ `99d722b4…` (#1753 merge `b0a7cd089…`); natural SAME_TRIP **3/3 PASS**; classification **`PASS_WITH_EVIDENCE_GAPS`** — **not** `FULLY_PRODUCTION_VALIDATED` |
| **NON_EFFECTS** | Does not auto-repair historical trips; does not grant DIMO segments live FSM override authority (see TDL-DEC-OQ006-001); does not close TDL-OQ-007 for all R1–R8 paths |
| **EVIDENCE** | TDL-EVID-QS-V1-PROD-ACCEPT-001; [QUALIFIED_STOP_CONTRACT_V1_2026-09-24.md](../evidence/QUALIFIED_STOP_CONTRACT_V1_2026-09-24.md) |

---

## TDL-DEC-OQ001-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | TDL-OQ-001 OPEN — no canonical authority for COMPLETED → DI durable handoff |
| **WHY** | Operators and downstream modules need a single documented contract separating trip lifecycle commit from DI V2 ingress, recovery, and legacy parallel paths |
| **CHANGE** | **`TripPostFinalizeAnalysisProducer.produceAfterPersistedCompletion`** after persisted COMPLETED → **`DrivingAnalysisInitService.initializeForCompletedTrip`** → PG **`DrivingAnalysisRun` + `DrivingIntelligenceJob`** → BullMQ **`driving.intelligence.jobs`**; recovery via **`DrivingAnalysisReconciliationService`** |
| **NON-EFFECTS** | Does not merge legacy `trip.behavior.enrichment` into DI V2; does not make DB completion and queue enqueue atomic |
| **PRODUCTION STATUS** | Read-only audit @ `99d722b4…`: **0** COMPLETED trips without TRIP_ENRICHMENT run in **14d** (n=210) |
| **VERDICT** | **`RESOLVED_WITH_BOUNDED_GAPS`** — see TDL-EVID-OQ001-HANDOFF-001 |
| **EVIDENCE** | TDL-EVID-OQ001-HANDOFF-001 |

---

---

## TDL-DEC-OQ006-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | TDL-OQ-006 / DIM-GAP-001 OPEN — unclear whether DIMO segments or live FSM own canonical trip boundaries when both exist |
| **WHY** | Cross-module operators need a single conflict-safe contract for start/end/split when provider segments arrive after live FSM persistence |
| **CHANGE** | **Live FSM + `TripDecisionEngine`** own lifecycle boundaries; **`DimoSegmentsService`** is transport/normalization only; **`TripReconciliationService`** consumes segments as repair evidence (missing trip, optional partial extension) under overlap/partial-boundary/qualified-stop gates; **DI segment validation read-only** |
| **NON-EFFECTS** | Does not re-enable V1 segment sync writers; does not make mechanism fallback order a live FSM hierarchy; does not auto-merge/unsplit live mid-gap decisions from DIMO alone |
| **PRODUCTION STATUS** | Read-only @ `99d722b4…`: 7 partial boundary repairs, 134 DIMO missing-trip applies (90d), 672 suppressions, 0 confirmed boundary corruption |
| **VERDICT** | **`RESOLVED_WITH_BOUNDED_GAPS`** — see TDL-EVID-OQ006-BOUNDARY-001 |
| **EVIDENCE** | TDL-EVID-OQ006-BOUNDARY-001 |

---

## TDL-DEC-OQ007-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | TDL-OQ-007 **PARTIALLY_RESOLVED** — QS acceptance alone could not seal per-behavior R1–R8 Production validation |
| **WHY** | Promotion and operator claims must separate **merged**, **present**, and **validated**; superseded R1–R8 semantics must not be forced through natural replay |
| **CHANGE** | Behavior-level matrix (18 contracts) with survivorship vs R9–R12 + post-R12 hardening; reuse KS661/WOB/#1674/QS natural evidence; read-only fleet SQL @ `2026-09-25T12:31:04Z` |
| **NON-EFFECTS** | Does not claim **`FULLY_PRODUCTION_VALIDATED`** for QS; does not close OQ-003/004/008/009/010; does not require new physical drives for OQ-007 closure |
| **PRODUCTION STATUS** | LIVE @ `99d722b4…`; 0 ONGOING; 0 FSM/trip divergence; failure signatures **NOT_OBSERVED_IN_AUDIT_WINDOW** |
| **VERDICT** | **`RESOLVED_BY_SCOPE_REDUCTION`** — see TDL-EVID-OQ007-R1R8-COV-001 |
| **EVIDENCE** | TDL-EVID-OQ007-R1R8-COV-001 |

---

## TDL-DEC-OQ002-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | TDL-OQ-002 / TDL-GAP-002 OPEN — unclear whether `drive-profile/` belongs to Trip Detection vs Battery vs shared layer |
| **WHY** | Cross-authority audit required before TDL promotion; physical adjacency to `trips/` is not ownership proof |
| **CHANGE** | **Battery V2 owns** `drive-profile/` resolver stack; TDL **explicit non-ownership**; distinguish from `VehicleDetectionProfile` |
| **ALTERNATIVES REJECTED** | TDL owns (no runtime dependency); shared neutral layer (implementation is `BatteryDriveProfile`-typed and battery-policy-coupled) |
| **EXPECTED EFFECT** | Agents do not extend trip FSM via drive-profile; battery work owns classification changes |
| **NON-EFFECTS** | Does not move files or rename module in this decision |
| **VALIDATION** | Repository consumer graph + zero trip FSM imports — TDL-EVID-OQ002-DRIVE-PROFILE-001 |
| **EVIDENCE** | TDL-EVID-OQ002-DRIVE-PROFILE-001 |
