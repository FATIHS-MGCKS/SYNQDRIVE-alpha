# Trip Detection & Lifecycle — Decision Register

Append-only architectural decisions. Complete for the declared authority scope as of Phase 5 (2026-09-26, TDL-DEC-PHASE5-001; TDL-GAP-011 resolved). R9 packages indexed at abstraction level; detail in supporting audit evidence. Status changes are recorded in each section's **STATUS HISTORY** — prior wording is preserved, never deleted.

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
| TDL-DEC-R10-001 | End-boundary-anchored activity resume + stale finalize guards | VALIDATED | TDL-EVID-R10-KS-MX-001 |
| TDL-DEC-R10-002 | Legacy tokenless FINALIZE admission without silent token assignment | VALIDATED | TDL-EVID-R10-KS-MX-001 |
| TDL-DEC-R11-001 | Empty-core evidence contract (pause, provider anchor, stop boundary) | VALIDATED | TDL-EVID-R11-IMPL-001; TDL-EVID-KS-MS-661-PROPOSAL-001; TDL-EVID-KS-MS-661-002; KS661 audit corpus |
| TDL-DEC-OQ002-001 | drive-profile ownership — Battery V2 owns; TDL non-owner | VALIDATED | TDL-EVID-OQ002-DRIVE-PROFILE-001 |
| TDL-DEC-OQ006-001 | DIMO segment vs live FSM boundary authority | VALIDATED | TDL-EVID-OQ006-BOUNDARY-001 |
| TDL-DEC-OQ007-001 | R1–R8 Production validation coverage — behavior matrix + scope reduction | VALIDATED | TDL-EVID-OQ007-R1R8-COV-001 |
| TDL-DEC-OQ004-001 | Route artifact coverage policy — taxonomy, eligibility, Mapbox vs artifact vs MATCHED | VALIDATED | TDL-EVID-OQ004-ROUTE-COV-001 |
| TDL-DEC-OQ008-001 | Trip runtime-control matrix — code default vs Production effective separation | VALIDATED | TDL-EVID-OQ008-FLAG-MATRIX-001 |
| TDL-DEC-OQ009-001 | Tiered snapshot polling + R9 provider-wake ingress contract | VALIDATED | TDL-EVID-OQ009-R9-INGRESS-001 |
| TDL-DEC-OQ010-001 | Legacy/duplicate trip runtime path inventory — bounded dual post-finalize pipelines | VALIDATED | TDL-EVID-OQ010-LEGACY-INV-001 |
| TDL-DEC-OQ005-001 | TripDetectionState.ENDED — historical compat only; RESTING terminal FSM | VALIDATED | TDL-EVID-OQ005-ENDED-001 |
| TDL-DEC-R12-001 | Provider-time stop boundary + boundary-backed end liveness | VALIDATED | TDL-EVID-R12-IMPL-001; TDL-EVID-KS-MS-661-R11-NATURAL-001 |
| TDL-DEC-QS-V1-001 | Qualified Stop Contract V1 shared duration authority | VALIDATED | TDL-EVID-QS-V1-PROD-ACCEPT-001 |
| TDL-DEC-OQ001-001 | COMPLETED trip → Driving Intelligence V2 durable handoff contract | VALIDATED | TDL-EVID-OQ001-HANDOFF-001 |
| TDL-DEC-OQ003-001 | Detection-state vs tracking-run cardinality contract | VALIDATED | TDL-EVID-OQ003-CARDINALITY-001 |
| TDL-DEC-P1-001 | Single lifecycle writer + FSM persistence split | VALIDATED | TDL-EVID-CODE-OWNERSHIP-001; TDL-EVID-OQ010-LEGACY-INV-001; TDL-EVID-PHASE5-FSM-CODE-001 |
| TDL-DEC-R1R8-001 | R1–R8 FSM behavioral contracts (consolidated) | VALIDATED | TDL-EVID-OQ007-R1R8-COV-001; TDL-EVID-OQ007-1-PASSIVE-CLOSURE-001 |
| TDL-DEC-ROUTE-V2-001 | Route V2 chunked matching authority | VALIDATED | TDL-EVID-OQ004-ROUTE-COV-001; TDL-EVID-OQ010-LEGACY-INV-001 |
| TDL-DEC-PHASE5-001 | Promote authority to `AUTHORITY_ACTIVE` (Gate A 17/17) | VALIDATED | TDL-EVID-PHASE5-FSM-CODE-001; TDL-EVID-PHASE5-PROD-BASELINE-001 |

