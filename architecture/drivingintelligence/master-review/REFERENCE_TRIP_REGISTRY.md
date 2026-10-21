# Reference Trip & Ground Truth Register

**12 rows (`REF-001` … `REF-012`)** — includes sessions and TC anchors, not all independent drives.

Validation tier legend: **MEASURED** | **INDEPENDENTLY_VALIDATED** | **DRIVER_REPORTED** | **PROXY_ONLY** | **SIMULATED** | **NOT_VERIFIED**

## Register

| ID | Name | Vehicle | Trip / session ID | Date (UTC context) | Provider / family | Primary data source | Snapshot / hash | Video / GPS ref | Independent GT | Algorithms used | Metrics actually checked | Gaps |
|----|------|---------|-------------------|--------------------|-------------------|---------------------|-----------------|-----------------|----------------|-----------------|--------------------------|------|
| REF-001 | Tesla LDI-10D frozen | `68868291-5478-42cd-b0c4-cc77b2a78e21` | `358d0158-b2a9-47ed-af26-33926c5770b4` | ~2026-10-16 route | DIMO / `API_SYNTHETIC` | `ldi-10d/fixtures/tesla-20261016/TESLA_POSITION_GRID.json` | `DI_V0_S4_EVIDENCE_V1:sha256:c703e9c4…` (manifest) | `VIDEO_TACHO_REFERENCE.json` | **PROXY_ONLY** | Baseline, Viterbi, P1 regression | Bucket class counts, way-change audit | No road-ID GT |
| REF-002 | Tesla EXP021 TRIP_1 | same | `11f5a645-752e-4b8a-b20a-9f1fc3a6673e` | **2026-10-20** campaign | DIMO | Shadow JSONL / DB exports (**NOT on main** @ `0a16ffb5b`) | REPORTED `048383f6…` shadow file | Driver video review | **DRIVER_REPORTED** + telemetry | B7 replays REPORTED | Stop labels under strict L3 mask | **NOT_IN_REPO** at dossier SHA |
| REF-003 | Tesla EXP021 TRIP_2 | same | `0f8d2f76-9b09-4aba-8c56-fa7e2ce1c5a8` | **2026-10-20** | DIMO | REPORTED B3 maps / shadow | NOT_VERIFIED | Human review map | **DRIVER_REPORTED** | B3 visualization | Qualitative | Artifacts NOT_ON_MAIN |
| REF-004 | VW Tiguan nav video | Tiguan (org per evidence dir) | (see `TIGUAN_INPUT_MANIFEST.json`) | 2026-10-19 | DIMO + nav video | `exp021-tiguan-20261019/` | Frozen OSM + grids | Navigation video | **NOT_VERIFIED** road GT | Variants A–E, P1 | Assoc/ambig counts, safety CSVs | NO_ACCURACY_CLAIM |
| REF-005 | RD001 | Tiguan LTE | per capture report | 2026-09-01 | DIMO | reference-capture report | TELEMETRY_EXPORT | None | **NOT_VERIFIED** | HF capture | Gap 151s | No video |
| REF-006 | RD002 | C63 | per report | 2026-09-02 | DIMO | sealed HF export | signal-quality-metrics | None | **MEASURED** spacing | HF_HISTORICAL | P50 13.489s Δt | Not L3 accuracy |
| REF-007 | RD003 | Tiguan | per report | 2026-09-02–03 | DIMO | HF + video clips | rd003 JSON | 9 clips | **PROXY_ONLY** | alignment | ~8.5 MAE in-sample | GROUND_TRUTH_VALIDATED=NO |
| REF-008 | RD004 | Multi | segments A/B | 2026-09-04 | DIMO | segment exports | replay JSON | Video | **PROXY_ONLY** | watermark / late bucket | late arrival counts | MAE-only rejected |
| REF-009 | P2.1 forensic trip | `c10351f8-b6a2-4258-947f-631aeaa6d359` | `d0af9cc7-ce0d-4e40-9854-2c1341e83bed` | 2026-10-14 window | DIMO | pinned S4 snapshot `06d5c120…` | gzip payload | None | **NONE** | P1 QC, S1, L3 read | 763 NO_NUMERIC taxonomy | Not Tesla |
| REF-010 | KS MX 2024 EXP-021 cal | KS MX 2024 | session | 2026-09-07 | DIMO | `EXP_021_KS_MX_*` | run logs | Video GT windows | **PROXY_ONLY** | HF cadence 10/20/30/60 | gap stats | No cadence winner |
| REF-011 | KS MS 661 upper bound | MS 661 | session | 2026-09-11 | DIMO | `EXP_021_KS_MS_661_*` | forensic freeze | None | **MEASURED** cadence | native buckets | P95 Δt | Trip FSM excluded |
| REF-012 | TC-1 … TC-6 anchors | Tesla (REF-002/003) | logical test cases on TRIP_1/2 | 2026-10-20 review | — | owner protocols (#2051 commits REPORTED) | — | Driver narrative | **DRIVER_REPORTED** | forensic docs | TC-3 **not** second-accurate; TC-5 partial stationary | Not separate trips |

## TC-1 .. TC-6 (detail)

| TC | Narrative role | GT class | Second-accurate stop? |
|----|----------------|----------|------------------------|
| TC-1 | Trip/start context | DRIVER_REPORTED | UNKNOWN |
| TC-2 | Protocol checkpoint | DRIVER_REPORTED | UNKNOWN |
| TC-3 | Stop/creep dispute | DRIVER_REPORTED | **NO** |
| TC-4 | Protocol checkpoint | DRIVER_REPORTED | UNKNOWN |
| TC-5 | Stationary / gap story | DRIVER_REPORTED + telemetry hints | Partial only |
| TC-6 | Protocol checkpoint | DRIVER_REPORTED | UNKNOWN |

## Critical ID reconciliation (VERIFIED)

- **In-repo road-matching / LDI-10D Tesla fixture** → trip **`358d0158-b2a9-47ed-af26-33926c5770b4`** (`TESLA_DIRECTION_AWARE_P1_REGRESSION.md`).  
- **EXP021 Oct 20 shadow campaign TRIP_1/TRIP_2** → **`11f5a645…` / `0f8d2f76…`** — **not** the same row as REF-001; do not merge IDs in evidence pins.

## Data gaps

Missing 1s bucket ≠ stop — **VERIFIED** (`EXP021_P21_R3`, S3A contract).
