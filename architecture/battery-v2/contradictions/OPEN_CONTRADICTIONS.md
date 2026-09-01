# Battery V2 — Open Contradictions

When two sources disagree, create `BAT-V2-CONTRA-*` node and list here — **do not silently resolve**.

## BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001

| Field | Content |
|-------|---------|
| **Source / doctrine** | Provider/fetch receipt time is not automatically a new provider observation |
| **Current code** | `persistFromObservationClassify`: `receivedAt = providerFetchedAt ?? now`; `observedAt = lvBatteryObservedAt ?? receivedAt`; `providerTimestamp: observedAt`. `buildRestTargetContext`: separate `observedAt = lvBatteryObservedAt ?? new Date()` fallback |
| **KNOWN** | Fallback implementation exists in `lv-live-voltage-ingestion.service.ts` |
| **UNKNOWN** | Whether `lvBatteryObservedAt` is absent on reachable production classify payloads; whether fallback-created rows have entered REST evaluation |
| **Impact** | Observation freshness / provenance / REST evidence eligibility |
| **Resolution status** | UNRESOLVED |
| **Related gap** | `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` |

Do **not** classify as confirmed production defect without production reachability proof.

## BAT-V2-CONTRA-HEV-HV-AUTHORITY-001

| Field | Content |
|-------|---------|
| **Layer A — drive profile** | `isHvMeasurementSupported(HEV) = true` |
| **Layer B — ICE policy catalog** | HEV resolves to ICE family: `forbiddenMeasurementTypes: HV_ALL_MEASUREMENT_TYPES`, `definition.hvPipelineAllowed: false` |
| **Layer C — materializePolicy** | `hvPipelineAllowed = definition.hvPipelineAllowed \|\| isHvMeasurementSupported(HEV)` → **true for HEV** |
| **Layer D — HV method profile** | Capability-driven independently |
| **Layer E — canonical read** | `isEv` only `ELECTRIC` / `PLUGIN_HYBRID` — **`HYBRID` excluded** |
| **KNOWN** | All five layers coexist in current code |
| **UNKNOWN** | Production impact; which layer should govern HEV HV eligibility |
| **Impact** | HEV vehicles may have `hvPipelineAllowed=true` while HV measurement types remain forbidden and canonical read treats them as non-EV |
| **Resolution status** | UNRESOLVED |
| **Related gap** | `BAT-V2-GAP-HEV-IS-EV-001` (narrower isEv question) |

Do **not** decide which layer is “correct” without a product decision. Do **not** change runtime code in documentation-only passes.

## Template

```markdown
## BAT-V2-CONTRA-{slug}

| Source A | Claims |
| Source B | Claims |
| Impact | Which graph nodes affected |
| Resolution status | UNRESOLVED | UNDER_INVESTIGATION | ACCEPTED_AS_HISTORICAL |
```

## Known tension (not elevated to contradiction)

- Architecture memo states "publication=false, readiness=false" while production `backend.env` may set `BATTERY_V2_REST_SHADOW_ENABLED=true` — these are **different flags**, not a contradiction. Verify environment evidence separately.
