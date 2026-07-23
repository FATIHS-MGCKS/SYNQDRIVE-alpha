# Data Authorization Audit Logging (Prompt 15)

Append-only lifecycle, review, and authorization decision logging with transactional outbox delivery, risk-based sampling, tenant isolation, and fail-closed behavior for critical audit paths.

## Event types

| Kind | Storage | Outbox role |
|------|---------|-------------|
| `AUTHORIZATION_DECISION` | `authorization_decision_events` | Enqueue + synchronous materialization for critical paths |
| `LIFECYCLE_CHANGE` | `*_lifecycle_events` tables | Transactional durability marker (same DB transaction as lifecycle event) |
| `REVIEW_DECISION` | `data_processing_review_decisions` | Transactional durability marker (same DB transaction as review decision) |

### AuthorizationDecisionEvent fields

- `id`, `organizationId`, `processingActivityId`, `enforcementPolicyId` (policy)
- `policyVersion`, `eventType` (`ALLOW` \| `DENY` \| `SHADOW_WOULD_DENY`)
- `dataCategory`, `processingPurpose`, `sourceSystem`, `action`
- `processorType`, `processorIdentity` (pseudonymized)
- `resourceType`, `resourceReferenceHash` (pseudonymized; no raw vehicle/customer IDs)
- `actorType`, `actorId`, `decisionReason`, `correlationId`
- `evaluatedAt`, `policyChecksum`, `resolverVersion`, `engineVersion`
- `retentionClass`, `sampled`, `createdAt`

No `updatedAt`. No delete API. No update API.

## Transaction model

1. **Authorization decisions** — `DataAuthorizationAuditService.recordAuthorizationDecision()` enqueues to `data_authorization_audit_outbox`, then synchronously processes critical events (all `DENY` / `SHADOW_WOULD_DENY`, critical categories, destructive actions). Production `AuthorizationDecisionService` fail-closes to `DENY` when audit delivery fails.
2. **Lifecycle changes** — `PolicyLifecycleEventsService` writes append-only lifecycle rows and enqueues critical outbox markers in the **same Prisma transaction** via `enqueueLifecycleAuditInTransaction()`.
3. **Review decisions** — `DataProcessingReviewWorkflowService` writes append-only review decisions and enqueues outbox markers in the **same transaction** via `enqueueReviewDecisionAuditInTransaction()`.
4. **Background worker** — `DataAuthorizationAuditOutboxSchedulerService` polls pending rows; `DataAuthorizationAuditOutboxProcessorService` materializes authorization events, marks lifecycle/review markers processed. Retries with exponential backoff; dead-letter after 8 attempts. Metrics via `DataAuthorizationAuditOutboxMetricsService`.

## Sampling

Controlled by `DATA_AUTH_AUDIT_ALLOW_SAMPLE_RATE` (default `0` = no sampling).

**Never sampled:**

- `DENY`, `SHADOW_WOULD_DENY`
- Critical data categories: `GPS_LOCATION`, `CUSTOMER_DATA`, `FINANCIAL_DATA`, `HEALTH_SIGNALS`, `DRIVING_BEHAVIOR`
- Destructive actions: `DELETE`, `EXPORT`, `SHARE`, `USE_FOR_AI`
- Non-`POLICY_MATCH` reason codes

Only non-critical `ALLOW` events may be sampled away (not persisted).

## Privacy measures

- Resource references hashed per org (`sha256`, truncated)
- Processor identity hashed (no plaintext service account names in audit rows)
- Outbox payload sanitization redacts `vehicleId`, `customerId`, `processorId`, tokens, emails, etc.
- Policy checksum derived from policy family/id/version (no policy body in audit)
- List API returns stored pseudonyms only

## Retention

`retentionClass` enum on each authorization decision event:

| Class | Default retention (days) | Use |
|-------|--------------------------|-----|
| `STANDARD` | 90 | Routine ALLOW |
| `EXTENDED` | 365 | DENY, sensitive categories |
| `LEGAL_HOLD` | indefinite | Manual/legal hold (future job) |

Operational purge jobs are not part of this prompt; class is set at write time for future enforcement.

## API

`GET /api/v1/organizations/:orgId/data-authorizations/audit/authorization-decisions`

Query: `eventType`, `correlationId`, `dataCategory`, `from`, `to`, `cursor`, `limit` (max 200).

`GET .../audit/outbox/backlog` — pending/dead-letter count for monitoring.

Permission: `data_processing.audit_view`.

## Configuration

| Env | Default | Purpose |
|-----|---------|---------|
| `DATA_AUTH_AUDIT_ALLOW_SAMPLE_RATE` | `0` | ALLOW sampling rate (0–1) |
| `DATA_AUTH_AUDIT_OUTBOX_POLL_ENABLED` | `true` | Background poller |
| `DATA_AUTH_AUDIT_OUTBOX_POLL_MS` | `5000` | Poll interval |

## Tests

`data-authorization-audit.security.spec.ts` covers:

- Risk-based sampling invariants
- Payload sanitization / pseudonymization
- Outbox idempotency (duplicate key)
- Repeated outbox delivery (P2002 on event id)
- Retry and dead-letter paths
- Tenant-scoped list queries
- Production fail-closed on audit failure
- Append-only service surface (no update/delete methods)

Run:

```bash
cd backend && npm test -- --testPathPattern="data-authorizations"
```

## Migration

`20260724040000_data_authorization_audit_logging`
