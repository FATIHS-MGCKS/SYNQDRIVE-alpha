# IAM Invite Secret Surface — Architecture (2026-07-21)

## Principle

Invite tokens are credentials for public accept flow only. They never appear on admin API responses, frontend state, audit payloads exposed to UI, or application logs.

## Components

| Component | Role |
|-----------|------|
| `OrganizationInviteService` | Create/resend/revoke; hash storage; admin-safe DTO |
| `InviteEmailDeliveryService` | Outbox enqueue + process; URL built only at send time |
| `InviteEmailOutboxRepository` | Pending/processing/completed/dead-letter persistence |
| `InviteEmailSchedulerService` | Cron retry for pending deliveries |
| `InviteRateLimitService` | Org/actor/recipient throttles |
| `TransactionalMailService` | Email channel; masked logging only |

## Data flow

```
Admin create/resend
  → rate limit check
  → rotate/store bcrypt hash + lookup
  → enqueue encrypted token in invite_email_outbox
  → process outbox (sync attempt + cron retries)
  → mail provider (URL only in email body)
  → clear token_ciphertext on success
```

## Org user correlation

`UsersService.findByOrganization` attaches `pendingInviteId` for INVITED memberships so frontend can resend without exposing invite secrets or full email in invite list API.
