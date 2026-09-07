# Driving Intelligence — Evidence Index

Canonical catalog of Driving Intelligence evidence for the 2026-08-30 → 2026-09-06 workstream.  
**Governance:** `docs/audits/driving-intelligence-evidence-governance-2026-09-01.md`  
**DI-EV registry:** `docs/audits/driving-intelligence-evidence-registry.md` (53 rows) + C.1d/C.1e in block-polling audit

Each item records what conclusions it **supports** and what it **does not** support.

---

## Type legend

| Type | Meaning |
|------|---------|
| CODE | Runtime implementation |
| TEST | Automated test suite |
| REFERENCE_DRIVE | Controlled capture session (RD001–004) |
| VIDEO_GROUND_TRUTH | External tachometer/dashboard observations |
| TELEMETRY_EXPORT | Machine-readable session exports |
| AUDIT | Forensic audit / phase report |
| DESIGN | Architecture proposal (not production) |
| PRODUCTION_RUNTIME | Production deployment observation |
| PR_COMMIT | Merge / deploy artifact |
| UI/API | Consumer surface semantics |

---

## Program & forensic baseline

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-PHASE1-001 | AUDIT | 2026-08-30 | Phase 1 forensic current-state | `docs/audits/driving-intelligence-phase-1-current-state-forensic-audit-2026-08-30.md` | 0002 | CONFIRMED | Post-trip HF chain; no raw HF in PG; stress=vehicle load | Fleet-scale perf |
| DI-EVID-CODE-BOUNDARY-001 | CODE | — | DI module boundary | `vehicle-intelligence.module.ts` | 0002 | CONFIRMED | Scope separation from trip FSM | DIMO auth internals |
| DI-EVID-CODE-ENRICH-001 | CODE | — | Enrichment orchestrator | `trip-enrichment-orchestrator.service.ts` | 0002 | CONFIRMED | Legacy queue chain | V2 stage DAG when flag off |
| DI-EVID-CODE-SCORE-001 | CODE | — | Impact scorer v1.2.0 | `driving-impact-scorer.ts` | 0002 | CONFIRMED | Formula structure | Ground-truth score accuracy |
| DI-EVID-CODE-LOAD-001 | CODE | — | Load component proxies | `driving-impact-load-components.ts` | 0002 | CONFIRMED | Proxy semantics + assessability | Measured wear |
| DI-EVID-CODE-V2-FLAG-001 | CODE | — | V2 master flag default false | `driving-intelligence-v2.config.ts` | — | CONFIRMED | Safe default | V2 production validation |

---

## DIMO signal surface (Phase 2)

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-2A-001 | AUDIT | 2026-08-31 | Query surface Q001–Q027 | `dimo-phase-2a-current-query-surface-audit-2026-08-31.md` | 0003 | CONFIRMED | 41 signal fields in queries | Per-vehicle availability |
| DI-EVID-2B-001 | AUDIT | 2026-08-31 | Four-vehicle capability matrix | `dimo-phase-2b-four-vehicle-capability-gap-matrix-2026-08-31.md` | 0004 | CONFIRMED | Union 33 signals; 15 unused | Observed update frequency |
| DI-EVID-2C-001 | AUDIT | 2026-08-31 | Schema 117 fields | `dimo-phase-2c-current-schema-signal-expansion-audit-2026-08-31.md` | 0005 | CONFIRMED | Schema vs query separation | Vehicle-specific cadence |
| DI-EVID-2D-001 | AUDIT | 2026-08-31 | Physics/value matrix | `dimo-phase-2d-signal-value-physics-matrix-2026-08-31.md` | 0006 | CONFIRMED | Tier A cadence-critical set | Production detector thresholds |
| DI-EVID-2E-001 | AUDIT | 2026-08-31 | Redundancy canonicalization | `dimo-phase-2e-redundancy-canonicalization-2026-08-31.md` | 0007 | PROPOSAL | Episode identity taxonomy | Deployed episode V2 |
| DI-EVID-2F-001 | AUDIT | 2026-08-31 | Capability-first acquisition | `dimo-phase-2f-capability-first-acquisition-strategy-2026-08-31.md` | 0008 | PROPOSAL | VCM / query planner design | Live planner implementation |
| DI-EVID-LTE-MANIFEST-001 | DESIGN | 2026-08-31 | LTE_R1 manifest v1.1.0 | `docs/audits/manifests/dimo-lte-r1-reference-manifest-v1.json` | 0009/0010 | PROPOSAL | Broad-capture field set | Runtime manifest enforcement |

**Vehicle inventory audits (support 2B):** `dimo-wob-l-7503-…`, `dimo-ks-mx-2024-…`, `dimo-ks-ms-661-…`, `dimo-hmue-c-215-…` (2026-08-30)

---

