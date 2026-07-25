# Operator App Audit Logging (Prompt 35)

| Feld | Wert |
|------|------|
| **Gültig ab** | V4.9.828 |
| **Modul** | `OperatorAuditModule` |
| **Storage** | `BusinessAuditOutbox` → `ActivityLog` (server-side, nicht client-manipulierbar) |
| **List API** | `GET /organizations/:orgId/operator/audit-events` |

## Audit Events

| Event | Trigger |
|-------|---------|
| `OPERATOR_CUSTOMER_SENSITIVE_VIEW` | Customer detail / booking detail with customer |
| `OPERATOR_DOCUMENT_FULL_VIEW` | Generated document download |
| `OPERATOR_DOCUMENT_VERIFICATION` | Manual pickup check, extraction confirm |
| `OPERATOR_HANDOVER_STARTED` | Handover POST begins |
| `OPERATOR_HANDOVER_PICKUP_COMPLETED` | Pickup handover success (critical) |
| `OPERATOR_HANDOVER_RETURN_COMPLETED` | Return handover success (critical) |
| `OPERATOR_HANDOVER_OVERRIDE` | Pickup gate override |
| `OPERATOR_SIGNATURE_CAPTURED` | Signatures present on handover |
| `OPERATOR_TECHNICAL_OBSERVATION_CREATED` | Observations in handover |
| `OPERATOR_DAMAGE_CREATED/UPDATED/VERIFIED` | Damage CRUD |
| `OPERATOR_TIRE_MEASUREMENT_RECORDED` | Tire measurement |
| `OPERATOR_TASK_COMPLETED` | Task done |
| `OPERATOR_TASK_COMPLETION_OVERRIDE` | Checklist override (critical) |
| `OPERATOR_BOOKING_CREATED/UPDATED/CANCELLED` | Booking mutations |
| `OPERATOR_UPLOAD_DELETED` | Extraction file delete (critical) |
| `OPERATOR_PERMISSION_DENIED` | Security-relevant 403 |

## Payload rules

- Before/after summaries hashed + truncated via `BusinessAuditOutbox`
- No signature bitmaps, document content, tokens, or raw OCR
- `metadata` carries `requestId`, `stationId`, `bookingId` where applicable

## Idempotency

`buildBusinessAuditIdempotencyKey` — duplicate correlation replays dedupe via unique `idempotencyKey`.

## Offene Punkte

- `OPERATOR_HANDOVER_DRAFT_RESUMED` — requires server draft sync (Prompt 34)
- `OPERATOR_HANDOVER_PROTOCOL_CORRECTED` — no correction endpoint yet
