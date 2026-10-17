# LDI06 — R1 event-first trip selection

**Vehicle (only):** `8c850ff1-4201-432b-af2e-2711dbc7ca48` (Ruptela R1 / Arteon)
**Excluded:** `19fedd4b-c4e8-4de8-a125-dab293326e7e` (VW Tiguan) — not ranked

## Event inventory

- **Verified count:** 140 (LDI-05: 140; owner ~150 → **10** unaccounted without new provider call)
- **Accel / brake / corner:** 19 / 16 / 105

## Selected trip

- **tripId:** `a682d3df-545a-4a8a-aa14-d45c23fae985`
- **Native events:** 6 (accel 4, brake 1, corner 1)
- **Both accel+brake:** true
- **DI work item:** `none`
- **GPS-L3 trusted:** 0.0%
- **HF (rpm/throttle buckets):** 0.0%
- **OBD speed numeric:** 0.0%

## Fusion-capable alternate (pinned S4)

- **tripId:** `f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9`
- **DI work item:** `31820150-03b7-4019-8e3d-84c2b1d0b8a5`
- **Native events:** 2 (accel 0, brake 0)
- **GPS-L3 trusted:** 81.2%
- **Note:** No Arteon trip has both accel+brake natives **and** an S4 pin; use this trip for LDI-03 four-stream pin only.

## Candidate ranking

| Rank | Trip | Score | Accel | Brake | GPS-L3 trusted % |
|------|------|-------|-------|-------|------------------|
| 1 | `a682d3df…` | 45 | 4 | 1 | 0.0 |
| 2 | `0a8ef26c…` | 44 | 2 | 3 | 0.0 |
| 3 | `3ce45be6…` | 43 | 1 | 1 | 0.0 |
| 4 | `1215ac53…` | 42 | 1 | 1 | 0.0 |
| 5 | `f3e1fa83…` | 41 | 0 | 0 | 81.2 |
| 6 | `7b3fe123…` | 40 | 0 | 0 | 67.0 |
| 7 | `12bc216b…` | 39 | 0 | 0 | 49.1 |
| 8 | `074a1ae2…` | 38 | 0 | 0 | 0.0 |
| 9 | `2b3231d0…` | 37 | 1 | 0 | 0.0 |
| 10 | `2a410e21…` | 36 | 0 | 2 | 0.0 |