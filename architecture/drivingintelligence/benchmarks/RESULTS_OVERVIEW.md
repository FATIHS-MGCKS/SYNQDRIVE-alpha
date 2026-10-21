# Benchmark Results Overview

**Rule:** Absent ground truth is **not** scored as success or zero error.

## MEASURED (reproducible from repo or cited forensic)

| Benchmark | Result | Source |
|-----------|--------|--------|
| Tesla LDI-10D 1136-bucket replay | Baseline ASSOC 264 / AMB 512 / UNK 360; Viterbi ASSOC 300 / AMB 357 / UNK 479 | PR B evidence / CHANGE_LEDGER |
| Tesla P1 direction-aware | 135 way-id changes; **NO_ACCURACY_CLAIM** | `TESLA_DIRECTION_AWARE_P1_REGRESSION.md` |
| Tiguan A–E | Decoder diffs; strict node-id no effect in video window; R4.1 partial | `TIGUAN_VALIDATION_REPORT.md` |
| P2.1 Audi 1480 s | 691 trusted numeric; 763 NO_NUMERIC; 26 conflicts | `EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md` |
| RD002 sealed | P50 Δt 13.489 s | `REFERENCE_DRIVES.md` |
| VIDEO_TACHO file (749 pairs) | MAE ~2.38 km/h recomputed on repo JSON | local recompute 2026-10-21 — **not** the 123-point study |

## REPORTED / NOT_VERIFIED

| Claim | Status |
|-------|--------|
| 123-point tacho MAE 3.13 km/h | Secondary citation in P2.1 — **no primary pin on main** |
| Tesla Oct-20 B7 stop seconds | Cloud artifacts — **NOT_IN_REPO** |
| Tiguan video way accuracy % | **Explicitly not claimed** in validation report |

## SIMULATED

| Package | Output |
|---------|--------|
| `BMK-GOLDEN-C1-R1-002` | Unit test pass/fail |
| B7.2 offline FSM | SIMULATED — cloud only |

## Suite readiness

| Suite | Ready benchmarks |
|-------|------------------|
| SPEED_BENCHMARK | Tesla LDI-10D (proxy), RD003 (limited) |
| STOP_GO_BENCHMARK | Golden + Oct-20 (partial, not in repo) |
| ROAD_MATCHING_BENCHMARK | Tesla + Tiguan pinned |
| ROUTING_BENCHMARK | Tiguan E, research merges |
| GAP_RECOVERY_BENCHMARK | RD*, KS*, P2.1 taxonomy |
| CAUSALITY_BENCHMARK | P2.1 code anchors; Tesla B7 needs export |
