# IAM Invite Secret Surface — Prompt 14 (2026-07)

## Goal

Invite tokens and full invite URLs must never leave the email delivery path. Administrative API and frontend surfaces expose only non-secret metadata.

## Admin API contract

`POST /organizations/:orgId/invites` and `POST .../invites/:id/resend` return:

| Field | Description |
|-------|-------------|
| `inviteId` | Invite record id |
| `status` | `PENDING` / `ACCEPTED` / … |
| `expiresAt` | ISO expiry |
| `deliveryStatus` | `QUEUED` / `SENDING` / `SENT` / `FAILED` / `DEAD_LETTER` |
| `recipientMasked` | Masked email (`j***n@example.com`) |
| `roleSummary` | Role label for display |

**Never returned:** `inviteToken`, `inviteUrl`, plaintext email on mutation responses.

## Delivery architecture

1. Cryptographically secure token (`randomBytes(32)` base64url).
2. Only bcrypt hash + SHA-256 lookup stored on `organization_user_invites`.
3. Plain token encrypted at rest in `invite_email_outbox.token_ciphertext` until send completes.
4. `InviteEmailDeliveryService` processes outbox entries; retries with exponential backoff; dead-letter after max attempts.
5. `InviteEmailSchedulerService` polls pending outbox every 30s.
6. `TransactionalMailService` logs masked recipient only — no URL/token in logs.

## Resend

- Rotates `tokenHash` + `tokenLookup` immediately (old link invalid).
- New delivery only via outbox/email — no admin clipboard.

## Rate limits (`organization_invite_attempts`)

Scopes per hour (env-overridable):

- Create: org / actor / recipient
- Resend: org / actor / recipient

## Frontend

- Copy-link removed from InvitesTab and UsersTab.
- Resend uses `pendingInviteId` on `OrgUserDto` (server-side correlation, not invite secret).
- No `inviteToken` / `inviteUrl` in React types.

## Manual link flow

Not implemented (disabled by default per security policy).

## Tests

- `iam-invite-secret-surface.security.spec.ts`
- `iam-invite-frontend-clipboard.security.spec.ts`
- Updated `organization-invite.service.spec.ts`
