# LV Timestamp Provenance — Resolution Dossier (Phase 4)

**Gaps:** `BAT-V2-GAP-TIMESTAMP-FALLBACK-001`, `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001`  
**Priority:** P1  
**Readiness:** DECISION_REQUIRED

## CURRENT STATE

`resolveLvBatteryObservedAt` may fall back to `collectionLastSeenAt`. Persist uses `lvBatteryObservedAt ?? receivedAt` where `receivedAt = providerFetchedAt ?? now`. REST evaluation accepts any non-null `providerTimestamp` without provenance class.

## TARGET SEMANTICS TABLE (PROPOSED)

| Provenance class | Source | LIVE display | REST opening | REST measurement | Assessment | Publication | Notes |
|------------------|--------|--------------|--------------|------------------|------------|-------------|-------|
| `SIGNAL_OBSERVED_AT` | DIMO signal timestamp | ✓ | ✓ | ✓ | ✓ | ✓ if gates pass | Gold standard |
| `COLLECTION_LAST_SEEN` | Mapper fallback | ✓ (stale label) | ✓ cautious | **✗ or PROVISIONAL only** | ✗ or down-tier | ✗ | Diagnostic bias risk |
| `PROVIDER_FETCHED_AT` | Ingest receipt | ✓ | ✗ | ✗ | ✗ | ✗ | Fetch time ≠ observation |
| `RECEIVED_AT_FALLBACK` | `new Date()` at persist | ✓ | ✗ | ✗ | ✗ | ✗ | Must never REST-eligible |

## OPTIONS

| Option | Description | Migration | Verdict |
|--------|-------------|-----------|---------|
| **A** Provenance enum on measurement + evidence | Explicit column `timestampProvenance` | Prisma migration | **RECOMMENDED** |
| **B** Separate `observedAt` / `fetchedAt` only | No enum | Medium | Partial |
| **C** REST policy rejects non-SIGNAL | No schema change | Low | Insufficient alone |
| **D** A + C | Schema + policy | Medium | **RECOMMENDED bundle** |

## RECOMMENDED OPTION

**Option D:** Add `timestampProvenance` enum to `BatteryMeasurement` / evidence rows. REST eligibility requires `SIGNAL_OBSERVED_AT` or documented exceptions. `COLLECTION_LAST_SEEN` remains LIVE-visible but REST-ineligible. `RECEIVED_AT_FALLBACK` diagnostic-only.

## REJECTED

- Accept all fallbacks for REST (status quo) — contradicts measurement doctrine

## IMPLEMENTATION SURFACE

`dimo-battery-signal.mapper.ts`, `lv-live-voltage-ingestion.service.ts`, `battery-rest-target-evaluation.ts`, Prisma schema.

## VALIDATION

- Unit matrix per provenance class
- Read-only prod query: % measurements by provenance (when deployed)

## ROLLBACK

Feature flag `BATTERY_V2_TIMESTAMP_PROVENANCE_STRICT` default OFF → gradual.

## GRAPH IDS

Contradiction remains until runtime + prod frequency known.
