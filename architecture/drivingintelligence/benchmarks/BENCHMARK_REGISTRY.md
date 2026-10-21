# Benchmark Registry

Epistemic tiers for GT: **MEASURED** | **INDEPENDENTLY_VALIDATED** | **DRIVER_REPORTED** | **PROXY_ONLY** | **SIMULATED** | **NOT_VERIFIED**

Repro status: **REPO_PINNED** | **REPO_PARTIAL** | **NOT_IN_REPO** | **NOT_REPRODUCIBLE** (missing pin)

---

## BMK-TESLA-LDI10D-20261016

| Field | Value |
|-------|-------|
| **PHYS_ID** | `PHYS-TESLA-20261016` |
| **Vehicle** | Tesla Model 3, `68868291-5478-42cd-b0c4-cc77b2a78e21`, DIMO token **186946**, `API_SYNTHETIC` |
| **tripId** | `358d0158-b2a9-47ed-af26-33926c5770b4` |
| **UTC** | Grid starts `2026-10-16T03:36:00Z`; **1136** × 1 s buckets |
| **Sources** | S4 POSITION snapshot; 1 Hz grid; L3 pinned in grid; **no R1 grid** on fixture |
| **Artifacts (repo)** | `evidence/ldi-10d/fixtures/tesla-20261016/TESLA_POSITION_GRID.json` sha256 `5e198ee9…`; `VIDEO_TACHO_REFERENCE.json` sha256 `4fa007f9…`; snapshot `DI_V0_S4_EVIDENCE_V1:sha256:c703e9c4…` |
| **Video / tacho** | `VIDEO_TACHO_REFERENCE.json` — **PROXY_ONLY**; 749 bucket pairs with both tacho+L3 in file (recomputed MAE ~2.38 km/h on repo — **≠** cited 123-point study) |
| **123-point L3 MAE 3.13** | Cited in `EXP021_P21_R3` as **earlier** calibration — **primary rows NOT located on main**; treat as **NOT_VERIFIED** until pin restored |
| **GT** | Road ID: **none**; Speed: **PROXY_ONLY** (tacho witness) |
| **Suites** | SPEED (partial), ROAD_MATCHING, ROUTING, GAP (ROW_ABSENT), CAUSALITY (batch L3) |
| **Algorithms** | Baseline V2, Viterbi forward V2, direction-aware P1 regression, geometry V1→V2 diff |
| **Failure modes** | FM-021 (ID conflation with Oct-20), service roads, geometry V1 legacy |
| **Repro** | `npm run test:di:s4-research`; `ldi10d:phase3c2-tesla-seven-algorithm-replay` — **REPO_PINNED** |
| **Gaps** | `PROVENANCE_MANIFEST` → `exp021-ev-ground-truth/pre-deploy/…` **missing on main** |

---

## BMK-TESLA-EXP021-20261020-TRIP1

| Field | Value |
|-------|-------|
| **PHYS_ID** | `PHYS-TESLA-20261020-A` |
| **tripId** | `11f5a645-752e-4b8a-b20a-9f1fc3a6673e` |
| **UTC** | **2026-10-20** (campaign); exact window **NOT_IN_REPO** @ dossier SHA |
| **Sources** | S4 shadow JSONL, POSITION grid (reported), driver video |
| **TC-1 … TC-6** | **DRIVER_REPORTED** anchors — not independent GT |
| **Phases** | B1–B7.4 (B3 maps, B5 TC-3, B6/B6.1 branch-only, B7.1–B7.4 cloud) |
| **Artifacts** | `/opt/cursor/artifacts/exp021-tesla-b*` — **NOT_IN_REPO**; PR #2051 branch docs **REPORTED** |
| **Shadow pin** | REPORTED sha256 prefix `048383f6…` (B7.2/B7.4) |
| **Suites** | STOP_GO, CAUSALITY, GAP |
| **Repro** | **NOT_REPRODUCIBLE** without exporting pins to evidence |

---

## BMK-TESLA-EXP021-20261020-TRIP2

| Field | Value |
|-------|-------|
| **PHYS_ID** | `PHYS-TESLA-20261020-B` |
| **tripId** | `0f8d2f76-9b09-4aba-8c56-fa7e2ce1c5a8` |
| **Artifacts** | B3 human-review maps — **NOT_ON_MAIN** |
| **Suites** | STOP_GO (qualitative), ROAD_MATCHING (if shadow exported) |
| **Repro** | **NOT_IN_REPO** |

---

## BMK-TIGUAN-NAV-20261019

