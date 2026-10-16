# LDI06 — Four-stream fusion readiness

**Selected:** `a682d3df-545a-4a8a-aa14-d45c23fae985`

| Stream | Status |
|--------|--------|
| GPS-L3/QC | 0.0% trusted |
| HF 1 Hz subset | 0.0% buckets with rpm/throttle |
| OBD speed | 0.0% numeric |
| Native DrivingEvent | 6 on trip |

**Four-stream snapshot reproducible:** NO — missing stream or DI pin


## Fusion-capable alternate (pinned S4 only)

Among **3** trips with COMPLETED S4 pins on this vehicle, lexicographic rank picks:
- **tripId:** `f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9`
- **Native:** 2 (accel 0, brake 0)
- **GPS-L3 trusted:** 81.2%
- **Work item:** `31820150-03b7-4019-8e3d-84c2b1d0b8a5`

**Limitations:** Native events are provider-reported (DIMO `TELEMETRY_EVENTS`); no trip on this vehicle has both accel+brake native events **and** an S4 pin. LDI-03 combined export not re-run in LDI-06. Tiguan excluded by mandate.