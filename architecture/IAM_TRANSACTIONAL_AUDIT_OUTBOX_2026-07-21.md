# IAM transactional audit outbox (2026-07-21)

## Goal

Critical IAM mutations must never commit without a durable audit intent in the same database transaction.

## Components

| Component | Role |
|-----------|------|
| `IamAuditOutbox` (Prisma) | Durable outbox with event metadata, hashes/summaries, retry state |
| `IamAuditService` | Transactional enqueue + post-commit processing helper |
| `IamAuditOutboxRepository` | Create, claim, retry, dead-letter, stale recovery |
| `IamAuditOutboxProcessorService` | Idempotent fan-out to `UserAccessAuditService` → `ActivityLog` |
| `IamAuditOutboxSchedulerService` | Cron poll for pending/retry rows |
| `iam-audit-sanitize.util` | Mask tokens/passwords; hash/summary before/after |

## Event coverage

- Membership create/reactivate/suspend/remove/update (role, permissions, scope)
- Role create/update/deactivate/assign
- Invite create/rotate/resend/revoke/accept
- Admin + self-service password reset completion
- Session revoke (single + others)
- Prepared event types: MFA, org switch, break glass

## Guarantees

1. Mutation + outbox row share one Prisma transaction.
2. Processor retries with exponential backoff; dead-letters after max attempts.
3. Append-only activity log via `UserAccessAuditService.record` (no updates/deletes).
4. Sensitive values never stored in outbox summaries.

## Tests

`backend/src/modules/users/iam-audit-outbox.security.spec.ts`
