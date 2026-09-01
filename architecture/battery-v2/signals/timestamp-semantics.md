# Battery V2 — Timestamp Semantics (Bootstrap)

**Reconstruction maturity:** PARTIAL  
**Epistemic status:** INFERRED (partially code-verified)

## Confirmed

| Timestamp | Authority | Usage |
|-----------|-----------|-------|
| `trip.endTime` | Authoritative trip finalization | LV REST anchor when known |
| Observation `observedAt` / `source_timestamp` | Per-signal observation time | REST window evidence eligibility |
| Target `scheduledFor` | Derived from anchor + delay (60m / 6h) | Metadata scheduling |

## Provenance rules (from architecture memos, partially code-verified)

- Rest-window anchor authority = `trip.endTime`, **not** `receivedAt` / `provider_fetched_at`
- Promotion uses observations where `source_timestamp >= anchor`; frozen pre-anchor observation → CANDIDATE without promotion

## LV live voltage ingestion (code-verified)

In `lv-live-voltage-ingestion.service.ts` → `persistFromObservationClassify`:

```
receivedAt = parseIso(ctx.providerFetchedAt) ?? new Date()
observedAt = parseIso(ctx.lvBatteryObservedAt) ?? receivedAt
providerTimestamp: observedAt  // persisted on BatteryMeasurement
```

In `buildRestTargetContext`:

```
observedAt = parseIso(ctx.lvBatteryObservedAt) ?? new Date()
```

**Tension:** A missing `lvBatteryObservedAt` can be replaced by fetch/receipt/current time and later appear in `providerTimestamp`. REST target evaluation requires `providerTimestamp` as evidence of a provider-timestamped observation.

See `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001` and `BAT-V2-GAP-TIMESTAMP-FALLBACK-001`.

Do **not** classify as confirmed production defect without production reachability proof.

## Unknown / needs reconstruction

- Whether fallback-created rows have entered REST evaluation in production
- Cross-signal age mixing policies beyond REST opening gate
- HV signal timestamp canonicalization
