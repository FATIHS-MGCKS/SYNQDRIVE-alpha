# DTC-01A — Safety foundation contract

**Flag:** `DTC_01A_SAFETY_FOUNDATION_ENABLED=true` (default **off**).

## Ingress channels

| Channel | Completeness evidence | Clears allowed |
|---------|----------------------|----------------|
| Poll `signalsLatest.obdDTCList` | `signals_latest_complete` when signal object + valid provider `timestamp` + defined `value` | Yes, after monotonic advance |
| Webhook `obdDTCList` | `webhook_partial_upsert_only` | **Never** (no inferred full snapshot) |

## Fail-closed rules

1. No provider `timestamp` → reject; no mutation of active codes; no confirmed clean.
2. HTTP fetch success without `obdDTCList` signal → `REJECT_FETCH_WITHOUT_SIGNAL`.
3. Source observation older than stored head → `REJECT_OUT_OF_ORDER_SOURCE` (no side effects).
4. Same source timestamp, different content hash → `REJECT_EQUAL_TIMESTAMP_CONFLICT`.
5. Binding id mismatch vs stored head → `REJECT_BINDING_MISMATCH`.
6. Never substitute `Date.now()` for missing provider observation time in proposals.
7. `lastDtcPollAt` / `providerFetchedAt` = fetch time; `sourceTimestamp` / head = provider observation time.

## Poll eligibility (when flag on)

Skip poll jobs for `registryLifecycle` OFFBOARDED/ARCHIVED, missing token, inactive DIMO `VehicleDataSourceLink`, or binding/dimo vehicle mismatch.

## `occurrenceCount` (when flag on)

Increments only on **new active episode** (row create). Re-seen codes within the same active episode update `lastSeenAt` only. Legacy rows may still reflect pre-01A poll increments.

## UI/API (when flag on)

Stale monitoring still applies to **confirmed** state, but last-known active codes remain visible with `faultConfirmation: last_known_unconfirmed`.

## Transaction boundary

Event mutations and `vehicle_latest_states` updates are sequential (no single DB transaction across `DtcService` and VLS). Partial failure may require reconciliation — logged via `syncJobRef` and `rawPayloadJson.dtc01aSnapshot`.
