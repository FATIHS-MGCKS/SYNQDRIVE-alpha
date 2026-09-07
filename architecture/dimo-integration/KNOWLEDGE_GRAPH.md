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

## Decision

| ID | Title | STATUS |
|----|-------|--------|
| DIM-R9-001 | Provider webhook → Trip Detection wake delegation | VALIDATED (repo/tests; NOT_ON_PRODUCTION) |

## Neighbor

[Trip Detection & Lifecycle R9 wake](../trip-detection-lifecycle/KNOWLEDGE_GRAPH.md)