---

## TDL-DEC-R10-002

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **STATUS HISTORY** | 2026-09-08 PROPOSED, PRODUCTION STATUS "Not deployed" → deployed with R10 @ `684950419…` (TDL-EV-R10-PROD-DEPLOY-001) → present in live `2b54a357…` → **VALIDATED** (Phase 5, 2026-09-26; code + CI + Production presence; not `PRODUCTION_VALIDATED` for every path) |
| **BEFORE** | Tokenless FINALIZE jobs returned `ok` from `isEndCycleTokenStale` whenever FSM ≠ `ACTIVE_TRIP` — cycle-A legacy job could finalize cycle-B episode |
| **WHY** | Review gap: A→resume→B with legacy waiting job while FSM again `POSSIBLE_END`; `ACTIVE_TRIP` guard alone insufficient |
| **CHANGE** | Tokenless jobs require `requestedAt` ≥ `possibleEndEnteredAt`; optional `pendingFinalizeCycleToken` evidence stamp; pre-write admission re-check before `finalizeTrip`; pre-clock episodes without entered-at clock retain backward compat |
| **ALTERNATIVES REJECTED** | Assign current `endCycleToken` to tokenless jobs at consume time (masks stale jobs as current) |
| **EXPECTED EFFECT** | Stale legacy jobs rejected; valid cycle-B jobs still complete; duplicate consumer does not double-complete |
| **VALIDATION** | `trip-fsm-motor-off-pause-r10.spec.ts` H–J; `trip-finalize-end-cycle.postgres.integration.spec.ts` (gated) |
| **PRODUCTION STATUS** | **Present** in live `2b54a357…` (`pendingFinalizeCycleToken`, `resolveEndCycleToken` markers — Phase 5). Historical at decision time: **Not deployed** |
| **DEPLOY PREREQUISITE** | All PM2 trip-tracking replicas must run R10+ before legacy tokenless safety is authoritative — old workers bypass new guards during rolling deploy |
| **EVIDENCE** | TDL-EVID-R10-KS-MX-001 |

---

