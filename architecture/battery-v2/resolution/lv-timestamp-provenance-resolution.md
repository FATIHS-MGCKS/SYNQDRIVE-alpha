# LV Timestamp Provenance — Resolution Dossier (Phase 4)

**Gaps:** `BAT-V2-GAP-TIMESTAMP-FALLBACK-001`, `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001`  
**Priority:** P1  
**Readiness:** DECISION_REQUIRED

## CURRENT STATE

`resolveLvBatteryObservedAt` may fall back to `collectionLastSeenAt`. Persist uses `lvBatteryObservedAt ?? receivedAt` where `receivedAt = providerFetchedAt ?? now`. REST evaluation accepts any non-null `providerTimestamp` without provenance class.

**No provenance enum is persisted today.** Current production rows cannot be grouped by `SIGNAL_OBSERVED_AT` / `COLLECTION_LAST_SEEN` / `PROVIDER_FETCHED_AT` / `RECEIVED_AT_FALLBACK` without inference heuristics — see observability section.

## REST OPENING vs MEASUREMENT (do not regress #1383)

Primary canonical LV REST session opening is **observation-independent**:

```
finalized authoritative trip → trip.endTime anchor → session open
```

Signal timestamp provenance **MUST NOT** gate this primary path.

| Path | Timestamp provenance role |
|------|---------------------------|
| **A — PRIMARY trip-finalization REST session open** | **NOT APPLICABLE** |
| **B — Observation-driven BRIDGE fallback** | Separate reachability semantics (±120s); not primary opening |
| **C — REST measurement qualification** | Provenance **materially relevant** |

## TARGET SEMANTICS TABLE (PROPOSED)

Focus: LIVE display, REST **measurement** eligibility, assessment eligibility, publication eligibility, diagnostic use.

| Provenance class | Source | LIVE display | REST session open (primary) | REST measurement | Assessment | Publication | Diagnostic |
|------------------|--------|--------------|----------------------------|------------------|------------|-------------|------------|
| `SIGNAL_OBSERVED_AT` | DIMO signal timestamp | ✓ | N/A (trip anchor) | ✓ | ✓ | ✓ if gates pass | ✓ |
| `COLLECTION_LAST_SEEN` | Mapper fallback | ✓ (stale label) | N/A | **✗ or PROVISIONAL only** | ✗ or down-tier | ✗ | ✓ |
| `PROVIDER_FETCHED_AT` | Ingest receipt | ✓ | N/A | ✗ | ✗ | ✗ | ✓ |
| `RECEIVED_AT_FALLBACK` | `new Date()` at persist | ✓ | N/A | ✗ | ✗ | ✗ | ✓ |

## SCHEMA SCOPE (trace required — do not blanket all carriers)

| Carrier | Provenance column needed? | Rationale |
|---------|---------------------------|-----------|
| `BatteryMeasurement` | **YES (recommended)** | REST measurement qualification + assessment input |
| `BatteryEvidence` rows | **EVALUATE per type** — not automatic | Many evidence types carry own timestamps; duplicate enum may be redundant |
| `VehicleLatestState` | **NO for opening** | Live display freshness separate from REST session anchor |
| Snapshot / ingest context | **Context JSON only** until schema | Diagnostic reconstruction, not decision gate for opening |

Recommend schema changes **only where LV REST measurement decisions consume timestamp authority**.

## CURRENT HISTORICAL PROVENANCE OBSERVABILITY

**CURRENT HISTORICAL PROVENANCE DISTRIBUTION IS NOT DIRECTLY OBSERVABLE.**

Persisted fields today: `observedAt`, `providerTimestamp`, `receivedAt`, JSON `provenance` blobs — but **no** `timestampProvenance` enum. Exact reconstruction would require heuristic inference (e.g. `observedAt === providerTimestamp` ⇒ likely signal; `receivedAt` near ingest ⇒ likely fetch/fallback) with **unbounded error**.

A future post-PKG-03 read-only query may measure distribution **after** provenance is persisted. Do not promise current SQL can answer provenance mix.

## OPTIONS

| Option | Description | Migration | Verdict |
|--------|-------------|-----------|---------|
| **A** Provenance enum on `BatteryMeasurement` | Explicit column `timestampProvenance` | Prisma migration | **RECOMMENDED** |
| **B** Separate `observedAt` / `fetchedAt` only | No enum | Medium | Partial |
| **C** REST policy rejects non-SIGNAL for **measurement** | No schema change | Low | Insufficient alone |
| **D** A + C | Schema + measurement policy | Medium | **RECOMMENDED bundle** |

## RECOMMENDED OPTION

**Option D:** Add `timestampProvenance` to `BatteryMeasurement` (not automatically all evidence rows). REST **measurement** eligibility requires `SIGNAL_OBSERVED_AT` or documented exceptions. Primary trip-finalization session opening unchanged.

## REJECTED

- Signal-timestamp gate on canonical trip-based REST session opening — regresses #1383
- Accept all fallbacks for REST measurement (status quo) — contradicts measurement doctrine
- Current SQL provenance distribution query — schema cannot support exact answer

## IMPLEMENTATION SURFACE

`dimo-battery-signal.mapper.ts`, `lv-live-voltage-ingestion.service.ts`, `battery-rest-target-evaluation.ts`, Prisma `BatteryMeasurement` schema.

## VALIDATION

- Unit matrix per provenance class (measurement path only)
- Post-PKG-03: read-only prod query on persisted enum

## ROLLBACK

Feature flag `BATTERY_V2_TIMESTAMP_PROVENANCE_STRICT` default OFF → gradual.

## GRAPH IDS

Contradiction remains until runtime + prod frequency known (post-schema).