## Flight Recorder & reference capture

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-RC-FOUNDATION-001 | AUDIT+CODE | 2026-08-31 | Flight Recorder foundation | `dimo-phase-3a1-flight-recorder-foundation-2026-08-31.md` | 0011/0012 | CONFIRMED | RC module; envelope v1.0.0 | Production HF path change |
| DI-EVID-RC-CANARY-001 | PRODUCTION_RUNTIME | 2026-08-31 | Stationary canary 52 obs | `dimo-phase-3a2-production-preflight-canary-2026-08-31.md` | 0013/0014 | CONFIRMED | REFERENCE_DRIVE_READY | Motion HF density |
| DI-EVID-0035C-RECOVERY-001 | AUDIT+CODE | 2026-09-04 | HF Recovery V2 policy | `driving-intelligence-hf-recovery-runtime-implementation-2026-09.md` | 0035C | CONFIRMED | Settlement/overlap/watermarks | Optimal 8s/6s; prod cutover |
| DI-EVID-0035C1-BLOCK-001 | AUDIT+CODE | 2026-09-04–05 | Block polling + C.1a–e | `driving-intelligence-hf-block-polling-scalability-2026-09.md` | 0035C.1–C.1e | CONFIRMED | Testbed implementation | 30s density proof; live canary |
| DI-TEST-HF-RECOVERY-001 | TEST | — | Recovery V2 unit tests | `reference-capture-hf-recovery-v2.policy.spec.ts` | 0035C | CONFIRMED | Policy semantics | Multi-replica prod |
| DI-TEST-BLOCK-POLL-001 | TEST | — | Block poll + calibration tests | `reference-capture-hf-block-polling.policy.spec.ts` | C.1 | CONFIRMED | Phase lifecycle | Live 10/20/30/60 run |

---

## Reference drives

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-RD001-001 | REFERENCE_DRIVE | 2026-09-01 | RD001 Tiguan STOP; no video | `dimo-lte-r1-reference-drive-001-capture-report-2026-09-01.md` | 0016–0019 | CONFIRMED | Late-arrival differential; 151s gap | Video GT alignment |
| DI-EVID-RD002-001 | REFERENCE_DRIVE | 2026-09-02 | RD002 C63 motion | `dimo-lte-r1-reference-drive-002-capture-report-2026-09-02.md` | 0023–0026 | CONFIRMED | Sealed HF Δt P50 **13.489s**; 1s≠1Hz; AGGREGATE_BUCKET_V2 | ~2s median (that is RD003) |
| DI-EVID-RD002-SEALED-CADENCE-001 | REFERENCE_DRIVE | 2026-09-02 | RD002 sealed spacing metrics | Same + signal-quality-metrics.json | 0025 | CONFIRMED | P50 13.489 / P95 84.024 / MAX 249.647 | Physical 1 Hz |
| DI-EVID-RD003-CADENCE-001 | REFERENCE_DRIVE | 2026-09-02–03 | RD003 Tiguan + video GT | `driving-intelligence-rd003-signal-quality-interpretation-2026-09.md` | 0027–0034E | CONFIRMED | 1s request ≠ **~2.00s** RD003 HF median; providerTimestamp authority | RD002 sealed P50; validated global GT |
| DI-EVID-RD003-ALIGN-001 | VIDEO_GROUND_TRUTH | 2026-09-03 | Sparse video GT 9 clips | `docs/audits/data/rd003-video-ground-truth-observations.json` | 0034B–D | INFERRED | Speed fingerprint presence | GROUND_TRUTH_VALIDATED=NO |
| DI-EVID-RD004-A-001 | REFERENCE_DRIVE | 2026-09-04 | RD004 Segment A alignment | `architecture/RD004_A_SEGMENT_A_VIDEO_TELEMETRY_ALIGNMENT_2026-09-04.md` | 0035A.2 | CONFIRMED | H≠provider offset; 38 HF samples | Global clock fit |
| DI-EVID-RD004-B-001 | REFERENCE_DRIVE | 2026-09-04 | RD004-B late buckets | `docs/audits/data/rd004-segment-b/rd004-b-findings.md` | 0035B.4–B.6 | CONFIRMED | 53 late-arrival; 26 watermark-excluded | 8/6 optimality |
| DI-EVID-RD004-B-REPLAY-001 | TELEMETRY_EXPORT | 2026-09-04 | 75 exact-window replays | `rd004-b-hf-exact-window-replay.json` | 0035B.4 | CONFIRMED | Capture watermark gap root cause | Provider physics cadence |

Detail: [reference-capture/REFERENCE_DRIVES.md](./reference-capture/REFERENCE_DRIVES.md), [RD003_RETROSPECTIVE.md](./reference-capture/RD003_RETROSPECTIVE.md), [RD004_RETROSPECTIVE.md](./reference-capture/RD004_RETROSPECTIVE.md)

---

