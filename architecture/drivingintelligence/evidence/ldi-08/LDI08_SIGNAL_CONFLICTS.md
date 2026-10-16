# LDI08 — Signal conflicts & misalignment

**L3/OBD speed conflicts** (threshold: max(5 km/h, 25% of L3), same as LDI-03 temporal): **11**

## Missing intervals (no interpolation)

- Position absent buckets: **16**
- HF absent: **301**
- OBD absent: **301**

## Sample conflicts (first 15)

| Index UTC | L3 km/h | OBD km/h | Δ km/h |
|-----------|---------|----------|--------|
| 2026-10-13T15:53:16Z | 22.37654230622294 | 14 | 8.376542306222941 |
| 2026-10-13T15:53:27Z | 27.5564776088443 | 20 | 7.5564776088443 |
| 2026-10-13T15:53:28Z | 32.84738541658913 | 23 | 9.847385416589127 |
| 2026-10-13T15:54:09Z | 39.65706242433433 | 27 | 12.657062424334327 |
| 2026-10-13T15:54:38Z | 39.50603238492114 | 26 | 13.506032384921141 |
| 2026-10-13T15:54:39Z | 43.10578318538609 | 28 | 15.105783185386088 |
| 2026-10-13T15:58:31Z | 5.270347246750029 | 17 | 11.72965275324997 |
| 2026-10-13T15:58:41Z | 5.071339893754495 | 13 | 7.928660106245505 |
| 2026-10-13T15:58:44Z | 6.504482887068332 | 0 | 6.504482887068332 |
| 2026-10-13T15:58:47Z | 7.557942080878618 | 2 | 5.557942080878618 |
| 2026-10-13T15:58:52Z | 5.128721412495344 | 0 | 5.128721412495344 |

## Temporal notes

- R1 HF subset is sparse vs 1 Hz shadow grid (see `hfCadence` in temporal export).
- Native cornering timestamps may fall between HF/OBD numeric buckets.
- Clock offset analysis: NOT_COMPUTED (no independent UTC anchor).