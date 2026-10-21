# Reference Drives — Catalog

## Series vs analysis segments

| Concept | Count | IDs |
|---------|------:|-----|
| **REFERENCE_DRIVE_SERIES_COUNT** | **4** | RD001, RD002, RD003, RD004 |
| **ANALYSIS_SEGMENT_COUNT** (RD004 only) | **2** | RD004-A, RD004-B |
| **RD004_SEGMENTS_ARE_DISTINCT_PHYSICAL_DRIVES** | **NO** — same session `f1e81e78-…`, one physical drive |

**REFERENCE_DRIVE_IDS:** RD001, RD002, RD003, RD004 (RD004-A/B = analysis segments, not separate drive series)

---

| Drive | Session | Vehicle | Video GT | Key finding | Evidence |
|-------|---------|---------|----------|-------------|----------|
| **RD001** | `06638509-…` | Tiguan `19fedd4b` | **NO** | Late arrival; 151s gap; no GT | DI-EV-0016–0019 |
| **RD002** | `e095d273-…` | KS MX 2024 C63 `a60c0749` | NOT_PLANNED | Sealed HF Δt P50 **13.489s**; AGGREGATE_BUCKET_V2 | DI-EV-0023–0026 |
| **RD003** | `0fa040aa-…` | Tiguan WOB L 7503 | 9 clips (partial) | HF median **~2.00s**; signal quality | DI-EV-0027–0034F |
| **RD004** | `f1e81e78-…` | KS MX 2024 | Seg A + B video | Alignment + late buckets | DI-EV-0035A.2–B.6 |

**RD004-A** — Segment A alignment methodology (video + HF, 38 samples preserved).  
**RD004-B** — Segment B HF recovery / exact-window replay (token `187336` context).  
Both segments share capture session `f1e81e78-f96b-44ee-80c2-ca5270f21248`.

**Example-only in docs:** KS MX token 187336 — **not** hardcoded in runtime (C.1b).

See `RD003_RETROSPECTIVE.md`, `RD004_RETROSPECTIVE.md`.
