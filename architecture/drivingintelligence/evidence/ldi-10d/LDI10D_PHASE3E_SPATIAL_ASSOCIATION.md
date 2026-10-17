# LDI-10D Phase 3E — Spatial association

## Frozen OSM

- SHA256: `8afff85539dad9d1590022656f291d50b01215d99cd4a9bcc4af2aef74c073d9` (unchanged)
- Live Mapbox / Overpass: **not called**
- OSM `traffic_signal` coverage in frozen extract: **0** → **NOT_MAPPED** (not a claim that no signals exist)

## Tesla EXP021 trip vs LDI-08 pin

| Pin | Trip | Role |
| --- | --- | --- |
| Tesla fixture | `358d0158-b2a9-47ed-af26-33926c5770b4` | Phase 3E temporal reconstruction (1136 s) |
| LDI-08 / Phase 3A–2B | `f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9` | 69 events, 32 maneuvers, 35 confirmed + 114 ambiguous junctions |

Tesla GPS latitudes (~51.24–51.34°N) lie **outside** the frozen OSM node envelope (~51.40–51.41°N).

**Policy:** no nearest-road snap; all Tesla contextual events carry `UNSUPPORTED_OUT_OF_FROZEN_BBOX`.
The 114 ambiguous topology candidates are **not** promoted to confirmed intersections.

## Junction research (reference pin only)

- Confirmed drivable junctions: **35**
- Ambiguous candidates: **114**