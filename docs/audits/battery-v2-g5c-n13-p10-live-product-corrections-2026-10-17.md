# G5C-N13-P10 — First live product corrections (Master Admin LV measured intelligence)

Production baseline SHA: `41795fd9f1493fa624a73db07b22772034e3af6e` (read-only forensics). No C3 row recompute, no production deploy.

## Extreme C3 slopes (Ruptela)

| Slope (mV/h) | Feature row | Session | Valid pts | Span | End reason |
|--------------|-------------|---------|-----------|------|------------|
| −14170.9 | `335a4039-…` | `6fdd84f2-…` | 2 | 110 s | `CHARGING_DETECTED` |
| −23720.5 | `1fa371f1-…` | `5da3b937-…` | 2 | 73 s | `CHARGING_DETECTED` |

**Root cause:** C3 Theil-Sen over two `PARKED_REST_CANDIDATE` retention points with `actualRestAgeMs` deltas of 110 s / 73 s. Arithmetic matches stored inputs (e.g. −481 mV / 73 s ≈ −23720 mV/h). Not a timestamp inversion or C3 implementation bug. Scientifically unsuitable as a resting self-discharge trend: minimum-point pair, sub-hour span, charging-transition session end, duplicate nominal rung index on the −14170 case.

**N13 response:** Read-model `assessLvMeasuredC3SlopeQualityV1` labels `slopeInterpretability=CONTEXT_LIMITED` with explicit codes; UI shows numeric DERIVED slope plus limitation text (no historical row overwrite).

## Historical browsing

- Added optional `measuredFrom` / `measuredTo` (max 120-day span, tenant-scoped, dedup unchanged).
- `DATE_RANGE_ASC` mode for months of MEASURED points; `RECENT_DESC_LIMIT` preserved.
- Default Master Admin load uses 90-day UTC window @ 500 observation cap.

## Mobile UX

- REST episode cards (select session), observation span, valid-point counts, CONTEXT_LIMITED slope labeling, MEASURED vs DERIVED separation unchanged in boundary copy.
