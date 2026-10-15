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

## DTC-01B hardening (same flag)

When `DTC_01A_SAFETY_FOUNDATION_ENABLED=true`:

1. **Source head authority** — `vehicle_dtc_source_heads` holds binding epoch, accepted source hash, and confirmed-complete watermarks. DTC apply **must not** write `vehicle_latest_states.sourceTimestamp`, `providerFetchedAt`, `providerBindingId`, `syncJobRef`, or `rawPayloadJson`.
2. **VLS DTC columns only** — `obdDtcList`, `lastDtcPollAt`, `lastDtcSuccessfulCheckAt` (complete snapshot evidence only), `dtcPollStatus`, `dtcPollError`.
3. **Transactional apply** — `pg_advisory_xact_lock` per vehicle; events + head + VLS DTC patch + notification outbox in one transaction; downstream brakes/findings/rental-health after commit.
4. **Payload classes** — `MISSING`, `NULL`, `INVALID`, `PARTIAL`, `VALID_EMPTY`, `VALID_NONEMPTY`. `PARTIAL` / invalid payloads never trigger confirmed clear.
5. **Webhook** — partial ingress never advances `lastDtcSuccessfulCheckAt` or confirmed `confirmedObdCodes` on the head.
6. **Binding rotation** — same `dimoTokenId`, new link id → `APPLY_BINDING_REBASELINE` (epoch++); different token → `REJECT_BINDING_MISMATCH`.
7. **Fail-closed** — flag on without `DtcSnapshotApplyService` injection throws `DTC_01A_FAIL_CLOSED` (no legacy fallback).

## DTC-01C closure (same flag)

1. **Stricter payload typing** — reject object/number/boolean, ambiguous empty strings, malformed JSON, mixed valid/invalid arrays (`PARTIAL`/`INVALID`); only explicit `VALID_EMPTY` may drive confirmed clear.
2. **Durable downstream** — brakes/findings/rental-health + notifications enqueued in `vehicle_dtc_snapshot_outbox` inside the apply transaction; `recoverPendingOutbox()` idempotent flush after apply or restart.
3. **Split watermarks** — `last_partial_webhook_source_at` vs `last_confirmed_complete_source_at`; complete snapshot older than partial defers clears (`APPLY_CONFIRMED_SNAPSHOT_DEFER_CLEARS`) without blocking reconciliation upserts.
4. **Binding verification** — ingress `tokenId` must match registered `DimoVehicle.tokenId`; active link `dimoVehicleId` must match vehicle binding.

## Transaction boundary (01A legacy note)

Pre-01B documentation referenced `rawPayloadJson.dtc01aSnapshot`; 01B replaces that with `vehicle_dtc_source_heads` + `vehicle_dtc_snapshot_outbox`.

## DTC-01F pilot cohort + watermark refresh (same global flag)

1. **Cohort gate (default OFF)** — `DTC_01F_COHORT_GATE_ENABLED=true` restricts the 01A safety path to `DTC_01F_COHORT_VEHICLE_ALLOWLIST` (comma-separated vehicle UUIDs). Invalid or empty allowlist while gate is on → **fail-closed** (no vehicle uses 01A path). `OFFBOARDED` / `ARCHIVED` never admitted. Vehicles **not** on the allowlist keep the **legacy** poll/webhook path even when the global flag is on.
2. **Watermark refresh** — newer provider `sourceObservedAt` with identical channel codes hash → `REFRESH_SOURCE_WATERMARK`: update source head + VLS poll metadata only; **no** `upsertDtc`, **no** occurrence bump, **no** downstream outbox episodes/notifications.

## CI / integration

- Unit: `npm test -- dtc-snapshot dtc-payload-validation dtc.service.spec dimo-webhook.controller.spec`
- Optional PostgreSQL: `DTC_01B_PG_INTEGRATION=1` with disposable DB name `dtc01b_test_*` — `dtc-01b.postgres.integration.spec.ts`
- Full repo gate: latest `CI gate (all critical jobs)` success on merge SHA (no bypass).
