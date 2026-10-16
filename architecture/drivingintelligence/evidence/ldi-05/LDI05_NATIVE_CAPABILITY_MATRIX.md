# LDI05 — Native capability matrix

| Layer | Status on manifest pins | Evidence |
|-------|-------------------------|----------|
| Provider capability | **UNKNOWN** (no provider call in LDI-05) | Code + intake summary gate only |
| Ingestion capability | **IMPLEMENTED** | `LteR1BehaviorEnrichmentService` |
| Persisted availability | **960** TELEMETRY_EVENTS (3 vehicles) | DB read-only audit |
| Event–trip alignment | **FAIL windows empty** | Per-trip counts in JSON |
| Physical validation | **NONE** on these trips | No independent video/GT |

Implemented code ≠ data delivery.