# LDI-10D Phase 1 — Risks, license, privacy, Phase 2 proposal

## License and attribution

| Asset | Risk | Mitigation |
|-------|------|------------|
| **Mapbox** | ToS, token exposure, billing | Server-side token only; attribution on `MapboxMap`; do not embed token in LDI evidence |
| **OSM ODbL** | Derived DB share-alike if OSM data mixed into product DB | Keep road context in **evidence JSON** with attribution block; avoid silent merge into tenant tables in Phase 2 |
| **Overpass** | Fair-use / rate limits | One-time bbox fetch → freeze file; include `User-Agent`; no production hot path |

## Privacy

- Trip bbox (~1.7 km × 0.9 km) is re-identifiable with vehicle context — treat exports as **org-scoped forensic evidence**, not public CDN.
- Mapbox Matching sends coordinates to US vendor — **not required** for LDI Phase 2 minimum.

## Cost

- Mapbox: per-match request (trip enrich already pays this; LDI should avoid duplicate calls).
- OSM: free at Overpass; engineering cost is freeze + validation.

## Technical risks

| Risk | Severity | Note |
|------|----------|------|
| Confusing map-match with LDI GPS | High | LDI-10C explicitly raw GPS; keep separate feature types |
| Signal proximity → brake inference | High | Forbidden; document in schema |
| QC UNTRUSTED misread as GPS error | Medium | Phase 3 root cause: OBD/L3 conflict, not geometry jump |
| 16 ROW_ABSENT buckets | Medium | Association UNKNOWN on affected windows |
| Integer OBD quantization | Medium | Affects QC, not OSM layer |

## Smallest safe Phase 2 (recommended)

1. **Owner-approved one-shot Overpass export** for bbox `51.39999,9.65612,51.40793,9.67194` (+50 m padding metadata only):
   - nodes: `highway=traffic_signals`
   - ways: `highway=*` drivable + `maxspeed` where tagged
   - junction tags
2. Commit `LDI10D_OSM_FROZEN_EXPORT.json` + SHA-256 manifest referencing LDI08 snapshot hash.
3. Run **read-only** association script → `LDI10D_MANEUVER_ROAD_ASSOCIATION.json` (32 rows).
4. **No** Mapbox Matching, **no** QC threshold changes, **no** maneuver reclassification.
5. Manual review checklist for 8 UNCLEAR groups (OSM context cannot override Phase 3 findings).

## Phased options (larger)

| Phase | Scope |
|-------|--------|
| **2a (minimal)** | Frozen OSM + association JSON + MD report |
| **2b** | Add Mapbox archived match for same trip (comparison doc only) |
| **2c** | UI overlay in SynqDrive Code / evidence viewer (read-only) |

## Explicit unknowns

- Horizontal GPS accuracy per bucket (not in LDI08 export).
- Whether OSM signals in bbox are complete vs reality.
- Sub-second alignment between OBD integer speed and L3 within same 1 s bucket.
- Legal review of ODbL redistribution if evidence leaves repo.
- Production VPS egress policy for Overpass (confirm allowlist).

## Verification requirements (Phase 2 entry)

- [ ] LDI08 snapshot SHA unchanged
- [ ] 32 association rows, 75 candidate IDs traceable
- [ ] ≥1 row `UNKNOWN` documented with reason where applicable
- [ ] No edits to `LDI10C_*` or `LDI10B_*` classification fields
- [ ] Attribution block in OSM export file
