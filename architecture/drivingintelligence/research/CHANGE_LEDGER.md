# Driving Intelligence — Change Ledger

Granular scientific evolution record for the 2026-08-30 → 2026-09-06 workstream.  
**Not a conventional changelog.** Compressed "8 evolution" summary superseded by per-phase entries below.

**Full DI-EV detail:** [DI_EV_CHRONOLOGY.md](./DI_EV_CHRONOLOGY.md)  
**Narrative:** [WORKSTREAM_HISTORY.md](../WORKSTREAM_HISTORY.md)

---

## Phase 0 — Program launch

| DI-EV | Change | Evidence | Decision | Validation |
|-------|--------|----------|----------|------------|
| 0001 | Master reconstruction plan; gates G1–G6 | Master plan doc | Program authority | CONFIRMED |
| 0002 | Phase 1 forensic audit: post-trip HF, stress=vehicle load, DriverScore misname | Phase 1 audit | — | CONFIRMED_FROM_CODE |

---

## Phase 2 — DIMO signal surface (2026-08-31)

| DI-EV | Change | Key finding | Next step |
|-------|--------|-------------|-----------|
| 0003 | Query surface audit 2A | 41 fields; Q001–Q027 | 2B vehicle matrix |
| 0004 | Four-vehicle capability 2B | Union 33 signals; 15 unused | Schema expansion |
| 0005 | Schema expansion 2C | 117 provider fields | Physics matrix |
| 0006 | Signal value/physics 2D | Tier A = 8 cadence-critical | Redundancy |
| 0007 | Redundancy 2E | 33 canonical keys; episode taxonomy proposal | VCM design |
| 0008 | Capability-first acquisition 2F | T0–T7 tiers; query planner proposal | LTE manifest |
| 0009/0010 | LTE_R1 manifest 2F.1 | Frozen v1.1.0 JSON | Flight Recorder |

---

## Phase 3A — Flight Recorder & RD001 (2026-08-31 → 2026-09-01)

| DI-EV | Change | Key finding | Defect / negative |
|-------|--------|-------------|-------------------|
| 0011/0012 | RC foundation | Module + envelope v1.0.0 | — |
| 0013/0014 | Stationary canary | 52 obs; REFERENCE_DRIVE_READY | Motion unproven |
| 0015 | Evidence governance | Normative ID rules | — |
| 0016–0019 | **RD001** | Late-arrival differential; 151s gap | **VIDEO NOT CAPTURED** |
| 0020 | FAST PRE-ARM/GO | 15s cap; SIGNAL_POINT gate | — |
| 0021 | Watermark remediation | Per-field watermarks; RD001 39-exclusion fixed | DI-DEF-003 FIXED |

---

## Phase 3A.3 — RD002 motion canary (2026-09-02)

| DI-EV | Change | Key finding | Production impact |
|-------|--------|-------------|-------------------|
| 0022 | Production cutover smoke | Deploy `f00a49394` PASS | RC on prod |
| 0023–0026 | **RD002** C63 | **1s ≠ 1Hz**; sealed HF Δt P50 **13.489s**; AGGREGATE_BUCKET_V2 | Detectors unchanged |
| 0026 | C63 differential | Native events NOT_OBSERVED | Per-vehicle |

---

## Phase 3A.3 — RD003 + signal quality (2026-09-02 → 03)

| DI-EV | Change | Key finding | Does NOT prove |
|-------|--------|-------------|----------------|
| 0027–0032 | **RD003** Tiguan | Session `0fa040aa-…`; segmented video GT | Continuous video |
| 0033 | Correlation export | 5010 rows for alignment | GT itself |
| 0034A | Alignment workbench v1.2 | Multi-clock model | Validated GT |
| 0034B | Sparse video GT | 9 clips, 198 obs | GROUND_TRUTH_VALIDATED |
| 0034C | Discovery v1 | SUPERSEDED methodology | — |
| 0034D/D.1/D.2 | Discovery v2 | Joint DP; geometry fix | Global chronology |
| 0034E/E.1 | Signal quality | providerTimestamp authority; RD003 HF **~2.00s** median | Physical 1 Hz ECU |
| 0034F | Episode V2 design | Confidence layers; DEPLOYED=NO | Production scoring |

---

## RD004 — Alignment + late buckets (2026-09-04)

| DI-EV | Change | Key finding | Result |
|-------|--------|-------------|--------|
| 0035A→A.2 | **RD004-A** | H≠provider offset; 38 HF samples | Segment A closed |
| 0035B→B.3 | **RD004-B** early | Claims invalidated; launch gap 35.1s | — |
| 0035B.4 | Exact-window replay | 53 late; 26 watermark-excluded | Root cause proven |
| 0035B.5 | Overlap grid | 8/6 claims too strong | Superseded |
| 0035B.6 | Semantic closeout | Provisional 8s/6s; live calibration contract | → 0035C |

---

## HF Recovery V2 (2026-09-04)

| DI-EV | Change | Implementation | Production HF |
|-------|--------|----------------|---------------|
| 0035C | Recovery V2 runtime | Settlement, overlap, triple watermarks | **UNCHANGED** |

---

## Block polling C.1 — individual (2026-09-04 → 05)

