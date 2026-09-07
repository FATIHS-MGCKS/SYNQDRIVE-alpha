# Driving Intelligence — Experiment Register

Catalog of audits, reference drives, replays, and calibration experiments.

| ID | Date | Purpose | Vehicle | Data source | Result | Decision | Evidence |
|----|------|---------|---------|-------------|--------|----------|----------|
| EXP-001 | 2026-08-30 | Phase 1 forensic code audit | Fleet (code) | Repository | Production chain mapped | DI-DEC-POST-TRIP-HF-001 | DI-EV-0002 |
| EXP-002 | 2026-08-31 | DIMO query surface inventory | — | Code + GraphQL | 41 fields, Q001–Q027 | Phase 2 continuation | DI-EV-0003 |
| EXP-003 | 2026-08-31 | Four-vehicle capability matrix | Tiguan, C63, A4, Arteon | DIMO live | Union 33 signals | Capability-first design | DI-EV-0004 |
| EXP-004 | 2026-08-31 | Stationary production canary | Tiguan | Reference capture | 52 obs; REFERENCE_DRIVE_READY | 3A.3 proceed | DI-EV-0013 |
| EXP-005 | 2026-09-01 | RD001 real-motion STOP | Tiguan `19fedd4b` | DIMO HF | Late arrival differential; no video | FAST GO + watermark work | DI-EV-0016 |
| EXP-006 | 2026-09-02 | RD002 motion HF canary | KS MX 2024 C63 | DIMO HF + AGGREGATE_BUCKET_V2 | **1s≠1Hz**; sealed P50 13.489s; 351 cycles | RD003 + video GT | DI-EV-0023 |
| EXP-007 | 2026-09-02 | RD003 segmented video GT | Tiguan WOB L 7503 · `0fa040aa` | DIMO + 9 video clips | HF cadence confirmed; GT partial | Alignment workbench | DI-EV-0027 |
| EXP-008 | 2026-09-03 | RD003 global fingerprint discovery v1 | Tiguan RD003 | Video + HF | Method superseded | 0034D V2 | DI-EV-0034C |
| EXP-009 | 2026-09-03 | RD003 global fingerprint discovery v2 | Tiguan RD003 | Video + HF | Joint DP; GROUND_TRUTH_VALIDATED=NO | Signal quality phase | DI-EV-0034D |
| EXP-010 | 2026-09-03 | RD003 signal quality interpretation | Tiguan RD003 | Aligned windows | Per-signal usability matrix | Episode V2 design | DI-EV-0034E |
| EXP-011 | 2026-09-04 | RD004-A Segment A alignment | KS MX 2024 · `f1e81e78` | Video + HF | Methodology v3 closeout | Segment B | DI-EV-0035A.2 |
| EXP-012 | 2026-09-04 | RD004-B exact-window HF replay | KS MX token 187336 | Sealed capture | 53 late; 26 watermark gap | Recovery V2 | DI-EV-0035B.4 |
| EXP-013 | 2026-09-04 | RD004-B recovery policy simulation | KS MX Segment B | Counterfactual grid | 8/6 provisional | DI-EV-0035C impl | DI-EV-0035B.6 |
| EXP-014 | 2026-09-04 | HF Recovery V2 unit/policy tests | — | Synthetic + fixtures | Implementation validated | C.1 testbed | DI-EV-0035C |
| EXP-015 | 2026-09-04–05 | C.1a–e correctness hardening | — | Concurrency specs | 113 RC HF tests PASS | PR #1533 merge | DI-EV-0035C.1e |
| EXP-016 | 2026-09-06 | Live 10/20/30/60s calibration attempt #1 | KS MX 2024 · token 187336 | Reference capture prod | **BLOCKED** — DI-DEF-019 SQL lock (42P01) | Superseded by EXP-019 | `LIVE_HF_CALIBRATION_2026-09-06_BLOCKED.md` |
| EXP-017 | 2026-09-06 | DI-DEF-019 GATE 1 postgres integration | — | Isolated PG 16 | 10 integration + 33 regression PASS | FIXED_CODE_TESTED | `DI_DEF_019_GATE1_POSTGRES_INTEGRATION_2026-09-06.md` |
| EXP-018 | 2026-09-06 | GATE 2 stationary dress rehearsal | KS MX 2024 · token 187336 | Production runtime | **PASS** — 10→60 lifecycle + STOP + ABORT | FIXED_PRODUCTION_VALIDATED (DI-DEF-019) | `DI_DEF_019_GATE2_PRODUCTION_DRESS_REHEARSAL_2026-09-06.md` |
| EXP-019 | 2026-09-07 | **EXP-016 RETRY** live 10/20/30/60 calibration + bias-control | KS MX 2024 · token 187336 | Reference capture prod | **EXECUTED** — 5 gap GT + 8 control windows; HF void in gaps; FULL/PARTIAL HF in controls; NO cadence conclusion (N=1) | EXP-020 counterbalanced 60→30→20→10 | `EXP_019_BIAS_CONTROL_AND_DECISION_READINESS_2026-09-07.md` |

**EXPERIMENT_ENTRIES_TOTAL:** 19  
**EXPERIMENTS_EXECUTED:** 19  
**EXPERIMENTS_PENDING:** 0
