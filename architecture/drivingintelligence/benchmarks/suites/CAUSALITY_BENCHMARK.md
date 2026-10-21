# Suite: CAUSALITY_BENCHMARK

**Goal:** Compare **online-available** evidence vs batch / delayed / retrospective evidence on the **same pinned input**.

## Core questions

1. Does `L3_CENTERED_PATH` at index *i* use position at *i+1*? **YES** (code)
2. Does strict online mask eliminate retrospective stops? **REPORTED** B7.2/B7.3 on Tesla TRIP_1 — artifacts NOT_IN_REPO
3. Does provider waypoint speed imply instant stop? **NO** (B7.4 REPORTED)

## Benchmarks

| BMK_ID | Comparison |
|--------|------------|
| `BMK-TESLA-EXP021-20261020-TRIP1` | Batch L3 vs micro-motion FSM vs strict mask |
| `BMK-P21-R3-AUDI-20261014` | S1 batch intervals vs P1 QC order |
| `BMK-TESLA-LDI10D-20261016` | Full-trip L3 vs per-second eligibility audit |

## Required reporting

- Policy name (e.g. `STRICT_ONLINE_L3_MASK_V1`)
- Whether t+1 positions are excluded
- Arrival-time / ingestion audit if claiming online — B7.4 scope

## Prohibited

- Labeling batch replay as **online-kausal** without mask
- Using DIMO ingestion timestamps not present in pins as proof
