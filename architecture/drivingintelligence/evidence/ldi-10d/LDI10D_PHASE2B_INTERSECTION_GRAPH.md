# LDI-10D Phase 2B — Drivable intersection graph

Built from **frozen** highway ways only. Pedestrian `highway=crossing` nodes excluded from drivable junction counts.

## Summary
- Highway ways in extract: **155**
- Turn restriction relations: **3**
- Drivable junction candidates (graph-derived): **149**
- **Confirmed** topology junctions: **35**
- **Ambiguous** (incl. grade/layer): **114**
- **Signalized intersections (OSM-mapped):** **0** — means **NOT MAPPED** in OSM extract, not proof of absence in reality

## Confirmed junctions (sample ≤25 by way degree)

| Node | Lat | Lon | Ways | Highways | Evidence |
| --- | --- | --- | --- | --- | --- |
| 2179921460 | 51.400393 | 9.656354 | 4 | tertiary,residential | node 2179921460: 4 ways; degree>=3 |
| 2180087735 | 51.404610 | 9.662735 | 4 | residential | node 2180087735: 4 ways; degree>=3 |
| 254978293 | 51.406478 | 9.662762 | 4 | residential,tertiary | node 254978293: 4 ways; degree>=3 |
| 2187843595 | 51.406344 | 9.664437 | 4 | tertiary,service | node 2187843595: 4 ways; degree>=3 |
| 254978367 | 51.404474 | 9.672027 | 3 | tertiary | node 254978367: 3 ways; degree>=3 |
| 2036156082 | 51.404202 | 9.672678 | 3 | tertiary,tertiary_link | node 2036156082: 3 ways; degree>=3 |
| 1836774044 | 51.403893 | 9.671798 | 3 | tertiary,residential | node 1836774044: 3 ways; degree>=3 |
| 611857126 | 51.399994 | 9.659942 | 3 | tertiary,living_street,residential | node 611857126: 3 ways; degree>=3 |
| 2179921331 | 51.399843 | 9.655696 | 3 | residential | node 2179921331: 3 ways; degree>=3 |
| 745712770 | 51.400879 | 9.656101 | 3 | tertiary,service | node 745712770: 3 ways; degree>=3 |
| 416362272 | 51.404170 | 9.662722 | 3 | residential,service | node 416362272: 3 ways; degree>=3 |
| 1363025497 | 51.403057 | 9.662538 | 3 | residential,service | node 1363025497: 3 ways; degree>=3 |
| 610349996 | 51.403604 | 9.659458 | 3 | residential | node 610349996: 3 ways; degree>=3 |
| 610349997 | 51.404526 | 9.657945 | 3 | residential | node 610349997: 3 ways; degree>=3 |
| 610470329 | 51.402104 | 9.656387 | 3 | residential | node 610470329: 3 ways; degree>=3 |
| 610470339 | 51.401650 | 9.658344 | 3 | service | node 610470339: 3 ways; degree>=3 |
| 613575511 | 51.405497 | 9.664815 | 3 | residential | node 613575511: 3 ways; degree>=3 |
| 613112097 | 51.399343 | 9.655453 | 3 | residential | node 613112097: 3 ways; degree>=3 |
| 610470334 | 51.401479 | 9.657377 | 3 | residential,service | node 610470334: 3 ways; degree>=3 |
| 1503142249 | 51.408081 | 9.657378 | 3 | residential | node 1503142249: 3 ways; degree>=3 |
| 610322170 | 51.405819 | 9.658540 | 3 | residential | node 610322170: 3 ways; degree>=3 |
| 613112100 | 51.399334 | 9.655760 | 3 | residential | node 613112100: 3 ways; degree>=3 |
| 620992938 | 51.404181 | 9.672725 | 3 | residential,tertiary | node 620992938: 3 ways; degree>=3 |
| 5607540141 | 51.405898 | 9.667773 | 3 | tertiary,residential | node 5607540141: 3 ways; degree>=3 |
| 2036156066 | 51.403993 | 9.671818 | 3 | tertiary_link,tertiary | node 2036156066: 3 ways; degree>=3 |

## Pedestrian crossings (not counted as drivable intersections)

**8** isolated crossing nodes in OSM extract — zebra/marked crossings, not signalized junctions.