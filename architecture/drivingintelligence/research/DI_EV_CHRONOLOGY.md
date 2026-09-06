# Driving Intelligence — DI-EV Chronology (2026-08-30 → present)

Complete evidence-ID sequence for the reconstruction workstream.  
**Source of truth index:** `docs/audits/driving-intelligence-evidence-registry.md` (53 rows through C.1c) + C.1d/C.1e in block-polling audit.

**Total DI-EV items catalogued:** 55 primary IDs (+ sub-revisions 0034D.1, 0034E.1, 0035B.3–B.6 chain)

---

## Program foundation

### DI-EV-0001 — Master reconstruction plan
| Field | Value |
|-------|-------|
| **Date** | 2026-08-30 |
| **Problem** | No durable map of DI subsystem; months of implicit knowledge |
| **Hypothesis** | Phased forensic audit → signal audit → reference capture → validation |
| **Result** | Program authority; gates G1–G6 defined |
| **Next** | DI-EV-0002 Phase 1 forensic audit |
| **Path** | `docs/audits/driving-intelligence-reconstruction-master-plan-2026-08-30.md` |

### DI-EV-0002 — Phase 1 forensic current-state audit
| Field | Value |
|-------|-------|
| **Date** | 2026-08-30 |
| **Problem** | What does production DI actually do? |
| **Finding** | Post-trip HF → detectors → Impact V1; `drivingStressScore` = vehicle load; no raw HF in Postgres |
| **Defect surfaced** | `DriverScoreService` naming vs semantics; `profilesComparable()` dead code |
| **Production impact** | None (audit only) |
| **Next** | DIMO query surface audit (Phase 2A) |
| **Validation** | CONFIRMED_FROM_CODE |

---

## Phase 2 — DIMO signal surface (2026-08-31)

### DI-EV-0003 — Query surface audit (2A)
41 unique signal fields; Q001–Q027 GraphQL registry.

### DI-EV-0004 — Four-vehicle capability matrix (2B)
Tiguan, C63, A4, Arteon; union 33 signals; 15 available-but-unused.

### DI-EV-0005 — Schema expansion (2C)
117 global provider fields; schema vs query vs vehicle separation.

### DI-EV-0006 — Signal value/physics matrix (2D)
30 candidates; Tier A = 8 cadence/latency-critical signals.

### DI-EV-0007 — Redundancy canonicalization (2E)
33 canonical keys; 16 redundancy groups; episode identity taxonomy (proposal).

### DI-EV-0008 — Capability-first acquisition (2F)
VCM; T0–T7 tiers; query planner design (proposal).

### DI-EV-0009 / DI-EV-0010 — LTE_R1 reference manifest (2F.1)
Frozen manifest v1.1.0 JSON for Flight Recorder broad-capture model.

---

## Phase 3A — Flight Recorder (2026-08-31 → 2026-09-02)

### DI-EV-0011 / DI-EV-0012 — Flight Recorder foundation (3A.1)
Reference-capture module; envelope v1.0.0; `REFERENCE_CAPTURE_ENABLED` gate.

### DI-EV-0013 / DI-EV-0014 — Production preflight canary (3A.2)
Stationary canary; 5 cycles; 52 observations; Tiguan session `e8613cc7-…`.

### DI-EV-0015 — Evidence governance
Normative rules for all future DI evidence IDs.

### DI-EV-0016–0019 — Reference Drive 001 (RD001)
| Field | Value |
|-------|-------|
| **Vehicle** | VW Tiguan `19fedd4b-…` |
| **Session** | `06638509-…` |
| **Finding** | HF late-arrival differential; 151s PROVIDER_DATA_GAP; **VIDEO NOT CAPTURED** |
| **Negative** | GT alignment impossible for RD001 |
| **Next** | FAST PRE-ARM/GO remediation (0020); watermark fix (0021) |

### DI-EV-0020 — FAST PRE-ARM/GO remediation (3A.3.1)
PRE-ARM→READY; FAST GO via HTTP; 15s cap; SIGNAL_POINT-only gate.

### DI-EV-0021 — HF watermark + aggregate identity (3A.3.2)
Per-field data/query coverage watermarks; V2 bucket fingerprint; RD001 39-exclusion remediated.

### DI-EV-0022 — Production canary (3A.3)
Cutover + redeploy `f00a49394`; post-deploy smoke PASS.

### DI-EV-0023–0026 — Reference Drive 002 (RD002)
| Field | Value |
|-------|-------|
| **Vehicle** | KS MX 2024 (C63) `a60c0749-…` · token context |
| **Session** | `e095d273-…` |
| **Finding** | **HF 1s ≠ 1Hz** — median bucket ~2s; 351 cycles; 355 HF_HISTORICAL V2 |
| **Native events** | NOT_OBSERVED on C63 |
| **Next** | RD003 with segmented video GT |

