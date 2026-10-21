# Reference Trip Registry

## Tesla EXP021 (2026-10-16 campaign)

| Field | TRIP_1 | TRIP_2 |
|-------|--------|--------|
| Vehicle ID | `68868291-5478-42cd-b0c4-cc77b2a78e21` | same |
| Trip ID | `11f5a645-752e-4b8a-b20a-9f1fc3a6673e` | `0f8d2f76-9b09-4aba-8c56-fa7e2ce1c5a8` |
| Source family | `API_SYNTHETIC` | same |
| DIMO token | 186946 | same |
| Fixture on main | `evidence/ldi-10d/fixtures/tesla-20261016/` partial | **VERIFIED** pins in ldi-10d |
| Positions | `TESLA_POSITION_GRID.json` | same grid file trip-scoped in replays |
| Video witness | `VIDEO_TACHO_REFERENCE.json` | **not GPS GT** |
| Shadow pin SHA256 (TRIP_1) | REPORTED `048383f6…` (agent B72/B74) | — |

### TC-1 .. TC-6 (test cases)

| TC | Description (REPORTED) | Ground truth class | Second-accurate? |
|----|------------------------|--------------------|----------------|
| TC-1 | Owner context anchor | DRIVER_REPORTED | UNKNOWN |
| TC-2 | (protocol) | DRIVER_REPORTED | UNKNOWN |
| TC-3 | Stop/creep dispute | DRIVER_REPORTED | **NO** — forensic gaps |
| TC-4 | (protocol) | DRIVER_REPORTED | UNKNOWN |
| TC-5 | Stationary / gap narrative | DRIVER_REPORTED + telemetry partial | Partial stationary evidence |
| TC-6 | (protocol) | DRIVER_REPORTED | UNKNOWN |

## VW Tiguan navigation video (2026-10-19)

| Field | Value |
|-------|-------|
| Evidence dir | `evidence/exp021-tiguan-20261019/` |
| Grid | `fixtures/TIGUAN_POSITION_GRID.json` |
| OSM | `TIGUAN_OSM_FROZEN_SNAPSHOT.json` |
| Variants | A–E replay JSON under `replay/` |
| GT | **NOT_ASSESSABLE** for road ID accuracy |

## Reference drives RD001–RD004 (2026-09)

| ID | Vehicle / session | GT method | Key metric |
|----|-------------------|-----------|------------|
| RD001 | Tiguan LTE | Capture report | 151s gap, no video |
| RD002 | C63 | Sealed HF export | P50 Δt 13.489s |
| RD003 | Tiguan + video | Sparse video GT 9 clips | ~2s HF median; MAE fit ~8.5 in-sample |
| RD004 | Multi-segment | Video alignment | Late buckets / watermark |

Detail: `evidence/reference-capture/REFERENCE_DRIVES.md`.

## P2.1 forensic real trip (2026-10-14)

| Field | Value |
|-------|-------|
| Trip | `d0af9cc7-ce0d-4e40-9854-2c1341e83bed` |
| Window | 1480 s @ 1 Hz grid |
| GT | **NONE** — QC semantics study |

## KS MX / MS 661 EXP-021 upper bound sessions

Evidence under `evidence/reference-capture/EXP_021_KS_*` — native cadence, gaps, **no Trip FSM changes**.

## GPS / iPhone experiments

**NOT_AVAILABLE** as pinned registry rows on main — mentioned in C1D7 golden narrative only.

## Data gaps semantics (VERIFIED)

Missing bucket ≠ stop. See P2.1 taxonomy `MISSING_BUCKET_INSIDE_WINDOW` vs `ROW_ABSENT`.
