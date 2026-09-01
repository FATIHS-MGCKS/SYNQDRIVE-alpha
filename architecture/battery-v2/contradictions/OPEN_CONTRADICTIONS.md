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
