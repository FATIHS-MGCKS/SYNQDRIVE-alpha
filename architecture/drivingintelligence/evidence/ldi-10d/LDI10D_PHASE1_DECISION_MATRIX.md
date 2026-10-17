# LDI-10D Phase 1 — Mapbox vs OSM decision matrix

**Scope:** Road context for LDI maneuver forensics on pinned trip `f3e1fa83…` — **not** fleet trip enrichment replacement.

| Criterion | Mapbox Matching API | OSM (Overpass / extract) |
|-----------|---------------------|---------------------------|
| **Purpose fit** | Snap GPS to driving graph; speed limit annotations | Intersections, signals, topology, tagged `maxspeed` |
| **Existing in SynqDrive** | **Yes** — trip enrich (`mapbox.service.ts`) | **Prototype only** — EXP021 Overpass helper |
| **LDI-08 pin binding** | **Not used** | **Not frozen** |
| **Ground truth** | **No** — vendor graph + interpolation | **No** — community map completeness varies |
| **Licensing** | Mapbox ToS; token billing; attribution required on maps | ODbL — attribution + share-alike for derived DB; Overpass use policy |
| **Privacy** | Sends trace coordinates to Mapbox | Overpass query exposes bbox (no PII if trip anonymized) |
| **Cost** | Per-request; 100-point chunk limits; retry on 429 | Public Overpass rate limits; self-host optional |
| **Caching** | Trip artifacts in DB (`route-artifact`); not in LDI evidence | **Recommended:** commit frozen JSON + query hash + `data_version` |
| **Offline reproducibility** | Poor unless responses archived | **Good** if extract frozen in repo |
| **Signal / intersection** | Indirect via road class | Direct `highway=traffic_signals`, `junction=*` |
| **QC interaction risk** | High — must not override LDI UNTRUSTED/CONFLICTED | Low — parallel context layer |

**Recommendation for LDI road context:** **OSM-first frozen evidence export** for Phase 2; treat Mapbox matching as **optional secondary** experiment with archived API responses, never as maneuver QC ground truth.