| DI-EV | Change | Detail | Status |
|-------|--------|--------|--------|
| 0035C.1 | Block poll testbed | 30s poll hypothesis; 1s aggregation preserved | NOT_VALIDATED live |
| 0035C.1a | Pre-canary hardening | Fail-closed; bucket-age; stagger | FIXED defects 008–010 |
| 0035C.1b | Dynamic canary | Operator vehicle selection | KS MX = example only |
| 0035C.1c | Multi-cadence design | 10/20/30/60 one drive | NOT executed live |
| 0035C.1d | Phase atomicity | FOR UPDATE; REQUESTED vs EFFECTIVE | 103+ tests |
| 0035C.1e | Pre-live closure | Terminal finalization; real bucket IDs | PR #1533 merged |

**Granular C.1 detail:** [hf-request-cadence/C1_INDIVIDUAL_RETROSPECTIVE.md](./hf-request-cadence/C1_INDIVIDUAL_RETROSPECTIVE.md)

---

## Production deploy (2026-09-05)

| Event | State |
|-------|-------|
| PR #1533 merge | CODE_DEPLOYED=YES |
| REFERENCE_CAPTURE_INFRASTRUCTURE_ENABLED=YES; HF_RECOVERY_V2_FEATURE_ENABLED=NO |
| Live calibration | NOT EXECUTED |
| Authority | LEGACY post-trip HF |

---

## Parallel tracks (not compressed)

| Track | Ledger link |
|-------|-------------|
| V2 durable pipeline | DI-DEC-V2-FLAG-001; flag default off |
| Impact Engine V1 | DI-DEC-STRESS-NOT-DRIVER-001; v1.2.0 |
| Native LTE authority | DI-DEC-NATIVE-LTE-001 |
| High-timeframe analytics | PARTIAL — see `evidence/temporal-analytics/HIGH_TIMEFRAME_WORK.md` |

---

## Authority bootstrap (2026-09-06)

| Event | Detail |
|-------|--------|
| PR #1544 | `architecture/drivingintelligence/` canonical authority |
| Scope | Documentation only; runtime unchanged |

## DI-DEF-019 GATE 1 (2026-09-06)

| Event | Detail |
|-------|--------|
| Live cal blocked | KS MX 2024 — `42P01` on first `switchHfCalibrationPhase(10000)` |
| Fix | `lockSessionRow` → `reference_capture_sessions` + `organization_id` (text IDs) |
| GATE 1 | Real PostgreSQL integration suite — 10 tests PASS |
| Status | `FIXED_CODE_TESTED` after GATE 1; promoted to `FIXED_PRODUCTION_VALIDATED` after GATE 2 |
| Evidence | `evidence/reference-capture/DI_DEF_019_GATE1_POSTGRES_INTEGRATION_2026-09-06.md` |

## DI-DEF-019 GATE 2 (2026-09-06)

| Event | Detail |
|-------|--------|
| Deploy | PR #1550 merged; production SHA `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` |
| Vehicle | KS MX 2024 · token 187336 · stationary |
| Session 1 | `a0498b4a-…` — 10→20→30→60 EFFECTIVE + STOP → COMPLETED |
| Session 2 | `3d388fcd-…` — 10s EFFECTIVE + ABORT → ABORTED |
| SQL (Gate 2 window) | No 42P01/42703/42883/deadlock |
| Baseline | V2 canary disabled; PRODUCTION_HF_AUTHORITY=LEGACY restored |
| Status | `FIXED_PRODUCTION_VALIDATED` — **not** scientific cadence proof |
| Evidence | `evidence/reference-capture/DI_DEF_019_GATE2_PRODUCTION_DRESS_REHEARSAL_2026-09-06.md` |

## EXP-019 — Live HF calibration retry (2026-09-07)

| Event | Detail |
|-------|--------|
| Experiment | EXP-016 RETRY — one drive, one session, 10→20→30→60 on KS MX 2024 |
| sessionId | `2508b697-f101-4155-a0d3-8436e46bb779` |
| Result | All phases SUFFICIENT; SESSION COMPLETED; settlement replay T+25; **NO cadence conclusion** |
| Video GT | **Verified** — event register `EXP_019_VIDEO_GT_EVENT_REGISTER_2026-09-07.md` (5 windows) |
| Video alignment | `EXP_019_VIDEO_GT_ALIGNMENT_WINDOWS_2026-09-07.md` + VPS `/tmp/exp-019-video-alignment/` |
| Video GT correlation | `EXP_019_VIDEO_GT_VS_TELEMETRY_CORRELATION_2026-09-07.md` |
| Video GT event register | `EXP_019_VIDEO_GT_EVENT_REGISTER_2026-09-07.md` + `video-gt-event-register.json` |
| Bias-control pass | `EXP_019_BIAS_CONTROL_AND_DECISION_READINESS_2026-09-07.md` — 8 video-first control windows; cadence CRITICAL labels withdrawn; `ARCHITECTURAL_DECISION_READINESS=READY_FOR_EXPERIMENT_DESIGN_DECISION` |

## EXP-020 — Retrospective window geometry (2026-09-07)

