# DIMO Integration — Knowledge Graph

Machine-readable: [`graph/`](graph/)

## Webhook → Trip wake (R9 cross-module)

```
POST /webhooks/dimo
  → verification / payload normalize (DIMO)
  → speed | isIgnitionOn
  → SnapshotWakeIntakeService.handleProviderWake() (Trip Detection)
  → wakeOutcome in HTTP response (DIMO contract surface)
```

## Production provider state (active R9 cohort)

| Metric | Value |
|--------|------:|
| Runtime deployed | **YES** @ `0ba96e03…` |
| Speed trigger stableId | `9eeb7158afee` |
| Ignition trigger stableId | `5d611d470eab` |
| subscribed_speed / ignition / both | **5 / 5 / 5** |
| tokenId 190497 | **EXCLUDED** (`FORMER_FLEET_VEHICLE`) |
| Natural wake observed | **NO** |

## Decision

| ID | Title | STATUS |
|----|-------|--------|
| DIM-R9-001 | Provider webhook → Trip Detection wake delegation | **VALIDATED** — runtime **deployed** on Production; provider wiring **validated** (5/5); natural end-to-end wake **not PRODUCTION_VALIDATED** |

## Neighbor

[Trip Detection & Lifecycle R9 wake](../trip-detection-lifecycle/KNOWLEDGE_GRAPH.md)
