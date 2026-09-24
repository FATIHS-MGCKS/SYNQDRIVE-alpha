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

## EXP-021 — CANDIDATE_SHORT_AB_90_60 dedicated plan + WOB L 7503 pre-drive audit (2026-09-12)

| Event | Detail |
|-------|--------|
| Status | **PROSPECTIVE DESIGN IMPLEMENTED** — no physical run; no deploy |
| Authority | Frozen PR #1618: minimum next experiment = corrected 90 vs 60 short A/B (two 10 min wall phases); **not** full 120→90→60 rerun |
| Plan | `EXP021_CANDIDATE_SHORT_AB_90_60` — `candidate_short_ab_90_60`; registry `CANDIDATE_SHORT_AB_90_60`; phases **90→60** only; exact V3 90s/60s semantics |
| Geometry | 7/10 slots; 19/19 FIXED_INTERVAL windows; 228 settlement observations; 20 min nominal / 22 min max |
| Target vehicle | **WOB L 7503** (`19fedd4b-c4e8-4de8-a125-dab293326e7e`, token **192922**) — KS MS 661 historical only |
| Blockers | Stale WOB L 7503 telemetry (~23h at audit); 6 pending KS MS 661 WHOLE_TRIP schedules on COMPLETED experiment; plan not deployed |
| Evidence | `EXP_021_CANDIDATE_SHORT_AB_90_60_PROSPECTIVE_DESIGN_2026-09-12.md` |
| Tests | `reference-capture-exp021-candidate-short-ab-90-60.spec.ts` — registry, geometry, durable arm, restart recovery, lifecycle |

## EXP-021 — CANDIDATE_SHORT_AB_60_90 reversed-order plan (PR-A, 2026-09-15)

