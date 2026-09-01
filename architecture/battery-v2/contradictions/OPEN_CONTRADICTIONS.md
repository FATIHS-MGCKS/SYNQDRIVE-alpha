# Battery V2 — Open Contradictions

When two sources disagree, create `BAT-V2-CONTRA-*` node and list here — **do not silently resolve**.

## BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001

| Field | Content |
|-------|---------|
| **Source / doctrine** | Provider/fetch receipt time is not automatically a new provider observation |
| **Current code** | `resolveLvBatteryObservedAt` falls back to `collectionLastSeenAt`; `persistFromObservationClassify` uses `lvBatteryObservedAt ?? receivedAt` where `receivedAt = providerFetchedAt ?? now`; `providerTimestamp` persisted; REST eval accepts any non-null `providerTimestamp` |
| **KNOWN (Phase 3)** | Multi-layer fallback **REACHABLE_AND_CONFLICTING** in current code |
| **UNKNOWN** | Production frequency; whether fallback rows pass REST quality gates in prod |
| **Impact** | Observation freshness / provenance / REST evidence eligibility |
| **Resolution status** | UNRESOLVED |
| **Related gap** | `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` |

Do **not** classify as confirmed production defect without production frequency evidence.

## BAT-V2-CONTRA-HEV-HV-AUTHORITY-001

| Field | Content |
|-------|---------|
| **Layer A — drive profile** | `isHvMeasurementSupported(HEV) = true` |
| **Layer B — ICE policy catalog** | HEV → ICE family: `forbiddenMeasurementTypes: HV_ALL_MEASUREMENT_TYPES` |
| **Layer C — materializePolicy** | `hvPipelineAllowed = true` for HEV — **no runtime consumer** (`BAT-V2-GAP-HV-PIPELINE-ALLOWED-DEAD-001`) |
| **Layer D — HV method profile** | Capability-driven independently |
| **Layer E — canonical read** | `isEv` excludes `HYBRID` → `canonical.hv=null` |
| **Layer F — ingest (Phase 3)** | HV jobs/snapshots **can run** without fuelType gate; measurements get `UNSUPPORTED_PROFILE`; orphan rows possible (`BAT-V2-GAP-HEV-SNAPSHOT-ORPHAN-001`) |
| **KNOWN (Phase 3)** | **PARTIALLY REACHABLE** — side-effect compute can occur but canonical read hides HV |
| **UNKNOWN** | Production HEV fleet mix; whether orphan snapshots exist in prod |
| **Impact** | HEV vehicles may accumulate HV data invisible to users |
| **Resolution status** | UNRESOLVED |
| **Related gaps** | `BAT-V2-GAP-HEV-IS-EV-001`, `BAT-V2-GAP-HEV-SNAPSHOT-ORPHAN-001`, `BAT-V2-GAP-HV-PIPELINE-ALLOWED-DEAD-001` |

Do **not** decide which layer is “correct” without a product decision.

## Template

```markdown
## BAT-V2-CONTRA-{slug}

| Source A | Claims |
| Source B | Claims |
| Impact | Which graph nodes affected |
| Resolution status | UNRESOLVED | UNDER_INVESTIGATION | ACCEPTED_AS_HISTORICAL |
```

## Known tension (not elevated to contradiction)

- Architecture memo states "publication=false, readiness=false" while production `backend.env` may set `BATTERY_V2_REST_SHADOW_ENABLED=true` — these are **different flags**, not a contradiction.
