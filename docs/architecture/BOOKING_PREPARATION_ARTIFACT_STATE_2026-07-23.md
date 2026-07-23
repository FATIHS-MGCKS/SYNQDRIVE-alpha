# Booking Preparation Artifact State (Prompt 24)

## Purpose

Bookings may be persisted while follow-up processes (invoice, documents, payment, tasks, emails) are still running or have failed. This module exposes a **canonical preparation/processing state** per artifact so operators never see a false “all good” status and can recover failed steps without duplicates.

## Artifact types

| Type | Label (DE) | Pickup-blocking when required |
|------|------------|-------------------------------|
| `PRICING` | Preisberechnung | No |
| `INVOICE` | Rechnung | Yes |
| `PAYMENT` | Zahlung | No |
| `LEGAL_DOCUMENTS` | Rechtliche Dokumente | Yes |
| `RENTAL_AGREEMENT` | Mietvertrag | Yes |
| `PICKUP_TASK` | Pickup-Aufgabe | No |
| `RETURN_TASK` | Rückgabe-Aufgabe | No |
| `CUSTOMER_EMAIL` | Kunden-E-Mail | No |
| `INTERNAL_NOTIFICATION` | Interne Benachrichtigung | No |

## Status enum

`NOT_REQUIRED` · `PENDING` · `PROCESSING` · `READY` · `FAILED` · `RETRY_SCHEDULED`

## State model

Hybrid **derived + persisted**:

1. **Reconcile** reads booking row, invoices, payment requests, document jobs, tasks, outbox consumer receipts, outbound emails, rental contract, bundle completeness.
2. **Upsert** into `booking_preparation_artifact_states` (per `bookingId` + `artifactType`).
3. **Snapshot** aggregates overall status, `isOperationallyReady`, pickup/return block flags, and per-artifact DTOs with `recoverable` + `recoveryAction`.

Reconcile runs:

- After each outbox event is published (`BookingDomainEventOutboxProcessorService`)
- On `GET .../preparation` and booking detail reads (`getSnapshot`)
- After admin recovery (`BookingPreparationRecoveryService`)

## Pickup gate integration

`BookingPickupGateService` calls `preparationState.getSnapshot()` and adds `PICKUP_GATE_PREPARATION_INCOMPLETE` requirements when `blocksPickup` is true. This blocks pickup without a required contract/invoice/legal bundle even if the booking row is `CONFIRMED`.

## Admin recovery

`POST /organizations/:orgId/bookings/:bookingId/preparation/retry`

| Recovery action | Artifact types |
|-----------------|----------------|
| `RETRY_INVOICE` | `INVOICE`, `PAYMENT` |
| `RETRY_DOCUMENT` | `LEGAL_DOCUMENTS`, `RENTAL_AGREEMENT` |
| `RETRY_EMAIL` | `CUSTOMER_EMAIL`, `INTERNAL_NOTIFICATION` |
| `REBUILD_TASKS` | `PICKUP_TASK`, `RETURN_TASK` |

Each retry:

- Requires `bookings.manage`
- Uses idempotency key (`booking_preparation_recovery_attempts.idempotency_key` unique)
- Enqueues `BOOKING_PREPARATION_RECOVERY` business audit event
- Marks artifact `RETRY_SCHEDULED` then re-runs reconcile

## Monitoring

- Cron every 5 minutes: `BookingPreparationMonitoringSchedulerService` counts persistently `FAILED` artifacts (older than 30 min) and sets Prometheus gauge `synqdrive_booking_preparation_failed{artifact_type}`.

## API

- `GET .../preparation` — snapshot (`bookings.read`)
- Booking detail DTO includes `preparation` section
- `POST .../preparation/retry` — admin recovery (`bookings.manage`)

## Frontend

Booking dossier overview tab shows `BookingPreparationPanel` with existing `StatusChip` badges, error messages, and retry buttons gated by `bookings.manage`. Header chip: “Vorbereitung: …”.

## Schema

- `booking_preparation_artifact_states`
- `booking_preparation_recovery_attempts`

Migration: `20260723270000_booking_preparation_artifact_state`