| Field | Value |
|-------|-------|
| **PHYS_ID** | `PHYS-TIGUAN-20261019` |
| **Vehicle** | VW Tiguan WOB L 7503, `19fedd4b-c4e8-4de8-a125-dab293326e7e`, token **192922** |
| **tripId** | `632dc9c5-a8d9-45ce-a269-abe89d22d677` |
| **UTC** | Trip `2026-10-19T10:15:00Z` – `10:39:39.603Z`; video core **10:29:19 – 10:38:24Z** |
| **“Five videos”** | Evidence text refers to **five S4 decoder variants A–E**, not five separate MP4 commits in git. Navigation **video reference** = compact package **NOT_IN_REPO**: `/opt/cursor/artifacts/exp021-tiguan-validation/compact/` |
| **Repo pins** | `TIGUAN_POSITION_GRID.json` sha256 `3a253b97…`; OSM `c141ec2f…`; snapshot `DI_V0_S4_EVIDENCE_V1:sha256:b14c6bba…`; replay A–E under `replay/` |
| **GT** | Video way reference — **PROXY_ONLY**; **NOT_VERIFIED** as independent road GT |
| **Suites** | ROAD_MATCHING, ROUTING (R4.1), SPEED (secondary) |
| **Algorithms** | A–E per `TIGUAN_VALIDATION_REPORT.md` @ commit `9f0693bef572a065e45f5dad91ef236ba4f2ccd9` |
| **Repro** | `evidence/exp021-tiguan-20261019/RUNBOOK.md` — **REPO_PARTIAL** (compact video external) |

---

## BMK-P21-R3-AUDI-20261014

| Field | Value |
|-------|-------|
| **PHYS_ID** | `PHYS-AUDI-20261014` |
| **Vehicle** | Audi A4 KS MS 661 `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| **tripId** | `d0af9cc7-ce0d-4e40-9854-2c1341e83bed` |
| **Intervals** | **1480** × 1 s (**MEASURED** in forensic doc) |
| **UTC** | `2026-10-14T05:37:00Z` – `06:01:40Z` |
| **Snapshot** | `DI_V0_S4_EVIDENCE_V1:sha256:06d5c1200e494bb8432c164c77cb90898a19c4b21a3ab72e54c4926a2fb1bed7` |
| **GT** | **NONE** — QC semantics / taxonomy only |
| **Suites** | SPEED (QC coverage), GAP, CAUSALITY (batch vs stationary contract) |
| **Metrics** | 763 `NO_NUMERIC`, 26 `CROSS_SOURCE_CONFLICT` — **MEASURED** |
| **Repro** | `backend/scripts/ops/exp021-p21-r3-forensic.ts` (read-only DB) — needs prod snapshot export for offline-only |

---

## BMK-TACHO-123-LEGACY

| Field | Value |
|-------|-------|
| **PHYS_ID** | **UNKNOWN** — not tied to a pinned trip on main |
| **Claim** | 123 points, MAE 3.13, P95 8.41, max 15, bias −2.10 km/h |
| **Source** | `EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md` (references **earlier** L3 vs tacho path) |
| **GT tier** | **PROXY_ONLY** if valid; **NOT_VERIFIED** on main (no CSV/JSON pin found) |
| **Suites** | SPEED_BENCHMARK (historical) |
| **Action** | Restore pin from #2051 branch or archive — do not treat as Tesla 358d0158 or P2.1 trip |

---

## Historical RD / KS benchmarks (summary)

| BMK_ID | PHYS_ID | Primary suite | GT | Repro |
|--------|---------|---------------|-----|-------|
| `BMK-RD001` | PHYS-RD001 | GAP_RECOVERY | NOT_VERIFIED | Reports in `reference-capture/` |
| `BMK-RD002` | PHYS-RD002 | GAP_RECOVERY | MEASURED Δt | Sealed export |
| `BMK-RD003` | PHYS-RD003 | SPEED (in-sample MAE) | PROXY_ONLY | Video partial |
| `BMK-RD004` | PHYS-RD004 | GAP_RECOVERY | PROXY_ONLY | Late bucket replay JSON |
| `BMK-KS-MX-CAL` | PHYS-KS-MX-EXP021-CAL | GAP_RECOVERY | PROXY_ONLY video | Session logs |
| `BMK-KS-MS661-UBV2` | PHYS-KS-MS661-UBV2 | GAP_RECOVERY | MEASURED cadence | Forensic freeze |
| `BMK-GOLDEN-C1-R1-002` | PHYS-GOLDEN-C1-R1-002 | SPEED, STOP_GO | SIMULATED | Unit tests |

---

## C0 / C1 / S3B (non-trip)

| Package | Type | Notes |
|---------|------|-------|
| R1 temporal containment C0.3 | Policy audit | No drive — **VERIFIED** code containment |
| S3A C1D.7 golden | **SIMULATED** window | FULL-R1-002 coordinates |
| S3B R1 OBD V0_3 | Channel contract | INTERVAL_ONLY — not a benchmark drive |

See [benchmark_manifest.v1.json](./benchmark_manifest.v1.json) for machine IDs and hashes.
