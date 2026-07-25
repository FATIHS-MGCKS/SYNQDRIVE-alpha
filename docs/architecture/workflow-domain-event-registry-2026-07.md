# SynqDrive Workflow Domain Event Registry

**Date:** 2026-07-25  
**Status:** Implemented (Phase 4, Prompt 14)  
**Code:** `backend/src/modules/workflows/registry/`

## 1. Purpose

Central, versioned catalogue of **workflow domain events** — discrete facts and state signals that may trigger automation. This registry is the single source of truth for:

- Event type identity (`booking.returned`, `vehicle.health.warning`, …)
- Semantic versioning (`eventVersion`, default `1.0.0`)
- Payload contracts (required IDs, forbidden PII)
- Legacy adapter mappings (explicit, documented — no silent remapping)

**Events ≠ Commands.** Workflow **actions** (`task.create`, `vehicle.status.update`) remain in `workflow.constants.ts`. Domain events describe what **happened**; actions describe what **should be done**.

---

## 2. Architecture

```mermaid
flowchart LR
  Producer[Domain module producer] -->|raw type + payload| Adapter[Legacy adapter]
  Adapter --> Validator[Registry validator]
  Validator -->|normalized event| Engine[WorkflowEngineService]
  Definition[Registry definitions] --> Validator
  Legacy[Legacy mapping table] --> Adapter
```

| Component | File |
|-----------|------|
| Types | `workflow-domain-event-registry.types.ts` |
| Definitions | `workflow-domain-event-registry.definitions.ts` |
| Legacy adapters | `workflow-domain-event-registry.legacy.ts` |
| Registry API | `workflow-domain-event-registry.ts` |
| Payload validator | `workflow-domain-event-registry.validator.ts` |
| Public exports | `index.ts` |

`WorkflowEventService.emitEvent()` validates and normalizes every inbound event before engine dispatch.

---

## 3. Registered events (v1.0.0)

### Booking & handover

| Event | Kind | Producer module |
|-------|------|-----------------|
| `booking.created` | occurred | bookings |
| `booking.confirmed` | occurred | bookings |
| `booking.pickup_due` | state | bookings |
| `booking.pickup_overdue` | state | bookings |
| `booking.picked_up` | occurred | bookings |
| `booking.return_due` | state | bookings |
| `booking.return_overdue` | state | bookings |
| `booking.returned` | occurred | bookings |
| `booking.cancelled` | occurred | bookings |
| `booking.completed` | occurred | bookings (legacy alias) |

### Vehicle health, telematics, geofence, connectivity

| Event | Kind | Producer module |
|-------|------|-----------------|
| `vehicle.health.warning` | state | vehicle-health |
| `vehicle.health.critical` | state | vehicle-health |
| `vehicle.dtc.detected` | occurred | vehicle-health |
| `vehicle.telemetry.soft_offline` | state | telemetry |
| `vehicle.telemetry.offline` | state | telemetry |
| `vehicle.geofence.entered` | occurred | stations |
| `vehicle.geofence.exited` | occurred | stations |
| `vehicle.connectivity.lost` | state | vehicles |
| `vehicle.connectivity.restored` | occurred | vehicles |

### Finance

| Event | Kind | Producer module |
|-------|------|-----------------|
| `invoice.created` | occurred | billing |
| `invoice.due` | state | billing |
| `invoice.overdue` | state | billing |
| `payment.failed` | occurred | billing |

### Customer

| Event | Kind | Producer module |
|-------|------|-----------------|
| `customer.document.expiring` | state | customers |
| `customer.verification.failed` | occurred | customers |
| `customer.complaint.created` | occurred | support |

### Operations

| Event | Kind | Producer module |
|-------|------|-----------------|
| `damage.reported` | occurred | damages |
| `service.due` | state | vehicle-health |
| `task.overdue` | state | tasks |
| `task.created` | occurred | tasks |

### Support & notifications

| Event | Kind | Producer module |
|-------|------|-----------------|
| `support.ticket.created` | occurred | support |
| `support.ticket.escalated` | occurred | support |
| `notification.dispatch.failed` | occurred | notifications |
| `notification.delivered` | occurred | notifications |

### Internal

| Event | Kind | Producer module |
|-------|------|-----------------|
| `manual.test` | occurred | workflows |

**Total:** 36 registered event types.

---

## 4. Versioning

- Each event type exposes one or more semantic versions under `versions`.
- Producers may omit `eventVersion`; the registry default (`1.0.0`) applies.
- Unknown versions are **rejected** with `WorkflowDomainEventRegistryError`.
- Adding breaking payload changes requires a new version entry; existing versions remain valid for historical workflow snapshots.

---

## 5. Payload rules

1. **Entity references only** — UUIDs (`bookingId`, `vehicleId`, …), codes, timestamps.
2. **Forbidden PII** — `email`, `phone`, `name`, `address`, `iban`, `token`, `apiKey`, etc. are rejected at validation.
3. **Closed schema** — keys not listed in `required`, `optional`, or `fields` are rejected.
4. **Type checks** — string, number, boolean, object, array, `iso-date` (ISO-8601).

