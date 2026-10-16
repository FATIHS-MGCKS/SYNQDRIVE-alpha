# EXP021 — forensic supplement v1 (additive)

**Does not modify:** [`forensic-readonly-exports-2026-10-16/`](./forensic-readonly-exports-2026-10-16/) (`SHA256SUMS` verified unchanged)  
**Machine bundle:** [`forensic-readonly-exports-2026-10-16-supplement-v1/`](./forensic-readonly-exports-2026-10-16-supplement-v1/)  
**Regenerate:** `npm run exp021:ev-ground-truth:forensic-supplement-v1`

Epistemic labels: **CONFIRMED** | **INFERRED** | **UNKNOWN** (per finding).

---

## 1) Startgrenze / `dimo-seg-186946-1792121760000`

| Finding | Epistemic | Source |
|---------|-----------|--------|
| `vehicle_trips.dimo_segment_id` = `dimo-seg-186946-1792121760000` | CONFIRMED | Production `vehicle_trips` read-only |
| Epoch suffix `1792121760000` → `2026-10-16T03:36:00.000Z` | CONFIRMED | decode + matches `start_time` |
| ID format `dimo-seg-{tokenId}-{startMs}` | INFERRED | `DimoSegmentsService.buildSegmentId` (repo) |
| Segment chosen via `selectConfirmedStartSegment` + `resolveConfirmedStartBoundary` (DIMO preferred) | INFERRED | `start-boundary-window.util.ts`, `trip-detection-orchestration.service.ts` |
| `cusumSegmentStart` = `03:36:00Z` | CONFIRMED | `raw_detection_meta` |
| `lifecycleRecovery.startEpisode.candidateStartAt` = `03:38:26.989Z`, `effectiveStartAt` = `03:36:00Z` | CONFIRMED | `raw_detection_meta` |
| **candidateStartAt is physical departure or pure recognition delay** | **UNKNOWN** | No independent cross-sensor sync; do not interpret without evidence |
| Original DIMO GraphQL segment JSON at trip create | UNKNOWN | Not in pinned S4; no `dimo-seg-validate` row in `driving_evidence` |
| ClickHouse `trip_segment_candidates` row for window | UNKNOWN | `clickhouse-client` unavailable on VPS shell during export |

**Persisted vs conclusion:** Facts are DB fields; segment-to-provider linkage is code-path + ID encoding, not a stored payload copy.

Detail: [`DIMO_SEGMENT_TRACE_SUPPLEMENT_V1.json`](./forensic-readonly-exports-2026-10-16-supplement-v1/DIMO_SEGMENT_TRACE_SUPPLEMENT_V1.json)

---

## 2) Videoanker (Korrektur zu t=0-Formulierungen)

| Statement | Epistemic | Note |
|-----------|-----------|------|
| `03:37:41Z` = **first visible on-screen clock label** (Berlin 05:37:41) | CONFIRMED | External kompakt review |
| Owner: reverse maneuver at **start of video clip** = departure context | CONFIRMED | Owner + Bericht (qualitative) |
| **Exact first physical motion at video PTS=0** | **UNKNOWN** | Not calibrated; **do not** equate PTS=0 or first clock label with proven motion instant |

Addendum for frozen `Bericht.md` text (hash preserved): [`EXP021_VIDEO_ANCHOR_SEMANTICS_ADDENDUM.md`](./EXP021_VIDEO_ANCHOR_SEMANTICS_ADDENDUM.md)

JSON: [`VIDEO_ANCHOR_SEMANTICS_SUPPLEMENT_V1.json`](./forensic-readonly-exports-2026-10-16-supplement-v1/VIDEO_ANCHOR_SEMANTICS_SUPPLEMENT_V1.json)

---

## 3) ROW_ABSENT — 135 vs 125 Tacho-Nullsekunden

Annotation source: kompakt `analysis/results/comparison.json` (video review).

| Set | Seconds | Replay `ROW_ABSENT` | Replay `PRESENT` |
|-----|--------:|--------------------:|-----------------:|
| **ALL_135** (full annotated tacho zero) | 135 | 133 | 2 |
| **SUBSET_125** (five main halt windows only) | 125 | 124 | 1 |
| **EXTRA_10** (outside 125, e.g. start maneuver + end) | 10 | 9 | 1 |

**Earliest demonstrable layer for ROW_ABSENT (typical):** **S3A normalization grid** — pinned POSITION bucket with `EXPECTED_GRID_ROW_ABSENT` in `provenance.derivedFrom` (**CONFIRMED** in snapshot parse). This proves an explicit absent grid cell in **S4 pin**, not a provider outage.

**Not claimed:** DIMO provider sampling failure from replay `ROW_ABSENT` alone.

Chain: provider rows → S3A grid (`di-v0-position-normalizer.ts`) → S1 hold/release → S2 shadow → S4 pin → offline replay.

JSON (per-bucket S4 + S1/QC): [`ROW_ABSENT_CHAIN_SUPPLEMENT_V1.json`](./forensic-readonly-exports-2026-10-16-supplement-v1/ROW_ABSENT_CHAIN_SUPPLEMENT_V1.json)

---

## 4) Versionsprovenienz

| Field | Value | Role |
|-------|-------|------|
| `baselineExecutionSha` | `a0ce01f192d888974e49c2558ee05e534f3dfeea` | Frozen pre-deploy replay capture (**CONFIRMED** manifest) |
| `productionShaEnvReference` | env `EXP021_EV_GT_PRODUCTION_SHA` | Label only — **not** live runtime proof |
| `exporterGitHeadSha` | at export time | Exporter repo HEAD (**CONFIRMED**) |
| `exporterScriptContentSha256` | per-file hashes | Exporter scripts on disk at export |
| `observedRuntimeDeployedGitSha` | `c1013265bc10af7ac5fe7e86ff372772373acd36` | **CONFIRMED** read `backend.env` via SSH (≠ baseline) |
| Public health API git sha | — | **UNKNOWN** (not exposed) |

JSON: [`VERSION_PROVENANCE_SUPPLEMENT_V1.json`](./forensic-readonly-exports-2026-10-16-supplement-v1/VERSION_PROVENANCE_SUPPLEMENT_V1.json)

---

`PRODUCTION_MUTATIONS=NONE`, `PROVIDER_CALLS=NONE`, no boundary change, no tuning, no deploy.