### DI-EV-0027–0032 — Reference Drive 003 (RD003)
| Field | Value |
|-------|-------|
| **Vehicle** | VW Tiguan WOB L 7503 `19fedd4b-…` |
| **Session** | `0fa040aa-6105-4879-b2c-f8ad477009b8` |
| **Finding** | Segmented video GT; HF 1s≠1Hz confirmed; idempotency NOT_EXERCISED |
| **Next** | Video-GT alignment workbench (0034A–D) |

---

## RD003 video / alignment chain (2026-09-03)

### DI-EV-0033 — Correlation telemetry export
5010-row lossless export for external alignment; NOT ground truth itself.

### DI-EV-0034A — Alignment workbench v1.2
Multi-clock model; WORKBENCH_READY; NOT validated GT.

### DI-EV-0034B — First real sparse video GT
9 clips, 198 obs; GROUND_TRUTH_VALIDATED=NO.

### DI-EV-0034C — Global fingerprint discovery v1 (SUPERSEDED)
Clock-prior falsification; methodological defects.

### DI-EV-0034D / DI-EV-0034D.1 — Global fingerprint discovery v2
Joint DP intervals; static-minute geometry correction; GROUND_TRUTH_VALIDATED=NO.

### DI-EV-0034E / DI-EV-0034E.1 — Signal quality interpretation
| Field | Value |
|-------|-------|
| **Key proof** | ~2s median HF cadence; providerTimestamp authority; synqReceivedAt NOT reliable |
| **Key negative** | IN_SAMPLE_ALIGNMENT_FIT ≠ independent accuracy; LATEST_LIVE insufficient for GT |
| **Production** | DRIVING_SCORE_CHANGED=NO |
| **Next** | Episode V2 design (0034F); RD004 validation |

### DI-EV-0034F — Canonical V2 design
Episode reconstruction; confidence layers; DEPLOYED=NO; READY_FOR_RD004=YES.

---

## RD004 — Alignment + HF recovery (2026-09-04 → 2026-09-05)

### DI-EV-0035A → 0035A.2 — RD004 Segment A (KS MX 2024)
Methodology iterations; H displacement ≠ provider offset; CLOCK_FIT_ELIGIBLE=[].

### DI-EV-0035B → 0035B.6 — RD004 Segment B (KS MX token 187336)
| Stage | Finding |
|-------|---------|
| **B (superseded)** | Original offset/MAE claims invalidated |
| **B.3** | Launch gap 35.102s; clock evidence removed |
| **B.4** | 75 exact-window replays; 53 late-arrival; 26 watermark-excluded |
| **B.5 (superseded)** | Settlement×overlap grid; exact 8/6 claims too strong |
| **B.6** | Provisional 8s settlement / 6s overlap; live calibration contract |

**Root cause (B.4):** `PROVIDER_LATE_ARRIVAL_PLUS_CAPTURE_WATERMARK_RECOVERY_GAP`

### DI-EV-0035C — HF Recovery V2 runtime
| Field | Value |
|-------|-------|
| **Implementation** | Settlement delay, recovery overlap, triple watermarks, provenance ring |
| **Scope** | Reference Capture only |
| **CODE_DEPLOYED** | YES (PR #1533 merge `3d5040b67`, 2026-09-05) |
| **FEATURE_ENABLED** | NO (default `HF_RECOVERY_POLICY_V2_ENABLED=false`) |
| **Production HF path** | UNCHANGED |
| **Next** | Block polling scalability (C.1) |

### DI-EV-0035C.1 — Block polling testbed
30s poll hypothesis; `HF_30S_BLOCK_POLLING_VALIDATED=NO`.

### DI-EV-0035C.1a — Pre-canary hardening
Canary fail-closed; bucket-age semantics; stagger deadline primitive.

### DI-EV-0035C.1b — Dynamic canary contract
Runtime vehicle-agnostic; operator selects vehicle; KS MX 187336 = example only.

### DI-EV-0035C.1c — Single-drive multi-cadence calibration
One physical drive; phases 10/20/30/60s; session-scoped poll override; transition windows.

### DI-EV-0035C.1d — Phase transition atomicity
| Field | Value |
|-------|-------|
| **Defect** | Lost-update race: cycle release overwrote operator phase switch |
| **Fix** | Control-plane vs data-plane; FOR UPDATE; REQUESTED vs EFFECTIVE |
| **Tests** | 103 reference-capture HF tests PASS |

### DI-EV-0035C.1e — Pre-live-canary closure
| Field | Value |
|-------|-------|
| **Defects fixed** | Stale precompute race; pending 409 semantics; terminal finalization; stop quiescence |
| **Metrics** | Real temporal bucket IDs; phase-wide cadence stats; transition/recovery excluded |
| **PR** | #1533 merged 2026-09-05 |
| **LIVE_CANARY** | NOT EXECUTED |
| **Next** | Operator-selected vehicle; 10/20/30/60 live calibration |

---

## Planned (not started)

### DI-EV-0034G — RD004 final closeout + production readiness gate
NOT_STARTED per evidence registry.
