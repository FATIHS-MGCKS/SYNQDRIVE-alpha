# Tire Wear V3 — Production Cutover P2 (customer read)

## Scope

P2 wires **Tire Wear V3 Prior** (`TireWearV3PriorService.computeForSetup`) into existing Tire Health consumers as a **versioned** customer read model. V2 wear projection and `TireHealthSnapshot` recalculation remain available for rollback.

## Flags (safe defaults OFF)

| Env | Default | Effect |
|-----|---------|--------|
| `TIRE_WEAR_V3_CUSTOMER_READ_ENABLED` | `false` | Attach `wearV3` on summary/detail/wear-analysis; merge V3 verification alerts |
| `TIRE_WEAR_V3_CUSTOMER_READ_AUTHORITATIVE` | `false` | V3 drives primary summary tread/status/presentation only when **both** flags are `true`; suppresses new V2 `tireHealthSnapshot` writes |
| `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED` | `false` | Unchanged — customer reads always call `persistShadow: false` |

Authoritative mode requires `TIRE_WEAR_V3_CUSTOMER_READ_ENABLED=true` **and** `TIRE_WEAR_V3_CUSTOMER_READ_AUTHORITATIVE=true`. Authoritative alone has no effect.

## Single V3 computation path (customer reads)

All customer-facing V3 reads go through `TireHealthV3ReadService.computeCustomerRead` → `computeForSetup({ persistShadow: false })`. No second scheduler; no permanent V2+V3 dual writers on customer fields when authoritative is on.

Measurement ingestion (P1) continues post-save V3 recompute on the lifecycle path. V2 `recalculate()` still writes snapshots until a later cutover phase explicitly moves persistence.

## API contracts

- **Backward compatible:** existing V2 percent/mm fields unchanged when flags OFF.
- **Versioned:** `wearV3` carries mm intervals, evidence class, verification, mount-period quality.
- **No silent reinterpretation:** V2 `overallPercent` is not treated as V3 measurement when `wearReadModel` is `v2`.

## Rental & alerts

- `INSUFFICIENT_EVIDENCE` → measurement required, no excellent/clearance from missing data.
- `OVERDUE` → review required, distinct reason codes.
- Alert dedupe keys prevent duplicate V3 verification alerts during cutover.

## Rollback

Disable authoritative + customer read flags → V2 presentation and rental paths behave as before. Historical V2 snapshots and measurements retained.
