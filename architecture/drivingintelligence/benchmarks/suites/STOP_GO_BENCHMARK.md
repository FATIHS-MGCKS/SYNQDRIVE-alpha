# Suite: STOP_GO_BENCHMARK

**Goal:** Stillstand, creep, short stops, GPS jitter, data gaps — without treating **gaps as stops** or **DRIVER_REPORTED** as confirmed.

## Primary benchmarks

| BMK_ID | Notes |
|--------|-------|
| `BMK-TESLA-EXP021-20261020-TRIP1` | TC-3 **not** second-accurate; TC-5 partial stationary evidence — **DRIVER_REPORTED** |
| `BMK-TESLA-EXP021-20261020-TRIP2` | B3 qualitative maps |
| `BMK-GOLDEN-C1-R1-002` | **SIMULATED** hold/release — unit tests |

## Signals under test

- S1: `STATIONARY_SUPPORTED`, hold/release, `TRANSITION_UNCERTAIN`
- **Not** Trip FSM `RESTING`
- Micro-motion FSM (B7.1): **NOT_IN_REPO** — SIMULATED in cloud only

## Metrics (when GT exists)

- Stop onset/offset error (seconds) — requires **INDEPENDENTLY_VALIDATED** video sync
- Without GT: report **candidate counts** only (`STOP_CANDIDATE`, `STOPPED_SUPPORTED`) with policy label

## Causality

Batch L3 vs strict online mask must be **separate runs** — see CAUSALITY_BENCHMARK.

## Repro

- Cloud: `/opt/cursor/artifacts/exp021-tesla-b7-2/simulator/` — **NOT_IN_REPO**
- Repo: `core/__tests__/di-v0-pure-core.spec.ts`, golden FULL-R1-002
