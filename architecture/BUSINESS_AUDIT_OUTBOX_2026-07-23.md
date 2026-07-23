# Business Audit Outbox — Rental Rules & Eligibility (V4.9.781)

| Field | Value |
|-------|-------|
| **Date** | 2026-07-23 |
| **Prompt** | Rental Rules Remediation Prompt 28 |
| **Module** | `backend/src/modules/business-audit/` |

## Purpose

Durable, tenant-scoped audit trail for critical rental-rule mutations and booking eligibility approvals. Mirrors the IAM transactional outbox pattern (`IamAuditOutbox`) but targets business operations (rules publish, category lifecycle, vehicle assignment, manual approvals).

## Data flow

```
Business mutation ($transaction)
  → BusinessAuditOutbox.enqueueInTransaction(tx, { idempotencyKey, action, before/after/diff, ... })
  → commit
  → [critical: publish / approval decide / approval request]
      BusinessAuditService.flushCritical(outboxIds) — sync process, throw 503 on dead_letter
  → [async] BusinessAuditOutboxSchedulerService (cron */15s)
      → BusinessAuditOutboxProcessorService
      → AuditService.record() → activity_log
```

## Schema

`BusinessAuditOutbox` (`business_audit_outbox`):

- Tenant: `organization_id`
- Idempotency: unique `idempotency_key`
- Event identity: `event_id`, `action`, `entity_type`, `entity_id`, `correlation_id`, `occurred_at`
- Integrity: `before_hash`, `after_hash`, `before_summary`, `after_summary`, `diff_ref`
- Context: `change_reason`, `outcome`, `payload` (description + metadata only)
- Processing: `processing_status` (PENDING | PROCESSING | PROCESSED | DEAD_LETTER), `attempts`, `next_retry_at`

## Event catalog

| Action | Critical flush | Source |
|--------|----------------|--------|
| `RENTAL_RULE_DRAFT_CREATED` | no | `RentalRulesService.recordDraftAudit` |
| `RENTAL_RULE_DRAFT_CHANGED` | no | same |
| `RENTAL_RULE_PUBLISHED` | **yes** | `RentalRulesRevisionService.publishDraft` (in tx) |
| `RENTAL_RULE_DEACTIVATED` | **yes** | same (when `isActive === false`) |
| `RENTAL_CATEGORY_ARCHIVED` | no | `transitionCategoryLifecycle` |
| `RENTAL_CATEGORY_VEHICLES_ASSIGNED` | no | `assignCategoryVehicles` |
| `RENTAL_VEHICLE_OVERRIDE_CREATED` | no* | publish tx / reset draft |
| `RENTAL_VEHICLE_OVERRIDE_DELETED` | no* | publish tx / reset |
| `ELIGIBILITY_CHECKED` | no | `BookingEligibilityEnforcementService.runEvaluation` |
| `MANUAL_APPROVAL_REQUESTED` | **yes** | `BookingEligibilityApprovalService.createRequest` |
| `MANUAL_APPROVAL_APPROVED` / `REJECTED` | **yes** | `decide` |
| `MANUAL_APPROVAL_REVOKED` / `EXPIRED` | no | revoke / expire paths |

\*Vehicle override create/delete on publish shares the publish critical flush when emitted in the same transaction.

## Privacy

`sanitizeBusinessAuditValue` masks sensitive keys (documents, tokens, PII field names). Summaries truncated at 2000 chars. Processor rejects payloads that still contain unmasked secrets (`scanBusinessAuditPayloadForSecrets`).

## Failure modes

- Non-critical: scheduler retries with exponential backoff; dead-letter after 5 attempts.
- Critical (`flushCritical`): synchronous retries; `ServiceUnavailableException` with `BUSINESS_AUDIT_OUTBOX_DEAD_LETTER` if audit cannot be persisted — business mutation already committed but API fails closed to surface audit loss.

## Tests

`backend/src/modules/business-audit/business-audit-outbox.security.spec.ts` — sanitize, idempotency, processor retry/dead-letter, `flushCritical` behavior.