## TDL-DEC-R10-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **STATUS HISTORY** | 2026-09-08 PROPOSED, PRODUCTION STATUS "Not deployed — fix on branch only" → deployed @ `684950419…` (TDL-EV-R10-PROD-DEPLOY-001) → present in live `2b54a357…` → **VALIDATED** (Phase 5, 2026-09-26) |
| **BEFORE** | `hasActivityResumed` scanned fetched points without `resumeAfterAt`; stale waiting `FINALIZE` jobs blocked re-enqueue (`skipped`); `processFinalize` lacked end-cycle correlation |
| **WHY** | KS MX 2026-09-08: false resume during motor-off gap; true end @ ~05:02:45 not persisted despite `scheduleFinalize` @ 05:17:36 |
| **CHANGE** | Anchor resume to end boundary; `endCycleToken=possibleEndEnteredAt` on `ev`/`fin` jobs; recycle waiting slot before finalize enqueue; abort stale jobs via `isEndCycleTokenStale`; cancel pending end-cycle jobs on resume |
| **ALTERNATIVES REJECTED** | Movement-after-end finalize guard (blocked legitimate ends); broad timeout tuning; mid-gap split threshold change |
| **EXPECTED EFFECT** | Motor-off pauses within same journey stay on end path until fresh post-boundary motion; resumed trips cannot be closed by stale finalize jobs |
| **VALIDATION** | `trip-fsm-motor-off-pause-r10.spec.ts`, `trip-detection.spec.ts` |
| **PRODUCTION STATUS** | **Present** in live `2b54a357…` (Phase 5 marker check). Historical at decision time: **Not deployed** — fix on branch only |
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
| **OPEN GAPS** | Natural R9 wake observation (DIM-GAP-006 cross-ref); segment reconciliation split (TDL-CX-006 partial); stale mirror for **`HISTORICALLY_EXCLUDED_FORMER_FLEET_ASSET`** (DIM-GAP-005 cross-ref) |

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
| **STATUS** | VALIDATED |
| **STATUS HISTORY** | PROPOSED (2026-09-08) → merged `32526c95a` (#1584) → deployed `f7eb94cb…` (TDL-EV-R11-PROD-DEPLOY-001) → present in live `2b54a357…` → **VALIDATED** (Phase 5, 2026-09-26). Natural end path remains limited by TDL-GAP-014 — not `PRODUCTION_VALIDATED` |
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
| **STATUS** | VALIDATED |
| **STATUS HISTORY** | PROPOSED, PRODUCTION STATUS "Not deployed" (2026-09-09) → pre-hardening R12 deployed `157b3c72…` (TDL-EV-R12-PROD-DEPLOY-001) → hardening follow-ups (#1600, #1627, #1635, #1674) → present in live `2b54a357…` → **VALIDATED** (Phase 5, 2026-09-26); not `PRODUCTION_VALIDATED` for every path |
| **BEFORE** | `stopBoundaryAt` primarily from IDLE transition; ACTIVE_TRIP stationary shutdown without IDLE leaves boundary null; stale UNKNOWN VLS blocks empty-core end forever |
| **WHY** | KS MS 661 R11 natural drive (`TDL-EVID-KS-MS-661-R11-NATURAL-001`): Axis E FAIL — trip `3b26019d…` stuck ACTIVE_TRIP; completed later via STALE_ONGOING repair @ 06:51:54Z |
| **CHANGE** | `resolveProviderStopBoundaryCandidate()` on ACTIVE_TICK; `assessBoundaryBackedEmptyCoreSilence()` for trusted boundary + `vls_stale_provider_observation` only; credible post-boundary movement filter; `resolvePossibleEndBoundaryCandidate()` prefers provider stop boundary |
| **ALTERNATIVES REJECTED** | Coerce UNKNOWN→INACTIVE; timer-only end fallback; direct finalize from ACTIVE_TRIP; global 45s TTL; PD-2 |
| **EXPECTED EFFECT** | Normal POSSIBLE_END after parked vehicle sleep when provider-time stop boundary exists; short pauses preserve same trip; fresh movement still blocks end |
| **VALIDATION** | TDL-EVID-R12-IMPL-001 — **CI_VALIDATED** @ `091c478af…` run 34360964547 (first head `f92cd1ff…` failed run 34354237230) |
| **PRODUCTION STATUS** | **Present** in live `2b54a357…` (`providerSilenceCandidateAt`, `ensurePossibleEndClockDurability`, `resolveChSkipResumeRevalidationHandoffReason` markers — Phase 5). Historical at decision time: **Not deployed** |
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
| **WHY** | Promotion claims must separate **merged**, **present**, and **validated**; superseded paths must not force replay; active PP_NOT_VALIDATED gaps must keep OQ-007 open |
| **CHANGE** | Behavior matrix (18 exclusive classes); survivorship vs R9–R12; passive addendum @ `2026-09-25T12:41Z`; fleet SQL + evidence reuse |
| **NON-EFFECTS** | Does not claim **`FULLY_PRODUCTION_VALIDATED`** for QS; does not close OQ-003/004/008/009/010 |
| **PRODUCTION STATUS** | LIVE @ `99d722b4…`; 4 active **PRODUCTION_PRESENT_NOT_VALIDATED**; no runtime defect |
| **VERDICT** | **`RESOLVED_BY_SCOPE_REDUCTION`** — OQ-007.1 closed remaining active gaps (TDL-EVID-OQ007-1-PASSIVE-CLOSURE-001) |
| **EVIDENCE** | TDL-EVID-OQ007-R1R8-COV-001; TDL-EVID-OQ007-1-PASSIVE-CLOSURE-001 |

---

## TDL-DEC-OQ003-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | TDL-OQ-003 / TDL-GAP-003 OPEN — operators compared `vehicle_trip_tracking_runs` volume to `vehicle_trip_detection_states` row count as if missing FSM coverage |
| **WHY** | Cardinality misunderstanding drives false defect reports; reconciliation can create trips without FSM rows |
| **CHANGE** | **One detection-state row max per vehicle** (lazy `getOrCreateDetectionState`); **tracking runs append-only during Vehicle lifetime** (no production GC; cascade-delete on Vehicle delete); coverage metric = eligible scheduler cohort with state / eligible cohort; never compare raw run count to state count |
| **NON-EFFECTS** | Does not pre-provision FSM rows for non-telematics vehicles; does not add GC for tracking runs; does not change scheduler eligibility |
| **PRODUCTION STATUS** | Read-only @ `99d722b4…`: 6 state rows = 6 scheduler-eligible; 4273 runs/7d on 4 vehicles; 0 eligible-without-state |
| **VERDICT** | **`RESOLVED_EXPECTED_CARDINALITY`** |
| **EVIDENCE** | TDL-EVID-OQ003-CARDINALITY-001 |

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

---

## TDL-DEC-OQ004-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | TDL-OQ-004 OPEN — ~4.7% all-time artifact/trip ratio conflated with Mapbox/FMM bottleneck; no durable coverage policy |
| **WHY** | Route V2 separates artifact existence, canonical read readiness, and MATCHED quality; post-finalize DI pipeline eligibility dominates historical gaps |
| **CHANGE** | Adopt three-tier policy: (1) **artifact** — 100% for route-eligible trips with ROUTE stage COMPLETED post–Route V2 anchor; (2) **canonical render** — MATCHED→FILTERED→RAW hierarchy when ≥2 measured points; (3) **MATCHED** — observational KPI from FILTERED `failure_reason`, not correctness gate. Canonical matcher = **TripRouteChunkedMatcherService**; FMM **SCAFFOLD** only |
| **ALTERNATIVES REJECTED** | FMM as Production bottleneck (no runtime callsite); 100% MATCHED as coverage target; all-time completed/trip ratio without eligibility denominator |
| **EXPECTED EFFECT** | OQ-004 closed; H3 partially confirmed; follow-up slice for handler/job artifact contract if product requires strict artifact invariant |
| **PRODUCTION STATUS** | **7d artifact 100%**; **observed materialization era 374/374** @ `8a1d9c658…`; exact Route-V2 30d policy **NOT_EXACTLY_COMPUTABLE** (R2 deploy **UNKNOWN**) |
| **NON-EFFECTS** | Does not change Mapbox gates or handler code in this audit |
| **VALIDATION** | Read-only SQL + code trace — TDL-EVID-OQ004-ROUTE-COV-001 |
| **EVIDENCE** | TDL-EVID-OQ004-ROUTE-COV-001 |

---

## TDL-DEC-OQ008-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | TDL-OQ-008 OPEN — code defaults conflated with Production; partial env name sampling only (TDL-GAP-007) |
| **WHY** | Rollback and incident response require ENV_KEY, CODE_DEFAULT, PRODUCTION_CONFIGURED, PRODUCTION_EFFECTIVE, consumer class, and shadow vs authoritative separation |
| **CHANGE** | Canonical matrix in TDL-EVID-OQ008-FLAG-MATRIX-001: 10 mode + 1 scope + 28 lifecycle knobs; Production @ `8a1d9c658…` read-only; replica config source **CONSISTENT**; effective flag state **inferred not introspected** |
| **EXPECTED EFFECT** | OQ-008 closed; OQ-009 can compare tiered polling doc vs Production **ACTIVITY_TIERED** mode without re-auditing flags |
| **PRODUCTION STATUS** | Snapshot **ACTIVITY_TIERED**; FSM shadow **enabled** (1 allowlisted vehicle); repair coverage **shadow** (legacy overlap authority); DI V2 master **on**, segment validation **off** |
| **NON-EFFECTS** | No env mutation; no promotion to `AUTHORITY_ACTIVE` |
| **VALIDATION** | Parser source trace + sudo `backend.env` grep — TDL-EVID-OQ008-FLAG-MATRIX-001 |
| **EVIDENCE** | TDL-EVID-OQ008-FLAG-MATRIX-001 |

---

## TDL-DEC-OQ009-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | TDL-OQ-009 OPEN — tiered polling doc vs R9 ingress conflated SCHEDULER_TICK with PER_VEHICLE_POLL; stale claims of pre-R9 Production and five-vehicle cohort as current |
| **WHY** | Operators need explicit separation of scheduler tick, tier due-time, provider wake, canonical snapshot fetch, and trip-start evaluation; fallback when R9 subscription missing must be provable |
| **CHANGE** | Canonical ingress graph in TDL-EVID-OQ009-R9-INGRESS-001: shared `snapshot-{vehicleId}` coordinator; RESTING-only provider wake; ACTIVITY_TIERED fallback 30s/60s/5m/30m; **R9_PROVIDER_AUTHORIZED_COHORT=5** with **100%** speed+ignition subscription coverage; **1** stale former-fleet scheduler mirror cross-ref DIM-GAP-005 |
| **ALTERNATIVES REJECTED** | Provider wake as trip boundary authority; parallel provider fetch without coalescing; ignition-off / low-speed as start wake; treating stale mirror as missing R9 subscription in cohort B |
| **EXPECTED EFFECT** | OQ-009 closed; agents separate DB scheduler cohort (6) from authorized R9 provider cohort (5) |
| **PRODUCTION STATUS** | R9 ancestor of `8a1d9c658…`; **ACTIVITY_TIERED**; movement threshold **3 km/h** default; recent wake KPIs **INSUFFICIENT_EVIDENCE** |
| **NON-EFFECTS** | No subscription mutation; no deploy; no change to tier env defaults |
| **VALIDATION** | Code trace + read-only Prisma cohort + `r9-post-get-audit.mjs` — TDL-EVID-OQ009-R9-INGRESS-001 |
| **EVIDENCE** | TDL-EVID-OQ009-R9-INGRESS-001 |

---

## TDL-DEC-OQ010-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | TDL-OQ-010 OPEN — unknown dead vs repair vs duplicate enrichment/route paths; risk of silent removal of reconciliation segment detectors or parallel DI/HF stacks |
| **WHY** | Promotion and cleanup slices require a complete productive-path inventory with lifecycle-writer proof, duplicate idempotency, and Production activity bounds |
| **CHANGE** | Canonical inventory in TDL-EVID-OQ010-LEGACY-INV-001: **`TripDecisionEngine`** sole `vehicleTrip.create` / `tripStatus` writer; pre-V2 segment detectors **ACTIVE_REPAIR**; post-finalize **DI V2 + legacy HF** both active; Route V2 via **`matchMapboxChunkDetailed`** (not `mapMatchRoute`); legacy Mapbox port + `mapMatchRoute()` **dead**; route enrich **3 entrypoints** with **DUPLICATE_EXECUTION_WASTEFUL_BUT_SAFE**; **41-row productive matrix** |
| **ALTERNATIVES REJECTED** | Treating `IgnitionSegmentDetector` / `MotionSegmentDetector` as dead legacy; treating orchestrator as globally sole behavior authority while DI V2 runs; removing legacy HF before V2 parity proven |
| **EXPECTED EFFECT** | OQ-010 closed; bounded debt tracked (wasteful duplicate provider fetch, stale orchestrator header comment); safe removal candidates isolated |
| **PRODUCTION STATUS** | @ `8a1d9c658…` — 7d **109** COMPLETED trips with behavior enrichment complete; **124** `DRIVING_ROUTE_ENRICH` DI jobs; dual pipelines observed |
| **NON-EFFECTS** | No runtime deletion; no promotion to `AUTHORITY_ACTIVE` |
| **VALIDATION** | Repository trace + read-only Production SQL — TDL-EVID-OQ010-LEGACY-INV-001 |
| **EVIDENCE** | TDL-EVID-OQ010-LEGACY-INV-001 |

---

## TDL-DEC-OQ005-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | TDL-OQ-005 OPEN — unclear whether `TripDetectionState.ENDED` is live, historical, or safe to delete |
| **WHY** | Promotion gate and schema cleanup require code + Production + migration evidence, not naming inference |
| **CHANGE** | TDL-EVID-OQ005-ENDED-001: **0** runtime read/write; finalize → **RESTING**; Production **0** live + **0** tracking ENDED rows @ live DB; **`ENDED_HISTORICAL_COMPAT_ONLY`**; **`RETAIN_HISTORICAL_COMPATIBILITY`**; **`REPURPOSE_NOT_JUSTIFIED`**; optional future enum removal = **`POSTGRES_ENUM_SCHEMA_MIGRATION_REQUIRED`** (no row backfill) |
| **ALTERNATIVES REJECTED** | Treat ENDED as active FSM state; repurpose label; `SAFE_TO_REMOVE_AFTER_DATA_MIGRATION` wording (no ENDED rows to migrate) |
| **EXPECTED EFFECT** | OQ-005 closed; TDL-CX-003 bounded; all TDL-OQ-001…010 closed |
| **PRODUCTION STATUS** | Read-only SQL @ 2026-09-26 — six FSM rows all **RESTING** |
| **NON-EFFECTS** | No Prisma/schema change in OQ-005 PR |
| **VALIDATION** | Repo grep + migration bootstrap + VPS read-only SQL |
| **EVIDENCE** | TDL-EVID-OQ005-ENDED-001 |

---

## TDL-DEC-P1-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Pre-P1 trip code had multiple writers of `VehicleTrip` rows / `tripStatus` (segment sync, orchestration, repair helpers) and FSM persistence mixed with lifecycle commits |
| **WHY** | One writer per concern makes lifecycle transitions auditable and prevents divergent trip truth between live detection, repair, and downstream enrichment |
| **CHANGE** | **`TripDecisionEngine`** is the sole `VehicleTrip` lifecycle writer (`createTrip`, `reopenTripForMerge`, `splitTripAtGap`, `finalizeTrip`, `discardTrip`, `createRepairedTrip`, `finalizeRepairedTrip`, `repairTripBoundaries*`); its `evaluate*` methods are pure. **`TripDetectionOrchestrationService.transitionState`** is the sole live FSM `state` writer. Detectors/resolvers are read-only |
| **ALTERNATIVES REJECTED** | Per-module writers (segment sync / enrichment writing trips); FSM state written from detectors |
| **EXPECTED EFFECT** | Every lifecycle mutation passes through one gated API; FSM state has one audited writer |
| **VALIDATION** | `TRIP_OWNERSHIP.ts` invariants; OQ-010 repository + Production inventory (no unknown writer); Phase 5 call-site census (34 `transitionState` call sites, one writer method) |
| **PRODUCTION STATUS** | Present since P1; OQ-010 read-only Production inventory found no other lifecycle writer |
| **NON_EFFECTS** | Does not constrain downstream read models (DI V2, ATE) that store their own analysis rows |
| **EVIDENCE** | TDL-EVID-CODE-OWNERSHIP-001; TDL-EVID-OQ010-LEGACY-INV-001; TDL-EVID-PHASE5-FSM-CODE-001 |

---

## TDL-DEC-R1R8-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | R1–R8 hardening packages were indexed only through the OQ-007 coverage matrix; no register entry recorded the current behavioral contracts they established |
| **WHY** | Gate A requires decisions/WHY for the declared scope; the live transition matrix (Phase 5) depends on these contracts |
| **CHANGE** | Consolidated current contracts: **R1** provider event-time authority for FSM clocks; **R2** lifecycle invariant preflight (`evaluateTripLifecycleInvariant`: ADOPT_ONGOING / REPOINT_ACTIVE_TRIP / RESET_TO_RESTING; `CONFLICT_*` fail closed); **R3** start liveness ordering (ACTIVE_TICK scheduled before battery await; PS exceptions rethrown for BullMQ retry); **R4** start detection consistency (shared start policy + freshness); **R5** end validation semantics (CUSUM end validation — partly superseded by R10–R12 end-cycle/boundary rules); **R6** mid-gap split safety (`drift==null` fails closed; threshold now QS V1 300 000 ms); **R7** terminal resting recovery (COMPLETED trip + stale FSM → RESET_TO_RESTING); **R8** observability/forensics (tracking runs, FSM shadow) |
| **SUPERSESSION MAP** | R5 end-path details → TDL-DEC-R10-001 / R10-002 / R11-001 / R12-001; R6 threshold → TDL-DEC-QS-V1-001 |
| **VALIDATION** | OQ-007 behavior matrix `RESOLVED_BY_SCOPE_REDUCTION` + OQ-007.1 passive closure; Phase 5 transition matrix TDL-TR-002/005/006/012/013/014 |
| **PRODUCTION STATUS** | Present in live `2b54a357…`; no active `PRODUCTION_PRESENT_NOT_VALIDATED` behavior after OQ-007.1 |
| **NON_EFFECTS** | Does not re-open superseded R5 paths; does not claim `FULLY_PRODUCTION_VALIDATED` for QS |
| **EVIDENCE** | TDL-EVID-OQ007-R1R8-COV-001; TDL-EVID-OQ007-1-PASSIVE-CLOSURE-001; TDL-EVID-PHASE5-FSM-CODE-001 |

---

## TDL-DEC-ROUTE-V2-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Legacy Mapbox port / `mapMatchRoute()` and an FMM scaffold coexisted with Route V2; ownership of route artifacts vs route-based scoring was implicit |
| **WHY** | Route artifacts are trip-geometry facts that downstream modules depend on; one canonical matcher and owner avoid duplicate geometry truth |
| **CHANGE** | Route artifacts are **TDL-owned**: `TripsService.enrichTrip` → `TripRouteArtifactMaterializerService.materializeFromMeasuredRoute` → `TripRouteChunkedMatcherService` → `MapboxChunkMatchingClientService` → **`MapboxService.matchMapboxChunkDetailed`** → `VehicleTripRouteArtifact`. `mapMatchRoute()` dead; FMM scaffold without Production callsite. Three downstream entry points (legacy HF P010, DI P014, manual HTTP P034) — duplicate execution wasteful but safe |
| **ALTERNATIVES REJECTED** | FMM as canonical matcher; route scoring inside TDL |
| **VALIDATION** | TDL-EVID-OQ004-ROUTE-COV-001 (7d route-eligible artifact coverage 100%); TDL-EVID-OQ010-LEGACY-INV-001 |
| **PRODUCTION STATUS** | Present in live `2b54a357…` |
| **NON_EFFECTS** | Behavior / safety scoring on routes remains DI / ATE owned; handler artifact contract follow-up stays TDL-GAP-008 |
| **EVIDENCE** | TDL-EVID-OQ004-ROUTE-COV-001; TDL-EVID-OQ010-LEGACY-INV-001 |

---

## TDL-DEC-PHASE5-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Registry coverage `AUDIT_IN_PROGRESS`; machine graph lacked FSM states/transitions/execution/boundaries (TDL-GAP-010); register missing P1/R1–R8/Route V2 and carried stale R10–R12 status (TDL-GAP-011) |
| **WHY** | All TDL-OQ-001…010 closed; `MODULE_AUTHORITY_STANDARD.md` Gate A must be evaluated item by item, not inferred from closed OQs |
| **CHANGE** | Full live FSM graph (5 live states + ENDED `SCHEMA_COMPAT_ONLY`, 14 validator-enforced transitions), execution/recovery/boundary graph, OQ-010 41-path mapping (14 graph + 27 boundary, 0 unmapped), decision register completion, Production baseline refresh @ `2b54a357…`; Gate A **17/17 PASS** → registry **`AUTHORITY_ACTIVE`** |
| **ALTERNATIVES REJECTED** | Promote on closed OQs alone; block promotion on QS V1 `PASS_WITH_EVIDENCE_GAPS` or optional ENDED enum cleanup (explicit limitations per standard §6) |
| **VALIDATION** | `validate-graph.sh` (extended), `validate-module-registry.sh`, `git diff --check` |
| **PRODUCTION STATUS** | Read-only re-observation @ `2b54a357…` / `20260926094359_v4994` (TDL-EVID-PHASE5-PROD-BASELINE-001); no mutation |
| **NON_EFFECTS** | No runtime, Prisma, env, or deploy change; explicit limitations listed in the Phase 5 evidence record stay open |
| **EVIDENCE** | TDL-EVID-PHASE5-FSM-CODE-001; TDL-EVID-PHASE5-PROD-BASELINE-001 |
