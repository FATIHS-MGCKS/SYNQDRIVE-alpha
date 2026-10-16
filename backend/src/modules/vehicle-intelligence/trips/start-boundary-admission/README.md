# Trip Start Boundary Admission (P1A — offline)

Pure resolver + shadow comparison for evidence-backed live start boundaries.

**Not production-wired.** `TripDetectionOrchestrationService.resolveConfirmedStartBoundary` is unchanged in P1A.

## Regression matrix (unit tests)

| Case | Description | Expected |
|------|-------------|----------|
| A | Tesla reference — early DIMO segment, sparse SOFTWARE_INTEGRATION prefix | `PROVIDER_START_UNCORROBORATED` |
| B | Early segment + core movement at provider time | `PROVIDER_START_ADMITTED` |
| C | Slow reverse (2 km/h) | `PROVIDER_START_BOUNDED` at creep time |
| D | Odometer progress without GPS speed | Early bounded start preserved |
| E | High-frequency zero-speed samples | No provider admission |
| F | Movement before delayed FSM candidate | Early movement preserved |
| G | HARDWARE vs SOFTWARE segment distance rules | Hardware may admit; Tesla software may not |

## Shadow

`compareStartBoundaryAdmissionShadow` returns `legacyCanonicalStartAt`, `proposedCanonicalStartAt`, `deltaMs`, `decision`, and provenance fields for offline diffing.