## Signal inventory & cadence

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-SIGNAL-SURFACE-001 | AUDIT | 2026-09-06 | Canonical surface audit | `evidence/signal-inventory/SIGNAL_SURFACE_AUDIT.md` | 0003+ | CONFIRMED | SNAPSHOT/LIVE/HF/Native roles | All vehicles identical |
| DI-EVID-CADENCE-FOUR-WAY-001 | AUDIT | 2026-09-06 | Four-way cadence invariant | `evidence/signal-inventory/CADENCE_DENSITY.md` | 0034E | CONFIRMED | Query≠poll≠density≠physics | Single-number cadence claims |

---

## Scoring, detectors, episode design

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-0034F-DESIGN-001 | DESIGN | 2026-09-03 | Episode V2 canonical design | `driving-intelligence-v2-canonical-design-2026-09.md` | 0034F | PROPOSAL | Episode taxonomy + confidence | Production behavior |
| DI-EVID-DETECTOR-AUDIT-001 | CODE+AUDIT | 2026-09-06 | Production HF detectors | `evidence/driving-events/DETECTOR_AUDIT.md` | 0002+0034E | CONFIRMED | Point-pair algorithms + thresholds | GT-validated detector accuracy |
| DI-EVID-NATIVE-EVENTS-001 | CODE+AUDIT | 2026-09-06 | Native DIMO event authority | `evidence/driving-events/NATIVE_DIMO_EVENTS.md` | 0026+0034F | CONFIRMED | LTE_R1 misuse path | HF short-event authority |
| DI-EVID-SCORING-001 | CODE+AUDIT | 2026-09-06 | Impact V1 + naming audit | `research/scoring-models/SCORING_RETROSPECTIVE.md` | 0002 | CONFIRMED | Current formulas | Driver quality inference |
| DI-EVID-LOAD-FORMULAS-001 | CODE | — | Tire/brake load derivation | `evidence/tire-brake-load/LOAD_FORMULAS.md` | P43 | CONFIRMED | Proxy formulas | Measured wear |
| DI-TEST-IMPACT-SCORER-001 | TEST | — | Impact scorer regression | `driving-impact.service.spec.ts` | — | CONFIRMED | Formula stability | Real-world calibration |

---

## Production deployment

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-PR-1533-001 | PR_COMMIT | 2026-09-05 | C.1e merge + safe deploy | PR #1533 `3d5040b67` | 0035C–C.1e | CONFIRMED | CODE_DEPLOYED=YES | FEATURE_ENABLED=YES |
| DI-EVID-DEPLOY-STATE-001 | PRODUCTION_RUNTIME | 2026-09-05 | Post-merge flag state | `evidence/production/DEPLOYMENT_STATE.md` | C.1e | CONFIRMED | V2 OFF; empty canary; LEGACY authority | Live calibration executed |
| DI-EVID-DEF019-GATE2-001 | PRODUCTION_RUNTIME | 2026-09-06 | DI-DEF-019 GATE 2 dress rehearsal | `evidence/reference-capture/DI_DEF_019_GATE2_PRODUCTION_DRESS_REHEARSAL_2026-09-06.md` | 0035C.1e | CONFIRMED | Prod phase lifecycle STOP/ABORT; lockSessionRow fix | Scientific 10/20/30/60 cadence proof |
| DI-EVID-EXP019-LIVE-CAL-001 | REFERENCE_DRIVE | 2026-09-07 | EXP-019 live 10/20/30/60 calibration | `evidence/reference-capture/LIVE_HF_CALIBRATION_KS_MX_2024_10_20_30_60_2026-09-07.md` | 0035C.1c | INFERRED | First live multi-cadence run; request reduction observed | Cadence winner; 30s validated; prod cutover |
| DI-EVID-DEF019-GATE1-001 | TEST | 2026-09-06 | DI-DEF-019 GATE 1 postgres integration | `evidence/reference-capture/DI_DEF_019_GATE1_POSTGRES_INTEGRATION_2026-09-06.md` | 0035C.1e | CONFIRMED | Real PG lock + phase paths | Production runtime |
| DI-EVID-API-UI-001 | UI/API | 2026-09-06 | Semantic mismatch audit | `evidence/production/API_UI_SEMANTICS.md` | 0002 | CONFIRMED | Naming risks | Backend formula errors |

---

## High-timeframe / temporal analytics

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-HTF-001 | AUDIT | 2026-09-06 | High-timeframe work status | `evidence/temporal-analytics/HIGH_TIMEFRAME_WORK.md` | — | CONFIRMED | Partial rolling aggregates exist | Dedicated time-series intelligence module |

---

## Cross-links

| Register | Path |
|----------|------|
| DI-EV chronology | `research/DI_EV_CHRONOLOGY.md` |
| Experiments | `research/EXPERIMENT_REGISTER.md` |
| Hypotheses | `research/HYPOTHESIS_REGISTER.md` |
| Defects | `research/DEFECT_LEDGER.md` |
| PR timeline | `research/PR_TIMELINE.md` |
| Workstream narrative | `WORKSTREAM_HISTORY.md` |

**Total indexed evidence items (this authority):** 40+ primary IDs; 53 DI-EV registry rows; 100+ repository artifact paths.