| Event | Detail |
|-------|--------|
| Experiment | Settled HF query-window matrix on EXP-019 drive (read-only DIMO) |
| Reference | `EXP020_SETTLED_REFERENCE_UNION` — 446 speed buckets (obs + full-trip + full-session) |
| Window matrix | W060–W300 non-overlap: **identical 141-bucket union** — larger windows do not help when tiling |
| Post-trip | P1 whole-trip (1 req) ≈ best settled union; chunks add requests without new buckets |
| Gap expansion | EXACT/+300: 0 interior; FULL_PHASE: 0–2 sparse interior buckets per GT gap |
| First-obs age | P50 **~27s** (vs 8s live settlement delay) — settlement-timing co-factor |
| Hypotheses | H1/H2 NOT_SUPPORTED; H3 SUPPORTED; H4 CONTRADICTED (sole cause); H5 SUPPORTED (video fidelity) |
| Policy | PRODUCTION_HF_POLICY_CHANGE_AUTHORIZED=NO |
| Evidence | `EXP_020_RETROSPECTIVE_WINDOW_POST_TRIP_MATRIX_2026-09-07.md` + VPS `/tmp/exp-020/` |

## EXP-021 — Exact-SHA CI closure attempt (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **CI CLOSURE INCOMPLETE** (PR #1593 @ `88b918a73`) |
| i18n | `PRE_EXISTING_MAIN_TOOLING_DEFECT` — P2.3.4 tests bound to live PR; fix in [#1597](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1597) |
| Trip FSM CI | Not auto-triggered; manual dispatch required |
| RC tests | 641 total = 610 passed + 31 skipped (reconciled) |
| Evidence | `EXP_021_POST_1594_1595_REBASE_INTEGRATION_AUDIT_2026-09-10.md` §Exact-SHA CI closure |

## EXP-021 — Post-#1594/#1595 rebase integration audit (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **INTEGRATION AUDIT** (PR #1593 rebased on `7203b5bd6…`) |
| Rebase | Clean (0 conflicts); merge-base = current main; no Trip FSM file overlap |
| Contracts | PDI independent of Trip FSM completion; canonical WHOLE_TRIP requires COMPLETED; R12 AUD-002/003/004 unit green |
| Evidence | `EXP_021_POST_1594_1595_REBASE_INTEGRATION_AUDIT_2026-09-10.md` |

## EXP-021 — Fourth-pass scientific consistency micro-pass (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **MICRO-PASS FIX** (PR #1593 pre-merge) |
| Fixes | Cross-age PDI/WHOLE_TRIP maturation grouping; PDI candidate CONFIRMED overlay lifecycle; pre-deploy distinct speed timestamps with sliding window + sustained-park reset; strong parked evidence before UNKNOWN auto-stop |
| Tests | `PDI_CROSS_AGE_MATURATION_COMPARISON`, `WHOLE_TRIP_CROSS_AGE_MATURATION_COMPARISON`, `FIXED_INTERVAL_MATURATION_REGRESSION` PASS; reference-capture 605 tests |
| Evidence | `EXP_021_FINAL_PRE_PHYSICAL_RED_TEAM_AUDIT_2026-09-10.md` §Fourth-pass |

## EXP-021 — Third-pass micro-correction (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **MICRO-PASS FIX** (PR #1593 pre-merge) |
| Fixes | PDI schedule/execution timestamp separation; immutable observation hash; candidate overlay; start window recalc; deploy reset; wake-and-go recording; physical interval for VehicleTrip; no synthetic phase movement |
| Capability vs runtime | `PDI_30_PROSPECTIVE_CAPABILITY=YES`; `PDI_*_PROSPECTIVE_ACHIEVED=RUNTIME_ONLY` |
| Evidence | `EXP_021_FINAL_PRE_PHYSICAL_RED_TEAM_AUDIT_2026-09-10.md` §Third-pass |

## EXP-021 — Second-pass deterministic logic correction (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **SECOND-PASS FIX** (PR #1593 continuation) |
| Blockers fixed | PDI +30 at boundary not +150s; final phase validity; phase transition at effective boundary; urban start sliding window; ignition-off end; false-candidate provenance; PDI vs WHOLE_TRIP counts; VehicleTrip overlap ranking; full runtime config freeze; fail-closed movement accounting |
| Tests | Full-run simulation PASS; motion/orchestrator/settlement suites green |
| Revision analysis | `VALUE_REVISION_DETECTION` remains **NOT_IMPLEMENTED** |
| Evidence | `EXP_021_FINAL_PRE_PHYSICAL_RED_TEAM_AUDIT_2026-09-10.md` §Second-pass |

## EXP-021 — Final pre-physical red-team hardening (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **RED-TEAM AUDIT + HARDENING** (PR #1593 continuation) |
| Blockers fixed | Stale TARGET_SHA; unreachable deploy-movement gate; gear-as-speed; NULL=parked; lock-loss continue; arbitrary RECORDING attach; wall-clock phases while parked; whole-trip false prospective ages at auto-end; ONGOING trip binding; ERROR observation loss; enqueue/abort race; observation TOCTOU; loose experiment-active guard |
| New channel | `PHYSICAL_DRIVE_INTERVAL_SHADOW` (PDI probes) — true +30…+600 from drive-end candidate |
| Stationary cert | Real phase-60 EFFECTIVE proof + persisted schedule DB proof; optional `--e2e-shadow-smoke` |
| Revision analysis | `VALUE_REVISION_DETECTION` explicitly **NOT_IMPLEMENTED** |
| Evidence | `EXP_021_FINAL_PRE_PHYSICAL_RED_TEAM_AUDIT_2026-09-10.md` |

## EXP-021 — Settlement-shadow abort lifecycle (2026-09-09)

| Event | Detail |
|-------|--------|
| Status | **LIFECYCLE FIX + DURABILITY HARDENING** (PR #1593) |
| Defect | ABORTED RC sessions left `ACTIVE` settlement experiments + pending BullMQ jobs (2 orphans in post-deploy recert) |
| Fix | `cancelExperimentForAbortedSession`: experiment → `CANCELLED`, unobserved schedules → `SKIPPED`, jobs removed, observations preserved |
| Durability | Cleanup not feature-gated; atomic interactive transaction; reconciliation scheduler; cleanup failure surfaced; worker race guards |
| Normal stop | `stopRecording` / COMPLETED path unchanged — post-stop shadow continuation preserved |
| Tests | 11+ focused abort-lifecycle tests + reference-capture suite PASS |
| Evidence | `EXP_021_SETTLEMENT_SHADOW_ABORT_LIFECYCLE_2026-09-09.md` |

## EXP-021 — Audi re-run readiness hardening (2026-09-09)

| Event | Detail |
|-------|--------|
| Status | **STATIONARY CERT PASS** — V2 canary enabled for token 187361; orchestrator hardened in PR #1582 |
| Stuck session | `0aa0dd4f-…` → **ABORTED** (10,671 obs preserved) |
| V2 canary | `HF_RECOVERY_POLICY_V2_ENABLED=true`, canary-only, `CANARY_TOKEN_IDS=187361` (experiment-only) |
| Orchestrator | Pre-recording V2 gate, Redis single-instance lock, fatal session cleanup |
| Stationary cert | Phase 60 REQUESTED; calibration series created; prospective probes schedulable |
| Blocker | Hardened orchestrator **not deployed** — physical run awaits merge+deploy |
| Evidence | `EXP_021_AUDI_RERUN_READINESS_HARDENING_2026-09-09.md` |

## EXP-021 — Audi autonomous post-run forensic closeout (2026-09-09 evening)

| Event | Detail |
|-------|--------|
| Status | **DEGRADED** — settlement shadow **not executed**; cadence phases **blocked** |
| Session | `0aa0dd4f-6436-43d1-ae51-e23eaf947927` — RECORDING (stuck; no stop/complete) |
| Autonomous orchestrator | Deploy converged before RC; auto-start YES; phase activation FATAL @ 19:44:08 |
| Root cause | `HF_RECOVERY_POLICY_V2_ENABLED=false` + canary-only + Audi token **187361** not allowlisted → LEGACY blocks cadence |
| Fixed settlement | **0/48** observations; **0/8** probes; no maturation curves |
| Live RC capture | **PARTIAL** — 5,606 obs default LEGACY polling; 649 speed rows; max gap 125.76s |
| R12 natural run | Gap split `e62c964d`→`bd55f98d`; POSSIBLE_END not terminalized |
| Whole-trip confound | **YES** — pre-RC wake trip overlaps activity window |
| Mercedes comparison | **PARTIAL** — live gap sparsity similar; settlement maturation not replicated |
| Policy | PRODUCTION_POLICY_CHANGE_AUTHORIZED=NO |
| Evidence | `EXP_021_AUDI_AUTONOMOUS_POST_RUN_FORENSIC_2026-09-09.md` |

## EXP-021 — Audi cross-vehicle supplemental re-arm (2026-09-09)

| Event | Detail |
|-------|--------|
| Status | **PRE-ARMED — NOT DRIVING** (telemetry stale) |
| Vehicle | **KS MS 661** Audi A4 2016 (`c10351f8-…`, token **187361**) |
| New session | `3cc8465a-6977-4912-981c-63052398514c` READY; old `619284b3-…` ABORTED (not reused) |
| Fresh-trip gate | **PASS** — prior trip `e324ee8c-…` COMPLETED; FSM RESTING |
| Blocker | `LIVE_TELEMETRY_READY=NO` — provider age ~30516s; `VEHICLE_WAKE_REQUIRED=YES` |
| Settlement integrity | PR #1570 hardened runtime PASS; policy tests 9/9 on prod |
| Evidence | `EXP_021_AUDI_CROSS_VEHICLE_SUPPLEMENTAL_2026-09-08.md` §13 |

## EXP-021 — Audi cross-vehicle supplemental (2026-09-08 evening)

| Event | Detail |
|-------|--------|
| Status | **PHYSICAL DRIVE OUTSIDE RC** — `START EXP-021 NOW` never received |
| Vehicle | **KS MS 661** Audi A4 2016 (`c10351f8-…`, token **187361**) |
| Classification | `EXP021_CROSS_VEHICLE_SUPPLEMENTAL=YES`; `VEHICLE_CONFOUND_PRESENT=YES` |
| Cadence (planned) | **60→30→20→10** (not same-vehicle counterbalance vs EXP-019 KS MX) |
| Session | `619284b3-…` pre-armed READY → **ABORTED** `2026-09-08T20:06:12Z`; **startRecording NOT called** |
| Physical run | `EXP021_AUDI_PHYSICAL_RUN_EXECUTED=NO`; `EXP021_AUDI_DRIVE_CAPTURED=NO` |
| Operational trip | `e324ee8c-…` 19:36–19:59 UTC (Trip FSM, not RC-bound) |
| Settlement shadow | **NOT created** — no RECORDING session |
| KS MX session | `fb553442-…` left READY unstarted (different vehicle) |
| Go gate (post-wake) | `READY_TO_DRIVE=YES` at 19:40 UTC; operator did not send start command |
| Settlement integrity | Deployed PR #1570 hardened runtime PASS (unused this run) |
| Evidence | `EXP_021_AUDI_CROSS_VEHICLE_SUPPLEMENTAL_2026-09-08.md` |

## EXP-021 — Pre-drive integrity gate (2026-09-08)

| Event | Detail |
|-------|--------|
| Status | **HARDENED DRAFT** (PR #1570) — prospective probe A **and** B scheduling; whole-trip partial recovery |
| Deployed baseline | Fixed-interval schedules at phase completion only; +30/+60 late for both probes |
| First draft gap | Probe B still at completion — B+30 ~45s late, B+60 ~15s late |
| Final fix | `buildProspectiveProbeBForPhase` using nominal 300s offset at phase EFFECTIVE; runtime hook proven via `ReferenceCaptureProcessor` |
| Whole-trip | Partial schedule recovery (1–5 WHOLE_TRIP rows) now selected; idempotent fill to 6 ages |
| Tests | 21 settlement-shadow focused tests PASS; runtime lifecycle timing PASS |
| Physical drive | **NOT STARTED**; session **NOT CREATED** |
| Evidence | `EXP_021_PRE_DRIVE_INTEGRITY_GATE_2026-09-08.md` |

## EXP-021D — Stale session cleanup + go gate (2026-09-07)

| Event | Detail |
|-------|--------|
| Status | **PRODUCTION_READY** — preflight PASS; **no physical drive** |
| Stale session | `66f09794-…` pre-EXP-019 orphan → canonical **ABORTED**; 4459 obs preserved |
| Telemetry | Live DIMO `signalsLatest` fresh (15s provider age); DB latestState still stale — qualify via DIMO not CONNECTED |
| Shadow flag | `REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED=true` after clean-state gates; rolling 2-replica restart |
| Preflight | `EXP021_PREFLIGHT_PASS=YES`; sequence **60→30→20→10** |
| Policy | PRODUCTION_HF_POLICY_CHANGE_AUTHORIZED=NO |
| Evidence | `EXP_021D_STALE_SESSION_CLEANUP_AND_PREFLIGHT_2026-09-07.md` |

## EXP-021A — Settlement shadow tooling (2026-09-07)

| Event | Detail |
|-------|--------|
| Status | **IMPLEMENTED_NOT_PHYSICALLY_VALIDATED** |
| Flag | `REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED` default **false** |
| Scheduler | BullMQ `reference.capture.settlement-shadow` + persisted Prisma schedules + recovery scanner |
| Storage | `reference_capture_settlement_shadow_*` tables (immutable observations) |
| Trip authority | Whole-trip shadow ages from **VehicleTrip.endTime** (not session completion) |
| Bucket identity | `FIELD_PIPE_CANONICAL_ISO_MS` |
| Tests | 11 focused unit tests PASS; dry-run lifecycle PASS |
| Preflight | `backend/scripts/ops/reference-capture-exp-021-preflight.cjs` |
| Policy | PRODUCTION_HF_POLICY_CHANGE_AUTHORIZED=NO |

## EXP-021 — PR #1598 final red-team (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **RED-TEAM DRAFT** on PR #1598 |
| Fixes | Immutable persisted T0; recovery uses DB authority; orchestrator iteration survivability; reanchor validation; postgres T0 recovery integration harness |
| Evidence | `EXP_021_PR1598_FINAL_RED_TEAM_2026-09-10.md` |

## EXP-021 — PR #1598 final exact-SHA closure (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **CI CLOSURE COMPLETE** @ `33e680e5bf429272c7577ae082bfe6c4de1c5091` |
| Trip FSM CI | Run 34504226157 — workflow_dispatch SUCCESS |
| EXP-021 postgres T0 | 4/4 executed PASS (isolated DB) |
| PR CI | 30/30 checks success; 0 failed; 0 pending |
| Merge / deploy / drive | **NOT AUTHORIZED** |
| Evidence | `EXP_021_PR1598_FINAL_CLOSURE_2026-09-10.md` |

## EXP-021 — KS MS 661 deep forensic audit addendum (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **DEEP AUDIT COMPLETE** — bucket-level maturation + Trip FSM follow-up |
| Bucket identity | `FIELD_PIPE_CANONICAL_ISO_MS` — all 6 FIXED probes structurally stable after first success |
| Settlement gap recovery | **NO** late bucket recovery across ages |
| PDI structure | 3218 identities stable +30…+600; **values UNKNOWN** (not persisted) |
| Trip FSM | Still `ONGOING` + provisional `endTime`; detection `POSSIBLE_END`; WHOLE_TRIP unbound |
| Phase 10 | Missing due to insufficient movement in phase 20 (300s rule), not code defect |
| Next action | **LONGER_COMPLETION_RUN** — no new code fix required |
| Evidence | `EXP_021_KS_MS_661_PHYSICAL_RUN_FORENSIC_2026-09-10.md` §15–§19 |

## EXP-021 — KS MS 661 physical run post-drive forensic (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **POST-DRIVE FORENSIC COMPLETE** — read-only production evidence |
| Session | `945edc40-3002-4b87-83f6-a55d8cf66ffb` · settlement `exp-021-945edc40-e7850aa0` |
| Canonical T0 | `2026-09-10T19:41:19.000Z` — **CONFIRMED** durable; no duplicate 60→60 fatal |
| Phases | 60→30→20 completed; **10 NOT reached** |
| FIXED_INTERVAL | **36/48** completed (all +600 terminal); 12 missing (phase 10) |
| PDI | **6/6** through +600 on authoritative candidate `pdi-1789070475000` |
| WHOLE_TRIP | **0/6** — trip `2bdc6e71-…` still `ONGOING` |
| Classification | PARTIAL SUCCESS / DEGRADED |
| Policy | PRODUCTION unchanged — no deploy/merge/cleanup during forensics |
| Evidence | `EXP_021_KS_MS_661_PHYSICAL_RUN_FORENSIC_2026-09-10.md` |

## EXP-021 — Gap→settlement correlation + value revision instrumentation (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **INSTRUMENTATION COMPLETE** — evidence freeze + forward persistence; no physical drive |
| Freeze | `EXP_021_KS_MS_661_EVIDENCE_FREEZE_2026-09-10.json` — run `945edc40-…` immutable |
| Retroactive | Bucket identity maturation **YES**; per-gap timestamp matrix **NO**; value revision **NO** on frozen run |
| Code | `reference-capture-settlement-shadow-value-snapshot.ts`, gap-settlement analyzer, cross-age analyzer |
| Persistence | `bucketValueSnapshots`, `valueContentHash`, `valueRevisedBucketIdentities` on new observations |
| Correction | `responseHash` ≠ value revision evidence — metadata includes age/drift |
| Trip FSM | **UNCHANGED** — WHOLE_TRIP remains `BLOCKED_BY_EXTERNAL_TRIP_FSM_WORKSTREAM` |
| Evidence | `EXP_021_KS_MS_661_GAP_SETTLEMENT_RETROACTIVE_ASSESSMENT_2026-09-10.md`; forensic §20 |

## EXP-021 — Native temporal bucket persistence micro-pass (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **PERSISTENCE COMPLETE** — prospective only; KS MS 661 not backfilled |
| Location | `completedPhaseSummaries[].nativeTemporalEvidence` (`EXP021_NATIVE_TEMPORAL_v1`) |
| Reconstruction | `reference-capture-exp021-native-gap-reconstruction.ts` — post-run gap ledger without live memory |
| Join | `reference-capture-exp021-native-settlement-join.ts` — native gaps ↔ settlement snapshots |
| Readiness | `READY_FOR_EXP021_COMPLETION_RUN=YES` when native list + settlement value snapshots both persist |
| Historical | `HISTORICAL_KS_MS_661_NATIVE_GAP_LEDGER_RECOVERABLE=NO` |

## EXP-021 — PR #1621 authority micro-pass: asymmetric corruption + settlement precedence (2026-09-12)

| Event | Detail |
|-------|--------|
| Status | **AUTHORITY MICRO-PASS** on draft PR #1621 |
| Defect A | Both plan fields present but one unrecognized still resolved via `byId ?? byVersion` — asymmetric corruption silently ignored |
| Fix A | When both fields supplied, both must resolve or `Exp021CalibrationPlanAuthorityInvalidError` |
| Defect B | Settlement could consult env before experiment metadata when series authority absent |
| Fix B | `resolveExp021CalibrationPlanFromSources`: series → metadata → env (each persisted layer fail-closed) |

## EXP-021 — PR #1621 lifecycle precedence closure: single canonical plan per sync (2026-09-12)

| Event | Detail |
|-------|--------|
| Status | **LIFECYCLE PRECEDENCE CLOSURE** on draft PR #1621 |
| Defect | `syncCompletedPhasesFromSession` resolved plan via `resolveExp021CalibrationPlanForSeries(series)` before loading experiment metadata — env could win over persisted metadata V3; `validateCompletedPhaseProbeGeometry` received wrong plan while prospective sync later resolved correctly |
| Fix | Load existing experiment first; resolve ONE canonical `calibrationPlan` via `resolveSettlementCalibrationPlan` (series → metadata → env); pass same plan to `ensureExperiment`, prospective sync, completed-phase validation, and metadata merge |
| Tests | `sync lifecycle precedence: metadata V3 wins over env V2 when series authority absent` in `reference-capture-settlement-shadow-runtime.spec.ts` |
| CI | Vehicle Detail backend `tsc --noEmit` OOM at ~4GB heap (run 34698104670) — infrastructure, not PR TS defect; attempted workflow heap modification reverted; natural rerun on final head passed; Vehicle Detail Typecheck PASS; final required GitHub CI green; no workflow mitigation retained |

## EXP-021 — PR #1621 micro-pass: post-transition late-movement + fail-closed authority (2026-09-12)

| Event | Detail |
|-------|--------|
| Status | **MICRO-PASS** on draft PR #1621 |
| Defect | `recomputePhaseSummaryDerivedFields` used active-phase counters for completed phases — post 120→90 transition, empty 90s counters could yield `DEGRADED_INSUFFICIENT_REQUESTS` |
| Fix | Recompute uses persisted `summary.providerRequestCount` / `summary.providerSuccessCount`; movement patch preserves all non-movement summary evidence |
| Authority | `resolveExp021CalibrationPlanFromAuthority` fail-closed when durable fields present but conflicted/unrecognized — env fallback only when both fields absent |
| Tests | `REALISTIC_POST_TRANSITION_LATE_MOVEMENT` PostgreSQL fixture; authority conflict/corruption unit tests |

## EXP-021 — CANDIDATE_BRACKET_V3 durable plan authority correction (2026-09-12)

| Event | Detail |
|-------|--------|
| Status | **CORRECTION PASS** — code defects confirmed from frozen KS MS 661 V3 run (PR #1618 evidence); frozen artifacts **unchanged** |
| Defect A | **Durable plan authority** — post-arm subsystems fell back to `EXP021_UPPER_BOUND_V2` via transient `process.env`; mixed `calibrationPlanVersion` across phases |
| Defect B | **EXPECTED_SLOTS_NEVER_CREATED** — `buildInitialPhaseCounters` used default 5-min geometry for 90s/60s (expected 7/10, got 4/5); 8 slots never instantiated |
| Defect C | **Settlement geometry** — `syncProspectiveProbesForActivePhase` resolved 9 windows for 90s/60s instead of 19 (V3 10-min phases) |
| Defect D | **Stale scientific status** — `finalizePhaseSummary` coerced unknown movement to 0 → `DEGRADED_LOW_MOVEMENT`; late `persistExp021ActivePhaseMovementAtomic` patched movement but not status (120s: 454.7s movement vs 150s threshold should be **VALID**) |
| Fix | Persist `calibrationPlanId`/`calibrationPlanVersion` on series at arm; `resolveExp021CalibrationPlanFromAuthority`; pass durable plan to slot init, settlement, scientific classification; `recomputePhaseSummaryDerivedFields` on late movement |
| Terminology | **EXPECTED_SLOTS_NEVER_CREATED** ≠ **SILENTLY_LOST_SLOTS** (never instantiated vs issued then lost) |
| Evidence | Frozen run `EXP_021_KS_MS_661_CANDIDATE_BRACKET_V3_*_2026-09-12.md` (PR #1618) — not mutated |
| Tests | `reference-capture-exp021-durable-plan-correction.spec.ts` — 120s false-low-movement regression, full V3 5/7/10 + 19/19/19 + restart recovery |

## EXP-021 — Post-run hardening scientific correction pass (2026-09-11, PR #1604)

| Event | Detail |
|-------|--------|
| Status | **CORRECTION PASS** — runtime + settlement geometry fixes before next physical run |
| HF slots | Strict `resolveExp021HfHistoricalPollDecision` — no legacy interval fallback when slot ledger active; `persistCalibrationCountersDuringCycle` reserves ISSUED before provider I/O |
| Settlement | `buildFullPhaseOverlappingSettlementProbesForPhase` — full phase from t+0, 60s windows, 30s step; 62 tiles × 6 ages = 372 queries; synthetic gap assessability 32/32 (100%) |
| Legacy geometry | 120s stabilization tiling retained as `buildLegacyStabilizedTiledSettlementProbesForPhase` for 2026-09-11 evidence parse only (25 tiles, 75.76% nominal minutes) |
| Terminalization | Realistic early-end (180/120 completed, 60 sealed, 30 NOT_RUN); final 30s CONTROL wall-clock expiry without fresh telemetry |
| Evidence | Frozen 2026-09-11 run artifacts **unchanged**; 4/44 assessable remains historical under old A/B geometry |

## EXP-021 — Upper-bound cadence calibration plan V2 (2026-09-11)

| Event | Detail |
|-------|--------|
| Status | **PROSPECTIVE DESIGN IMPLEMENTED** — no physical run |
| Plan | `EXP021_UPPER_BOUND_V2` — 180→120→60→30 CONTROL, 33 min nominal / 35 min max |
| Advancement | `WALL_CLOCK` per phase (replaces universal 300s MOVING for this plan) |
| Legacy | `EXP021_LOWER_BOUND_V1` preserved (`EXP021_CALIBRATION_PLAN=LOWER_BOUND_V1`) |
| Code | `reference-capture-exp021-calibration-plan.lib.ts` |
| Evidence | `EXP_021_UPPER_BOUND_V2_PROSPECTIVE_DESIGN_2026-09-11.md` |
| Physical run | **NOT STARTED** |

## EXP-021 — PostgreSQL native temporal persistence proof (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **POSTGRES INTEGRATION PASS** — isolated DB, 3/3 tests |
| Proof | Reload after disconnect; 60→30 transition; settlement join with value snapshots |
| Harness | `reference-capture-postgres.integration.harness.ts` helpers |
| Spec | `reference-capture-exp021-native-temporal-evidence.postgres.integration.spec.ts` |
| Result | `INSTRUMENTATION_MERGE_READY=YES` (instrumentation scope only) |

## EXP-021 — KS MS 661 T0 / phase / settlement hardening (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **HARDENING DRAFT** — forensic root cause from production telemetry-only run |
| Session | `8374c2fc-…` · orchestrator fatal duplicate 60→60 at movement |
| Root cause | PRE_ROLL phase 60 credited as physical; T0 logged after fallible phase switch |
| Fix | Durable T0 before phase activation; `reanchorPhysicalCalibrationPhaseAtT0`; PRE_ROLL settlement gate; orchestration degraded vs integrity fatal |
| Physical drive | **NOT STARTED** post-fix |
| Evidence | `EXP_021_KS_MS_661_T0_PHASE_SETTLEMENT_HARDENING_2026-09-10.md` |

## EXP-021 — Settlement shadow experiment design (2026-09-07)

| Event | Detail |
|-------|--------|
| Status | **DESIGNED** — preflight audit only; **no physical drive** |
| Channels | CADENCE 60→30→20→10 (counterbalanced) + SETTLEMENT_SHADOW (isolated) |
| Probes | 8 fixed 60s intervals × ages +30/+60/+120/+180/+300/+600s |
| Post-trip shadow | TripEnd + {30,60,120,180,300,600}s whole-trip queries |
| 446 union audit | **PARTIAL** — ms-key artifact; 165+140+141 disjoint keys; ~36 floor-second overlap |
| Idempotence | Q1/Q2/Q3 **IDENTICAL** on settled EXP-019 interval |
| Tooling | Shadow scheduler **NOT implemented** — design spec only |
| Load | ~113 total requests (59 cadence + 48 shadow + 6 post-trip) |
| Policy | PRODUCTION_HF_POLICY_CHANGE_AUTHORIZED=NO; shadow tooling NOT deployed |
| Evidence | `EXP_021_SETTLEMENT_SHADOW_EXPERIMENT_DESIGN_2026-09-07.md`; `EXP_021_PROVIDER_IDEMPOTENCE_PREFLIGHT_2026-09-07.md` |

## EXP-021 — False physical-end authority correction (2026-09-11)

| Event | Detail |
|-------|--------|
| Status | **MERGED** — PR #1606 at `e99cf710088732069bc5d448ae5436b893b3440e` |
| Session | `d633da9d-…` · KS MS 661 UPPER_BOUND_V2 |
| Root cause | Orchestrator `physicalEndEarly` terminated on provisional PDI CONFIRMED (120s) bypassing `finalParkedMs` (600s); boundary race sealed phase 60 with negative wall duration |
| Fix | `hardPhysicalEndEligible` / `shouldAutoStop` only for early end; boundary-safe `finalizeCalibrationOnPhysicalEndEarly`; movement metrics to completing phase; durable `exp021RequestSlots` in phase summaries; settlement experiment `COMPLETED` convergence |
| Evidence | Corrected forensic layer in evidence-only PR (supersedes #1605) |

## EXP-021 — Hard-end UNKNOWN fail-safe micro pass (2026-09-11)

| Event | Detail |
|-------|--------|
| Status | **RUNTIME MICRO PASS** on PR #1606 |
| Issue | `hardPhysicalEndEligible` delegated to `shouldAutoStopRecording` UNKNOWN shortcut |
| Fix | Hard-end requires fresh `PARKED_CANDIDATE` sustained `>= finalParkedMs`; UNKNOWN never hard-ends |
| Tests | STRONG_PARKED + long UNKNOWN + movement invalidation regression added |

## EXP-021 — CANDIDATE_BRACKET_V3 prospective refocus (2026-09-11)

| Event | Detail |
|-------|--------|
| Status | **PROSPECTIVE PLAN** on PR #1606 — no physical run |
| New plan | `EXP021_CANDIDATE_BRACKET_V3` — 120→90→60, equal 10 min wall phases, 30 min nominal / 32 min max |
| Historical preserved | `EXP021_UPPER_BOUND_V2` (180→120→60→30) and `EXP021_LOWER_BOUND_V1` unchanged |
| 180s | Historical evidence only — no longer an active production-candidate calibration phase |
| 90s | Added to `HF_POLL_CALIBRATION_CANDIDATES_MS`; epistemic `UNKNOWN` / `PROSPECTIVE` |
| Settlement | 57 windows × 6 ages = 342 observations; full-phase overlapping for all WALL_CLOCK plans |
| Reconstruction | Read-only analyzer scaffold; map-matching adapter documented as follow-up |
| Selection | `EXP021_CALIBRATION_PLAN=CANDIDATE_BRACKET_V3` — default remains `UPPER_BOUND_V2` |
| Evidence | `EXP_021_CANDIDATE_BRACKET_V3_PROSPECTIVE_DESIGN_2026-09-11.md` |

## EXP-021 — KS MS 661 UPPER_BOUND_V2 corrected forensic evidence (2026-09-11)

| Event | Detail |
|-------|--------|
| Status | **EVIDENCE REGISTERED** — evidence-only PR from post-#1606 `main` |
| Session | `d633da9d-e32c-461c-8a27-8c0c6bfff209` · KS MS 661 UPPER_BOUND_V2 |
| Interpretation | PHYSICAL_END_AUTHORITY **CONTRADICTED**; UNSLOTTED/SILENTLY_LOST **UNKNOWN_UNPROVABLE**; bucket structure stable from **+120** |
| Settlement | FIXED_INTERVAL_OBSERVATIONS_COMPLETED **342**; SCHEDULES_COMPLETED **357**; SCHEDULES_SKIPPED **15** |
| Gap assessability | **94.6%** (35/37 assessable); SETTLEMENT_PRESENT_LATER **0**; ABSENT_THROUGH_600 **550** |
| Value maturation | **51** revisions (`bucketValueSnapshots` / `valueContentHash`) |
| Cadence decision | **READY_TO_CHOOSE_PRODUCTION_CADENCE=NO** — 60/30 not executed; runtime defect (fixed #1606) |
| Supersedes | PR **#1605** (obsolete mixed runtime branch — do not merge) |
| Evidence | `EXP_021_KS_MS_661_UPPER_BOUND_V2_FULL_POST_RUN_FORENSIC_2026-09-11.md`; `EXP_021_KS_MS_661_UPPER_BOUND_V2_FULL_POST_RUN_AUDIT_2026-09-11.json` |
