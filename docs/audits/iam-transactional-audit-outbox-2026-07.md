# IAM transactional audit outbox — audit (2026-07)

## Scope

Prompt 16: ensure critical IAM mutations commit together with durable audit intent.

## Architecture

- Extended `iam_audit_outbox` columns: `event_id`, actor/subject/membership, `event_type`, `occurred_at`, `payload_version`, before/after hash+summary, `reason`, `processing_status`, `attempts`, `next_retry_at`, `processed_at`, `dead_lettered_at`.
- Worker: claim → process → retry/backoff/dead-letter; scheduler every 15s.
- Sanitizer strips tokens/password hashes before persistence.

## Migrated paths

| Area | Paths |
|------|-------|
| Users | create, reactivate, update (role/permissions/scope/status), admin password reset, remove |
| Roles | create, update, deactivate, assign |
| Invites | create, resend (rotate+resent), revoke, accept |
| Account | self-service password change, session revoke, revoke others |

## Removed anti-patterns

- `void userAudit.record` on critical IAM paths in users module
- Fire-and-forget audit on session/password critical account paths

## Verification

```bash
cd backend && npm test -- --testPathPattern=iam-audit-outbox
```

Cases: atomic enqueue, worker failure retry, dead letter, duplicate skip, rollback, sensitive scan, cross-tenant read scope.