Example — `booking.returned@1.0.0`:

```json
{
  "bookingId": "uuid",
  "vehicleId": "uuid",
  "stationId": "uuid",
  "handoverProtocolId": "uuid"
}
```

---

## 6. Legacy mapping table

Explicit adapters in `workflow-domain-event-registry.legacy.ts`. Deprecated keys log a warning when emitted via `WorkflowEventService`.

| Legacy key | Canonical event | Notes |
|------------|-----------------|-------|
| `vehicle_returned` | `booking.returned` | MVP UI trigger |
| `manual` | `manual.test` | MVP test trigger |
| `invoice_overdue` | `invoice.overdue` | Snake-case UI key |
| `health_threshold` | `vehicle.health.warning` | Generic threshold |
| `vehicle.dtc.critical` | `vehicle.dtc.detected` | Adds `severity: critical` |
| `booking.completed` | `booking.returned` | Prefer `booking.returned` for handover |
| `fine_created` | `invoice.created` | **Replaces wrong mapping** (see below) |

### Removed wrong mapping

| Legacy key | ❌ Previous (wrong) | ✅ Correct |
|------------|---------------------|------------|
| `fine_created` | `customer.complaint.created` | `invoice.created` with `invoiceKind: 'fine'` |

Traffic fines are financial documents, not customer complaints. `customer.complaint.created` remains a **separate** valid event for actual support complaints.

---

## 7. Usage

```typescript
import {
  validateAndNormalizeWorkflowEvent,
  listWorkflowEventTypes,
  resolveCanonicalEventType,
} from '@modules/workflows/registry';

// Validate before emit (also done inside WorkflowEventService)
const event = validateAndNormalizeWorkflowEvent({
  organizationId: 'org-uuid',
  type: 'booking.returned',
  payload: { bookingId: 'booking-uuid', vehicleId: 'vehicle-uuid' },
});

// Workflow definition trigger normalization
const trigger = resolveCanonicalEventType('vehicle_returned'); // booking.returned
```

---

## 8. Producer wiring status

| Module | Events wired | Status |
|--------|--------------|--------|
| bookings (handover) | `booking.returned`, `booking.completed` | ✅ Emits via `WorkflowEventService` |
| bookings (lifecycle) | `booking.created`, `booking.confirmed`, pickup/return due/overdue | ⏳ Not yet emitting |
| vehicle-health | health, DTC, service | ⏳ Detector integration pending |
| telemetry | soft_offline, offline | ⏳ Freshness jobs pending |
| stations | geofence entered/exited | ⏳ Geofence shadow → event bridge pending |
| vehicles | connectivity | ⏳ Fleet connectivity service pending |
| billing | invoice.*, payment.failed | ⏳ Stripe/webhook bridge pending |
| customers | document.expiring, verification.failed | ⏳ Eligibility/KYC jobs pending |
| damages | damage.reported | ⏳ Damage create hook pending |
| tasks | task.overdue, task.created | ⏳ Task scheduler pending |
| support | ticket.* | ⏳ Support module pending |
| notifications | dispatch.failed, delivered | ⏳ Notification engine bridge pending |
| workflows | manual.test | ✅ Available for operator tests |

---

## 9. Tests

`backend/src/modules/workflows/registry/workflow-domain-event-registry.spec.ts`

- Minimum required event coverage
- Version rejection
- Legacy adapter behaviour (including `fine_created` correction)
- Payload validation (required fields, PII, unknown keys)
- Past-tense naming for occurred events

---

## 10. Related documents

- `docs/architecture/workflow-automation-data-model-2026-07.md` — runtime data model
- `backend/src/modules/notifications/registry/` — parallel pattern for notification events

## 11. Event envelope (V4.9.822)

Producers should build events via `createWorkflowDomainEventEnvelope()` in `backend/src/modules/workflows/envelope/`. The envelope wraps registry-validated payloads with `eventId`, UTC timestamps, correlation/causation chain, and `source`. Rejections produce structured dead-letter payloads — never silent drops.

## 12. Transactional outbox (V4.9.823)

Domain events that trigger workflow automation must be written via `WorkflowEventOutboxEnqueueService.enqueueInTransaction(tx, …)` in the **same** Prisma transaction as the business mutation.

- Table: `workflow_event_outbox` — stores full canonical envelope JSON + indexed columns
- Status lifecycle: `PENDING` → `CLAIMED` → `DISPATCHED` | `RETRY_SCHEDULED` | `DEAD_LETTER`
- Idempotency: `@@unique([organizationId, idempotencyKey])` + global `eventId`
- First wired producers: `bookings` (confirmed/returned), `billing` (invoice.overdue), `vehicle-health` (critical brake DTC)
- Dispatch worker: pending (Prompt 17+)