| Event | Detail |
|-------|--------|
| Status | **PROSPECTIVE PLAN REGISTERED** — no physical run; no deploy; no fleet automation |
| Plan | `EXP021_CANDIDATE_SHORT_AB_60_90` — `candidate_short_ab_60_90`; registry `CANDIDATE_SHORT_AB_60_90`; phases **60→90**; pure order reversal of `CANDIDATE_SHORT_AB_90_60` |
| Geometry | Cadence-value slot geometry unchanged (90s→7, 60s→10); settlement budget order-invariant (38 windows × 6 ages = 228); short-A/B assertions plan-parametric |
| Unchanged | Default plan `UPPER_BOUND_V2`; existing `CANDIDATE_SHORT_AB_90_60` semantics; Run 1 frozen evidence (#1659) |
| Blockers | Legacy `physicalPhase60StartedAt` naming (PR-B); no manual 60→90 physical run until PR-B + explicit arm |
| Tests | `reference-capture-exp021-candidate-short-ab-60-90.spec.ts`; lifecycle driver 60→90 case; autonomous CI gate extended |

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

## EXP-021 — KS MX 2024 incomplete short A/B deep 90s forensic (2026-09-14)

| Event | Detail |
|-------|--------|
| Status | **EVIDENCE FREEZE** — read-only forensic; no code/deploy; session `ABORTED` |
| Session | `332c1549-622d-4535-afd9-867962003280` · KS MX 2024 · `EXP021_CANDIDATE_SHORT_AB_90_60` |
| Windows | A nominal 10 min (25 native buckets, 5/7 HF success) · B moving overrun (0 HF) · C post-trip tail (integrity PASS) |
| Settlement | **114/114** SUCCESS (19×6); #1621 geometry fix **PASS** |
| Slots | **7/7** issued; #1621 slot fix **PASS** vs KS MS 661 V3 (4/7) |
| Overrun | `OWNERSHIP_GAP` — orchestrator not started; `90_TO_60_BLOCKED_BY_BAD_TELEMETRY=NO` |
| Classification | `VALID_90_STANDALONE=YES`; `VALID_90_VS_60=NO`; `VALID_FOR_CADENCE_SELECTION=NO` |
| Evidence | `EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_2026-09-14.md`; `.json`; `EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_EVIDENCE_FREEZE_2026-09-14.md` |

### EXP-021 — KS MX 2024 deep 90s forensic v2 temporal correction (2026-09-14)

| Event | Detail |
|-------|--------|
| Correction | 90s phase active **~116.6 min** at pre-abort freeze (not ~25.5 min); abort `completedPhaseSummary` (~119.3 min) is artifact only |
| Windows | A nominal 1,423 RC obs / 25 native HF · B overrun 938 / 0 · C post-trip tail **8,792** / 0 · D abort 260 |
| Settlement | 114/114 SUCCESS — 67 in A, 47 in B, **0 in C**; last at `12:03:53Z` |
| Orphaned tail | RC runner ~91 obs/min continued; `validMovementDurationMs` null; Trip FSM RESTING while EXP-021 active |
| Classification | `VALID_90_VS_60=NO` · `VALID_FOR_CADENCE_SELECTION=NO` preserved |
| Evidence | `EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_V2_2026-09-14.json`; updated MD + evidence freeze |

### EXP-021 — KS MX 2024 forensic consistency + recorder repair spec (2026-09-14)

| Event | Detail |
|-------|--------|
| Scope | PR #1645 derived-evidence correction only; no runtime/test/workflow changes |
| Fixes | Provider counts 7/5/2; deduped gap lists; full-window max gap 159,544 ms; ZERO_RESULT unproven transient; VALUE_REVISIONS/GAP_RECONSTRUCTABILITY NOT_ASSESSED/NOT_PROVEN |
| Recorder | `RECORDER_CODE_CHANGE_REQUIRED_FOR_CANONICAL_NEXT_RUN=NO`; `CODE_CHANGE_REQUIRED_TO_SUPPORT_MIXED_MANUAL_ATTACH_PATH=YES`; orchestrator sole-owner runbook; regression spec defined |
| Validation | `scripts/validate-exp021-ks-mx-forensic-invariants.sh` |
| Evidence | `EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_CONSISTENCY_2026-09-14.json` |

### EXP-021 — KS MX 2024 final cross-file closure (2026-09-14)

| Event | Detail |
|-------|--------|
| RC partition fix | PRE_T0=365, A=1058, B=938, C=8792, D=260; total 11413 (was A=1423 conflating PRE_T0+A) |
| Provider | All representations 7/5/2; W1=4/2/2, W2=3/3/0 from slot issuedAt |
| Gaps | Regenerated from 25 unique timestamps; full-window max 159544 ms |
| Movement | POST_TRIP_FALSE_MOVEMENT=NOT_ASSESSED; T0_TO_TRIP_END_WALL_DURATION label |
| Settlement | STRUCTURAL PASS; GAP_RECONSTRUCTABILITY=NOT_PROVEN |
| Recorder | Canonical next run NO code change; mixed manual path YES guardrails needed |
| Validation | Expanded `validate-exp021-ks-mx-forensic-invariants.sh` |

### EXP-021 — KS MX 2024 derived-evidence integrity fix (2026-09-14)

| Event | Detail |
|-------|--------|
| Scope | PR #1645 evidence-only; no runtime/production mutation |
| Gap tuples | Rebuilt adjacent-interval tuples (`durationMs === end − start`); no filtered-index corruption |
| Percentiles | `PERCENTILE_METHOD=NEAREST_RANK` (P50=15000 ms from 24 intervals); cross-file equality enforced |
| Signal completeness | Removed per-signal `availabilityPct=0` placeholders → `NOT_ASSESSED` |
| Movement | Separated `TRIP_STATE_CLASS` vs `PHYSICAL_MOVEMENT_CLASS`; no ACTIVE_TRIP after trip end (W6–W10) |
| Settlement | `SETTLEMENT_DURING_POST_TRIP_TAIL=NO`; `SETTLEMENT_CONTINUED_AFTER_NOMINAL_10MIN_END=YES` |
| Post-10min | `POST_10_MIN_RC_SOURCE=RC_ACQUISITION_RUNNER_CYCLE`; removed HEARTBEAT_ONLY wording |
| full_pre_freeze | Bucket inventory only; `HF_CONTINUITY_AFTER_NOMINAL_WINDOW=NOT_APPLICABLE_NO_HF_SLOTS_SCHEDULED` |
| Consistency | `EXP-021-KS-MX-2024-FORENSIC-CONSISTENCY-v4`; phase renumbering 19–24 |
| Recorder | `RECORDER_CODE_CHANGE_REQUIRED_FOR_CANONICAL_NEXT_RUN=NO`; `CODE_CHANGE_REQUIRED_TO_SUPPORT_MIXED_MANUAL_ATTACH_PATH=YES` |
| Validation | Expanded validator: gap recompute, percentiles, movement, settlement, version refs |

### EXP-021 — PR-C fleet study registry + dry-run coordinator (2026-09-15)

| Event | Detail |
|-------|--------|
| Scope | Durable study/enrollment/run-ledger control plane; leader-gated DRY-RUN coordinator only — no physical execution |
| Schema | `exp021_studies`, `exp021_study_enrollments`, `exp021_study_runs`, order-balance ledgers |
| Enrollment | Explicit allowlist (`enabled=true`); `enrolledTokenId` audit snapshot; runtime identity = `organizationId` + `vehicleId` |
| Coordinator | `EXP021_FLEET_COORDINATOR_ENABLED` default OFF; `EXP021_FLEET_DRY_RUN` default ON; leader-gated `@Interval` scheduler |
| Allocator | `STRATIFIED_BLOCK_RANDOMIZATION_WITH_GLOBAL_BALANCE_LEDGER` (minimal); dry-run read-only |
| Run 1 | `EXPLICIT_FUTURE_IMPORT` — no automatic backfill (`EXP021_FLEET_RUN1_REGISTRY_STRATEGY.md`) |
| Safety | Dry-run never creates `ReferenceCaptureSession`, study runs, or acquires execution locks |
| Next | PR-D required before execution capability; Stage-1 deploy gate separate |

### EXP-021 — PR-C control-plane correctness hardening (2026-09-15)

| Event | Detail |
|-------|--------|
| Minimum matrix | Only `COMPLETED` + `COMPLETE_VALID` + not `INELIGIBLE` counts toward primary gate; `PARTIAL_VALID` preserved but excluded |
| Config | `validateMinimumMatrixConfig()` fail-closed on malformed thresholds; `matrixMet` never true when config invalid |
| Leader guard | Mandatory `SchedulerLeaderGuardService`; no `@Optional` fail-open follower path |
| Interval | `getFleetCoordinatorIntervalMs()` wired via dynamic `setInterval` (5s–300s bounds) |
| Dry-run authority | Requires global `EXP021_FLEET_DRY_RUN=true` AND `study.dryRun=true` (`STUDY_DRY_RUN_REQUIRED`) |
| HF policy | Extracted `reference-capture-exp021-hf-policy-gate.lib.ts`; runtime no longer imports `scripts/ops` |
| Run identity | `reserveStudyRunAssignment()` derives study/org/vehicle/token from enrollment inside Serializable tx |
| Atomic assignment | Advisory lock + balance increment + PLANNED run creation in one transaction (PR-C coordinator does not call) |
| Dry-run preview | Ephemeral per-tick shadow balance; durable ledger unchanged |
| Allocator naming | `DETERMINISTIC_STRATIFIED_GLOBAL_BALANCE` (truthful; not block randomization) |
| Retention | `Exp021StudyRun` FKs `ON DELETE RESTRICT` for study/enrollment/org/vehicle; enum `Exp021StudyRunClassification` |
| CI | Fleet postgres integration, migration deploy test, fleet unit gate, production build in EXP-021 workflow |

### EXP-021 — PR-B forensic slot persistence + first-phase authority (2026-09-15)

| Event | Detail |
|-------|--------|
| Scope | Per-slot forensic persistence; order-neutral first physical phase authority; summary/ledger parity — no fleet coordinator |
| Slots | `Exp021RequestSlotRecord` extended: `requestCompletedAtMs`, `bucketCount` (RAW_PROVIDER_BUCKET_COUNT), `providerCallAttempted`, `providerCallSucceeded`, `outcomeReason`, `effectivePollIntervalMs` |
| Summary | `finalizePhaseSummary` derives `slotSuccessCount` / `slotZeroResultCount` / `slotFailureCount` / `slotSkippedCount` / `slotAccountedCount` from ledger |
| Authority | `physicalFirstPhaseStartedAt` canonical; `physicalPhase60StartedAt` legacy alias with fail-closed conflict detection |
| Logging | `PHYSICAL_FIRST_PHASE_REANCHORED_AT_T0` replaces legacy `PHYSICAL_PHASE_60_REANCHORED_AT_T0` |
| Forensics | `reference-capture-exp021-forensic-extraction.lib.ts`; deep audit exposes `exp021SlotForensics` |
| Settlement linkage | `PHASE_LEVEL_LINK` — no causal 1:1 slot↔settlement window |
| Run 1 | Frozen evidence unchanged; legacy slot shapes parseable via `parseLegacyForensicSlotRecord` |
| Postgres | Terminal slot forensic fields + first-phase authority survive reload |

### EXP-021 — Canary live window activation (PR-D canary slice) (2026-09-18)

| Event | Detail |
|-------|--------|
| Scope | KS MX 2024 token `187336` only — closes missing upstream RC/settlement path without fleet-wide live execution |
| Root cause | Fleet coordinator dry-run only; `EXP021_FLEET_DRY_RUN=false` refuses evaluation; no trip-bound session start |
| Ledger | `exp021_canary_live_window_activation_ledgers` — unique `vehicle_trip_id`, optional `session_id` / `study_run_id` |
| Trigger | Leader scheduler arms on ONGOING trip (post `NOT_BEFORE_ISO`); finalizes on COMPLETED trip (`stopRecording`) |
| Env | `EXP021_CANARY_LIVE_WINDOW_ACTIVATION_ENABLED` default OFF; `EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO` required when enabled |
| Safety | No historical backfill; missed 2026-09-18 drive excluded when `NOT_BEFORE` set after that trip; PDI still from existing settlement/motion authority only |
| Evidence | `architecture/drivingintelligence/evidence/reference-capture/EXP_021_CANARY_LIVE_WINDOW_AUTHORITY_CLOSURE_2026-09-18.md` |
| Production | **NOT ACTIVATED** in this change — code + tests only |

### EXP-021 — Live Maturation Shadow uniqueness closure (2026-09-16, PR #1670)

| Event | Detail |
|-------|--------|
| Scope | Documentation-only micro closure: canonical scientific uniqueness for family, stratum, slot |
| Family uniqueness | `UNIQUE(org, vehicle, token, canonicalWindowTo, shadowScheduleVersion)`; `enrollmentEventId` provenance only |
| Stratum uniqueness | `UNIQUE(windowFamilyId, signalLane, queryGeometryMs)`; `signalSetHash` immutable attribute, not uniqueness component |
| Slot uniqueness | `UNIQUE(windowStratumId, plannedAgeMs)`; transport retry → new attempt, not new slot |
| Job IDs | Deterministic from family/stratum/plannedAge; `JOB_ID_DEPENDS_ON_ENROLLMENT_EVENT_ID=NO` |
| Re-experiment | Intentional re-study via `shadowScheduleVersion` only — not new enrollment event ID |
| Runtime / Prisma | **NO CHANGES** |

### EXP-021 — Live Maturation Shadow design hardening (2026-09-16, PR #1670)

| Event | Detail |
|-------|--------|
| Scope | Design-only hardening: scientific identity, attempt provenance, window-family sampling unit |
| Document | `architecture/drivingintelligence/research/EXP_021_LIVE_MATURATION_SHADOW_DESIGN_2026-09-16.md` |
| Estimands | Primary A: P(non-zero \| actualAgeMs); Primary B: bucket-locus coverage distribution; `P_SUFFICIENTLY_COMPLETE_ESTIMABLE_NOW=NO` |
| Identity | Bucket-locus vs payload-revision separated; coverage uses `UNIQUE_BUCKET_LOCUS_UNION` |
| Signal freeze | `signalSetHash` + query semantics frozen at window-family enrollment; fail closed on drift |
| Sampling unit | `PRIMARY_SAMPLING_UNIT=WINDOW_FAMILY`; pilot 30/60, fleet 200 families; paired geometry analysis |
| Attempt ledger | Four-level hierarchy; immutable `ObservationAttempt`; `FAILED_ATTEMPT_OVERWRITE_ALLOWED=NO` |
| Provider errors | `PROVIDER_ERROR_COUNTS_AS_ZERO=NO`; errors excluded from interval-censored transitions |
| Policy delay | `CODE_DEFAULT_HF_SETTLEMENT_DELAY_MS=8000`; effective delay resolved at activation |
| Production | **NO** — `FUTURE_SHADOW_DEFAULT_ENABLED=NO`, `PRODUCTION_RETRY_AGE_SELECTED=NO` |
| Runtime / Prisma | **NO CHANGES** |

### EXP-021 — Live Maturation Shadow design (2026-09-16)

| Event | Detail |
|-------|--------|
| Scope | Design-only specification for live maturation shadow experiment (pre-TGR retry-age authority) |
| Document | `architecture/drivingintelligence/research/EXP_021_LIVE_MATURATION_SHADOW_DESIGN_2026-09-16.md` |
| Inputs | Frozen gap-replay + TGR audit evidence packages |
| Lanes | HF_FAST_LOOP (preflight-resolved) + SETTLEMENT_SHADOW (manifest 33 fields) — separate curves |
| Ages | Dense pilot: 8s policy + 30/40/45/50/55/60/90/120s |
| Geometry | 60s + 90s query ranges (not cadence authority) |
| Production | **NO** — `FUTURE_SHADOW_DEFAULT_ENABLED=NO`, `PRODUCTION_RETRY_AGE_SELECTED=NO` |
| Runtime / Prisma | **NO CHANGES** (superseded for schema only by PR-M1 below) |

### EXP-021 — Live Maturation Shadow PR-M1 persistence foundation (2026-09-16)

| Event | Detail |
|-------|--------|
| Scope | Schema, domain types, and persistence repository only — **no runtime provider query**, **no scheduler**, **no recovery**, **no production activation**, **no cadence authority** |
| Design authority | Merged #1670 `EXP_021_LIVE_MATURATION_SHADOW_DESIGN_2026-09-16.md` |
| Models | `Exp021MaturationShadowWindowFamily` → `Exp021MaturationShadowWindow` → `Exp021MaturationShadowObservationSlot` → `Exp021MaturationShadowObservationAttempt` |
| Family uniqueness | `(organizationId, vehicleId, tokenId, canonicalWindowTo, shadowScheduleVersion)` — `enrollmentEventId` provenance-only |
| Stratum uniqueness | `(windowFamilyId, signalLane, queryGeometryMs)` — `signalSetHash` immutable attribute, not uniqueness component |
| Slot uniqueness | `(windowStratumId, plannedAgeMs)` |
| Attempt ledger | Immutable create-only rows; `UNIQUE(observationSlotId, attemptOrdinal)`; transport retry → new attempt, same slot |
| Provider semantics | `PROVIDER_ERROR` distinct from `PROVIDER_SUCCESS_ZERO`; `PROVIDER_ERROR_COUNTS_AS_ZERO=NO` |
| Stage-1A | **NO INTERFERENCE** — fleet coordinator / StudyRun paths do not write shadow tables |
| Default | `EXP021_MATURATION_SHADOW_ENABLED=false` (type/config only; no execution wiring) |
| Run 1 / cadence | **UNCHANGED** — 90s 7/7, 60s 9/10; `SUFFICIENT_FOR_CADENCE_RECOMMENDATION=NO` |

### EXP-021 — Live Maturation Shadow PR-M1 scientific integrity hardening (2026-09-16)

| Event | Detail |
|-------|--------|
| Scope | Repository/persistence hardening only on draft PR #1672 — no runtime execution |
| Family freeze | `plannedAgesMsExact` + `policyDelayProbeMs` fail closed on existing/raced family; `enrollmentEventId` remains provenance-only |
| Stratum freeze | `activityClassificationJson` added to immutable semantic comparison (canonical JSON equality) |
| Slot authority | `plannedAgeMs` must be in family `plannedAgesMsExact`; off-schedule slots rejected |
| Attempt authority | Parent slot/stratum/family resolved; `actualAgeMs` + `schedulerDriftMs` derived from `requestStartedAt - windowTo`; hash fields must match stratum |
| Provider outcomes | `PROVIDER_ERROR` / `PROVIDER_SUCCESS_ZERO` / `PROVIDER_SUCCESS_NONZERO` contradiction matrix enforced |
| Post-hoc fields | Analytical derivatives removed from raw insert API; nullable columns remain null in PR-M1 |
| Runtime / prod | **NO CHANGES** |

### EXP-021 — Live Maturation Shadow PR-M2 scheduler and worker foundation (2026-09-17)

| Event | Detail |
|-------|--------|
| Starting main SHA | `06bdba368057d8cfba6a6500768ffd36f783483c` (merged PR #1672) |
| Scope | Dedicated BullMQ queue, deterministic enrollment/scheduling, bounded worker, read-only provider adapter, recovery — **default OFF**, no production activation |
| Queue | `reference.capture.exp021-maturation-shadow` (`REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW`) |
| Job ID contract | `rc-exp021-ms-{familyId}-{stratumId}-{plannedAgeMs}` — **no** `enrollmentEventId` |
| Schedule version | `MATURATION_SHADOW_SCHEDULE_v1` |
| Worker concurrency | `1` |
| Feature defaults | `EXP021_MATURATION_SHADOW_ENABLED=false`, HF lane `false`, settlement lane `false`, empty token allowlist |
| Provider path | `ReferenceCaptureExp021MaturationShadowProviderQueryAdapter` — DIMO GraphQL read-only, no canonical writes |
| Multi-replica proof | PostgreSQL + Redis integration tests (family/stratum/slot idempotency, deterministic enqueue, recovery, duplicate delivery) |
| Automatic production enrollment | **NOT WIRED** — `ReferenceCaptureExp021MaturationShadowEnrollmentService` callable; hook deferred to canary PR |
| M3 boundary | No maturation curves, Wilson CI, cadence recommendation, export/dashboard |
| Runtime / prod | **NO CHANGES** — disabled by default |

### EXP-021 — Live Maturation Shadow PR-M3 scientific micro-closure (2026-09-17)

| Event | Detail |
|-------|--------|
| Previous head | `e6a7da259912ab4fcae2f165d92e8dd6c9800df4` |
| Scope | Interval-censoring ordering fix; cross-family planned-age stratum summaries; eligibility-gated primary stats; content-based M1/M2 fingerprint; canonical bucket-locus round-trip validation |
| Interval censoring | `firstPositiveAgeMs` = earliest success with loci>0; `lastNegativeAgeMs` = latest success zero strictly before first positive; post-positive zeros ignored for transition bounds |
| Population summaries | `plannedAgeStratumSummaries` grouped by lane/geometry/activity/semantic cohort/plannedAgeMs with `nWindowFamilies` + `nLogicalSlots` (retries do not inflate family N) |
| Eligibility | Primary stats exclude ineligible strata; transitions CSV includes `eligible` + `exclusionReasons`; separate exclusions CSV |
| Fingerprint | Deterministic scientific content digest over family/stratum/slot/attempt fields detects in-place UPDATE |
| Bucket locus | `validateCanonicalBucketLocusIdentity` round-trip via `buildExp021BucketIdentity` + canonical ISO ms |
| Runtime / prod | **NO CHANGES** |

### EXP-021 — KS MX 2024 canary single-family operator CLI (2026-09-17)

| Event | Detail |
|-------|--------|
| Starting main SHA | `04bb817de85201a1017516e2e7bc5f5dd19c504d` |
| Scope | Repository-native manual operator CLI for exactly one KS MX 2024 maturation shadow window family — **no automatic enrollment**, **no HTTP API**, **no production execution in PR** |
| CLI | `npm run exp021:maturation-shadow:canary:enroll -- --token-id 187336 --canonical-window-to <ISO> [--execute]` or `--wait-next-window` |
| Modes | Default DRY RUN (zero DB/BullMQ/provider writes); `--execute` required for enrollment |
| Window authority | `REFERENCE_CAPTURE_PHYSICAL_DRIVE_INTERVAL.physicalEndAt` from settlement-shadow experiment metadata (`ORCHESTRATOR_CONFIRMED` / `PDI_CANDIDATE` only for `--wait-next-window`) |
| Freshness guard | Fail closed when `windowAgeAtEnrollmentMs + 5000ms >= earliestPlannedAgeMs` (preserves 30s–60s dense ages) |
| Hard guards | token `187336`, KS MX 2024 org/vehicle binding, both lanes enabled, allowlist exactly `[187336]`, `maxActiveFamilies=1`, zero unfinished families pre-enroll |
| Activity | Independent telemetry via `parseSpeedSampleFromSignalsLatest`; defaults `UNKNOWN_ACTIVITY` when unresolved |
| Provider calls | `PROVIDER_CALLS_DURING_ENROLLMENT=0` — enrollment creates family/strata/slots/delayed BullMQ jobs only |
| Kill switch guidance | Printed: `EXP021_MATURATION_SHADOW_ENABLED=false` + rolling PM2 restart (not executed by CLI) |
| Tests | 28-case canary suite (`canary-enroll.spec.ts` 23 + `canary-activity.lib.spec.ts` 5) |
| Micro-closure (same PR) | Head `2d2a30107` — authoritative token equality enforced; activity resolved after `canonicalWindowTo`; geometry-specific RC observation windows; execute requires persisted physicalEndAt match; strict token parse; wait-mode skips stale windows; freshness lag diagnostics; `EXPECTED_PROVIDER_CALLS_DURING_ENROLLMENT=0` |
| Runtime wiring closure (same PR) | Wait-mode DB refresh each poll (no frozen startup snapshot in poll callback); CLI wiring regression test; removed 90s prefix substitution; coherent geometry CASE 1–4 activity fixtures |
| Runtime / prod | **NO CHANGES** — operator must invoke CLI manually after merge/deploy |

### EXP-021 — Live Maturation Shadow PR-M3 observational analytics and export (2026-09-17)

| Event | Detail |
|-------|--------|
| Starting main SHA | `4b8c555e49d86f33af3e23ca918a3fa1349f85eb` (merged PR #1675) |
| Scope | Read-only observational analytics + deterministic JSON/CSV export over immutable M1/M2 scientific rows — **no provider calls**, **no M1/M2 mutation**, **no production activation** |
| Data contract audit | `M3_DATA_CONTRACT_AUDIT=PASS`; `M3_SCHEMA_CHANGE_REQUIRED=NO`; `M3_ATTEMPT_ROWS_MUTATED=NO` |
| Bucket locus | Reconstruct from `bucketLocusManifestJson` + `bucketLocusIdentityVersion=FIELD_PIPE_CANONICAL_ISO_MS`; dedupe; payload value excluded from coverage identity |
| Maturation order | `actualAgeMs` authority; cumulative union never shrinks; `FINAL_SHADOW_OBSERVED_UNION` observational denominator only (not ground truth) |
| Availability | Provider success + reconstructed locus count; provider errors UNKNOWN; interval censoring `(lastNegative, firstPositive]` with errors excluded from bounds |
| Retry truth | Retry success attributed to real `actualAgeMs`; no backdating to planned age |
| Sampling unit | `PRIMARY_SAMPLING_UNIT=WINDOW_FAMILY`; per-stratum N reported |
| Stratification | Separate HF_FAST_LOOP / SETTLEMENT_SHADOW; separate 60s/90s; activity cohorts; semantic cohort blending blocked for primary combined analysis |
| Paired geometry | Family-level 60s vs 90s paired export — not independent samples |
| Export | `EXP021_MATURATION_SHADOW_M3_EXPORT_v1`; CLI `npm run exp021:maturation-shadow:m3:export` requires explicit `organizationId` + `vehicleId` |
| Read-only proof | PostgreSQL before/after fingerprint — canonical RC state + M1/M2 row counts unchanged |
| CI | `test:exp021:maturation-shadow:m3` + `m3:postgres:ci`; wired into EXP-021 autonomous orchestrator CI |
| Boundaries preserved | M2 scheduler/worker unchanged; no cadence recommendation; no completeness threshold; KS MX 2024 not armed; Stage-1A/Trip FSM/GAP_DEBT/TGR policy unchanged |
| Evidence | `architecture/drivingintelligence/evidence/reference-capture/exp021-maturation-shadow-m3-2026-09-17.md` |
| Runtime / prod | **NO CHANGES** — disabled by default |

### EXP-021 — Live Maturation Shadow PR-M2 scientific hardening + CI closure (2026-09-17)

| Event | Detail |
|-------|--------|
| Starting M2 head | `91ac9662fb65a36ef4ed981c6291745886c06846` |
| Scope | CI script fix, execution-time semantic drift revalidation, provider ingress timing authority, durable retry budget from attempt ledger, DB↔BullMQ reconciliation matrix, atomic active-family cap, geometry-specific activity authority, PostgreSQL canonical fingerprint non-interference, runtime SHA fail-closed when enabled |
| CI | `test:exp021:maturation-shadow:m2` shell pipe fixed; `test:exp021:fleet:postgres:ci` chains `m2:postgres-redis:ci` with `EXP021_MATURATION_SHADOW_POSTGRES_REDIS_INTEGRATION=1` |
| Execution semantics | `assertExecutionSemanticsMatchStratum` recomputes resolver authority before every provider request |
| Timing | Successful GraphQL uses `queryGraphQLWithIngressTiming()` ingress timestamps; JWT preflight excluded from `requestStartedAt` |
| Retry | `deriveTransportRetryOrdinalFromAttempts` — PostgreSQL attempt ledger is durable retry authority across restart/recovery |
| Reconciliation | `reconcileExecutionState` handles missing `bullJobId`, missing Redis job, completed/failed jobs, retry job loss |
| Active families | `countUnfinishedFamilies` + `pg_advisory_xact_lock(90210021)`; `maxActiveFamilies<=0` fails closed when enabled |
| Activity | `activityAuthorityByGeometry` — independent 60s/90s classification shared across lanes per geometry |
| Canonical proof | `captureCanonicalStateFingerprint` PostgreSQL integration — shadow writes do not mutate canonical RC/study/settlement state |
| Runtime SHA | `resolveExp021MaturationShadowRuntimeBuildSha({ required: true })` when enabled — rejects `unknown-runtime-sha` |
| Boundaries preserved | Queue unchanged, concurrency `1`, automatic production enrollment unwired, KS MX 2024 not armed, Stage-1A/Trip FSM unchanged |
| Runtime / prod | **NO CHANGES** — disabled by default |

### EXP-021 — Live Maturation Shadow PR-M1 final scientific geometry + provider input closure (2026-09-17)

| Event | Detail |
|-------|--------|
| Scope | Repository validation hardening only on draft PR #1672 — no runtime execution |
| Provider input | `PROVIDER_ERROR` validates raw `uniqueBucketLocusCount` (null/undefined only); no pre-validation normalization |
| Query geometry | `queryGeometryMs` typed and runtime-validated to `{60000,90000}` only |
| Stratum windows | `windowTo` must equal family `canonicalWindowTo`; `windowFrom = windowTo - queryGeometryMs` (exact) |
| Attempt age | `actualAgeMs < 0` rejected (`requestStartedAt` must not precede `windowTo`) |
| Family schedule | Non-empty, positive integer ages; no duplicates; positive integer `policyDelayProbeMs` |
| Runtime / prod | **NO CHANGES** |

### EXP-021 — TGR architecture audit evidence freeze (2026-09-16)

| Event | Detail |
|-------|--------|
| Scope | Read-only TGR architecture audit + bounded DIMO historical micro-window experiments |
| Evidence | `architecture/drivingintelligence/evidence/reference-capture/exp021-tgr-audit-2026-09-16/` |
| Primary Run 1 | **UNCHANGED** |
| Gap replay package | **UNCHANGED** (`exp021-run1-gap-replay-2026-09-16/`) |
| Micro-window | `MICRO_WINDOW_RECOVERY_EFFECT_OBSERVED=NO` on tested HF60/HF90 controls |
| Transition | `TRANSITION_GAP_MICRO_FRAGMENTATION_RECOVERY=NO`; recoverability not demonstrated for canonical window |
| Maturation | `SETTLEMENT_EARLY_AGE_MATURATION_OBSERVED=YES`; `PRODUCTION_RETRY_AGE_ESTABLISHED=NO` |
| Architecture | `PREFERRED_TGR_ARCHITECTURE=OPTION_C`; lever = maturation-aware targeted requery |
| Gap debt | `SEPARATE_GAP_DEBT_AUTHORITY_REQUIRED=YES` (design only, no schema) |
| Runtime / prod | **NO CHANGES** — `TGR_RUNTIME_IMPLEMENTATION=NO` |

### EXP-021 — Run 1 targeted gap replay evidence freeze (2026-09-16)

| Event | Detail |
|-------|--------|
| Scope | Post-hoc read-only DIMO historical gap replay + positive-control closure for KS MX 2024 Run 1 |
| Evidence | `architecture/drivingintelligence/evidence/reference-capture/exp021-run1-gap-replay-2026-09-16/` |
| Primary Run 1 | **UNCHANGED** — `EXP_021_KS_MX_2024_PHYSICAL_90_60_2026-09-15.json` SHA `99a1aa52…` |
| Gaps replayed | 5 exact windows (1 HF transition + 4 settlement anomalies) |
| Refined counts | `TOTAL_DIAGNOSTIC_ZERO_WINDOWS=5`; transition HF persistent empty=1; settlement early-age zero=2; structural terminal tail=2 |
| Positive controls | HF60 (10/10 count-comparable), HF90 (6/6 count-comparable); settlement query-path non-zero (`SETTLEMENT_CONTROL_COUNT_COMPARABLE=NO`) |
| Validity | `GAP_REPLAY_EXPERIMENT_VALID=YES`; `TRANSITION_HF_PERSISTENT_EMPTY_SUPPORTED=YES` |
| Maturation | Split by class: `TRANSITION_HF_LATE_MATURATION_HYPOTHESIS=WEAKENED`; `SETTLEMENT_EARLY_AGE_MATURATION_OBSERVED=YES` (SP-60-T0, SP-90-T16 @ 60s+) |
| Taxonomy | Distinct classes with recoverability: `TRANSITION_WINDOW_PERSISTENT_EMPTY`, `SETTLEMENT_EARLY_AGE_ZERO`, `STRUCTURAL_TERMINAL_TAIL` |
| Run 1 metrics | **NOT REWRITTEN** — 90s 7/7, 60s 9/10 preserved |
| Cadence authority | **NO** — `SUFFICIENT_FOR_CADENCE_RECOMMENDATION=NO` |
| Runtime / prod | **NO CHANGES** |

### EXP-021 — Stage-1A Path-B remediation: freshness authority + deploy capability guard (2026-09-16)

| Event | Detail |
|-------|--------|
| Scope | Fix two independent Stage-1A blockers proven on KS MX 2024 first real drive (2026-09-16 11:42–12:05Z); **no production deploy**, **no auto-execution** |
| Blocker A | Production redeployed `2c862b69` (PR-C coordinator) → `295635fc` (#1665) at ~07:56Z while `EXP021_FLEET_COORDINATOR_ENABLED=true` remained set — coordinator code absent from running artifact |
| Blocker B | Fleet coordinator used `dimoVehicle.lastSignal ?? latestState.lastSeenAt`; stale non-null `lastSignal` masked fresher `vehicle_latest_states.last_seen_at` |
| Freshness resolver | `resolveExp021FleetTelemetryFreshness()` — newest valid provider-backed timestamp among `LATEST_STATE_LAST_SEEN_AT`, `SIGNALS_LATEST_PROVIDER_TIMESTAMP`, `DIMO_LAST_SIGNAL`; fail-closed future skew via `DIAGNOSTIC_MAX_FUTURE_SKEW_MS` |
| Provenance | Dry-run observations expose `freshnessTimestamp`, `freshnessAuthority`, `freshnessAgeMs` |
| Deploy guard | `vps-exp021-fleet-deploy-guard.lib.sh` (**DEPLOY_EXECUTOR_GUARD_AUTHORITY**) sourced by executing `vps-deploy-release.sh`; validates **TARGET_RELEASE_CAPABILITY** post-build. Target `reference-capture-exp021-fleet-deploy-preflight.sh` is optional supplemental only. |
| Bootstrap | Current production `295635fc` lacks guarded deploy script. **First remediation deploy** must invoke `vps-deploy-release.sh` from exact merged remediation SHA checkout (`BOOTSTRAP_DEPLOY_SOURCE_MUST_EQUAL_TARGET_SHA=YES`), not `/opt/synqdrive/current`. After success, normal deploys use guarded current script. |
| Cross-version | Coordinator disabled → absence of target preflight helper must not block deploy. Coordinator enabled → fail closed if target lacks capability even when helper absent. |
| Shell contract | `backend/scripts/test/exp021-fleet-deploy-guard-contract.sh` — A–F fixture coverage |
| Real-drive fixture | `lastSignal=2026-09-15T20:56:14Z`, `lastSeenAt=2026-09-16T12:05:15Z` → `FRESH` / `eligible=true` in dry-run (non-mutating) |
| Run 1 / cadence | **UNCHANGED** — 90s 7/7, 60s 9/10; `SUFFICIENT_FOR_CADENCE_RECOMMENDATION=NO` |
| PR-D / auto-exec | **NOT IMPLEMENTED** |

### EXP-021 — canonical autonomous lifecycle driver + real-path regression (2026-09-14, PR #1649)

| Event | Detail |
|-------|--------|
| Scope | Behavior-preserving extraction of production lifecycle driver; remove parallel in-memory harness |
| Driver | `reference-capture-exp-021-autonomous-lifecycle.driver.ts` — shared by orchestrator + `driver.spec.ts` |
| Removed | `reference-capture-exp021-autonomous-short-ab-lifecycle.harness.ts` (reimplemented control flow — insufficient) |
| Assertions | `reference-capture-exp021-short-ab-geometry.assertions.ts` (geometry only, no lifecycle simulation) |
| Matrix | Full 90→60 driver path, durable restart B–E, duplicate lock, ZERO_RESULT, Trip FSM read-only audit |
| Postgres | `REAL_DB_DRIVER_RESTART_60_TO_TERMINAL` — mid-60s PG reload → canonical driver `FINAL_PHASE_WALL_CLOCK` terminalization (7/7 CI) |
| Gate | `scripts/validate-exp021-short-ab-autonomous-gate.sh` — unit gate (55 tests) |
| CI | `.github/workflows/exp021-autonomous-orchestrator-ci.yml` — unit + isolated Postgres (`synqdrive_exp021_pr1649_test`) |
| Postgres driver | `testing/reference-capture-exp021-postgres-driver.harness.ts` — repo atomic bridge (not lifecycle duplicate) |
| Authority | `EXP_021_AUTONOMOUS_ORCHESTRATOR_SHORT_AB_REGRESSION_2026-09-14.md` — evidence levels separated |
| PR #1645 | **MERGED** @ `20269b9e7` — KS MX 2024 forensic evidence frozen; no reinterpretation |

### EXP-021 — cohort study enrollment bootstrap (2026-09-19)

| Event | Detail |
|-------|--------|
| Incident | WOB L 7503 live drive `c0889036-…` — ledger `FAILED` `enrollment_not_found`; PR #1692 PDI not reached |
| Root cause | PR #1694 cohort expansion without `exp021_study_enrollments` for KS MS 661 / WOB L 7503 (`OPS_BOOTSTRAP_OMISSION`) |
| Fix (review) | `reference-capture-exp021-cohort-study-enrollment-bootstrap.lib.ts` + ops CLI `exp021:cohort:study-enrollment:bootstrap` |
| Evidence | `evidence/reference-capture/EXP_021_COHORT_STUDY_ENROLLMENT_AUTHORITY_CLOSURE_2026-09-19.md` |
| Production | Activation disabled; enrollments **not** mutated in closure workstream |

### EXP-021 — PDI → M2 maturation integration repair (2026-09-19)

| Event | Detail |
|-------|--------|
| Forensic | Seven post–NOT_BEFORE trips: RC + PDI, zero M2 families; `ZERO_FAMILY_CLASS=9` (not short-drive) |
| Root cause | Operational `freshness.stale` on cohort wait; settlement-baseline cursor skipped unenrolled PDIs after restart |
| Repair | `PROSPECTIVE_PDI_DISCOVERY` + enrolled-window cursor (`maxEnrolledCanonicalWindowToMsForVehicle`) |
| Evidence | `evidence/reference-capture/EXP_021_PDI_TO_M2_INTEGRATION_REPAIR_2026-09-19.md` |
| Production | **No deploy / no backfill** in repository repair workstream |

### EXP-021 C0.3 — minimal R1 temporal-safety containment (2026-09-24)

| Event | Detail |
|-------|--------|
| Trigger | C0.2 `C02_GATE_A` (P1 scoped) — R1 point-in-time HF abuse / context / misuse claims unsupported |
| BEFORE | R1 FULL_BRAKING / POSSIBLE_IMPACT / ENGINE_SHUTDOWN_WHILE_DRIVING derived from grid-labelled OBD records; fed counters, ledger, impact, brake wear, SEVERE misuse; exact anchor-relative context in API |
| CHANGE | `telemetry-source-family.ts` (rawJson resolver); `r1-temporal-containment.ts`; enrichment gate + replace scope + summary marker; ledger read interpretation; impact / brake readers / brake wear / fingerprint; unified read model + DTO marker; trip counters/stats; misuse evidence tag + rating cap + proxy-only lifecycle |
| NON_EFFECTS | Speeding, max speed, trip end/FSM, waypoints, grid anchoring, aggregation, hardwareType, routing, historical data |
| Validation | Focused suites (DI-TEST-R1-CONTAINMENT-001); vehicle-intelligence tree failure set = base + 1 load-dependent pre-existing flake |
| Status | `VALIDATED` (code/tests) — draft PR #1755; not merged, not deployed |
| Evidence | `evidence/reference-capture/EXP_021_C03_R1_TEMPORAL_CONTAINMENT_2026-09-24.md` |

### EXP-021 C0.3B — read-presentation closure (2026-09-24)

| Event | Detail |
|-------|--------|
| Trigger | C0.3A merge-gate — stale customer judgment + unqualified persisted SEVERE misuse presentation |
| CHANGE | `shouldWithholdR1PersistedDrivingStressScore` on canonical trip/vehicle stats; `misuse-case-read-presentation.ts` on misuse list/detail API; provider-native braking documented INDEPENDENT; driving-impact fingerprint test fixture repair |
| NON_EFFECTS | No persistence mutation; admin-only raw aggregates (`trips.service.getStats`, logbook) still deferred |
| Status | `VALIDATED` (code/tests) — draft PR #1755 |
| Evidence | `evidence/reference-capture/EXP_021_C03_R1_TEMPORAL_CONTAINMENT_2026-09-24.md` §5.1 |

### EXP-021 C0.5 — CG-01 `COLD_ENGINE_FULL_THROTTLE` containment (2026-09-24)

| Event | Detail |
|-------|--------|
| Trigger | C0.4 `CG-01` — 326 R1 `HF_DERIVED` rows at full event-list strength |
| CHANGE | Extend `R1_CONTAINED_HF_ABUSE_EVENT_TYPES`; `countContainedAbuseRowsForReadAdjustment` (v1 marker-aware); misuse `ruleColdEngineAbuse` R1 filter; containment marker v2 |
| NON_EFFECTS | CG-02…CG-10, COLD_ENGINE_HIGH_RPM, Tesla/API_SYNTHETIC, no DB mutation |
| Status | `VALIDATED` (code/tests) — draft PR, not deployed |
| Evidence | `evidence/reference-capture/EXP_021_C05_CG01_COLD_ENGINE_FULL_THROTTLE_2026-09-24.md` |
