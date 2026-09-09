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
