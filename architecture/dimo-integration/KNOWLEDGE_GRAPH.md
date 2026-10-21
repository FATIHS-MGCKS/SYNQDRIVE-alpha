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

## Production provider state (current read @ TDL-OQ-009 / `8a1d9c658…`)

| Metric | Value |
|--------|------:|
| R9 runtime on Production | **YES** (ancestor of `4bef6046…`) |
| Speed trigger stableId | `9eeb7158afee` |
| Ignition trigger stableId | `5d611d470eab` |
| **`R9_PROVIDER_AUTHORIZED_COHORT`** | **5** |
| `R9_SUBSCRIBED_SPEED` / ignition / both | **5 / 5 / 5** (`R9_AUTHORIZED_COHORT_COVERAGE=100%`) |
| **`SCHEDULER_ELIGIBLE_DB_ROWS` (SynqDrive)** | **6** — includes **1** stale **`HISTORICALLY_EXCLUDED_FORMER_FLEET_ASSET`** mirror (DIM-GAP-005) |
| Natural R9 **start** wake | **PRODUCTION_OBSERVED / PARTIALLY_VALIDATED** (KS MS 661 @ R10/R11 releases) |
| Fleet-wide operational wake-rate KPI | **UNKNOWN** (metrics scrape insufficient @ OQ-009) |

Historical five-vehicle canary @ 2026-09-07: **HISTORICAL_CORRECT** (authorized cohort **5**).

## Decision

| ID | Title | STATUS |
|----|-------|--------|
| DIM-R9-001 | Provider webhook → Trip Detection wake delegation | **VALIDATED** — runtime on Production; **R9 authorized cohort 5/5** subscribed; natural R9 **start** wake **observed** (partial — end/in-trip + KPI gaps remain) |

## Neighbor

[Trip Detection & Lifecycle R9 wake](../trip-detection-lifecycle/KNOWLEDGE_GRAPH.md)
