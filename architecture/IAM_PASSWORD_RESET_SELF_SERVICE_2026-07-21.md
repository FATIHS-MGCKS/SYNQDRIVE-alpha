# IAM — Secure Password Self-Service Reset (2026-07-21)

## Changes

- Replaced org-admin plaintext password writes with **admin-initiated reset request** → email → user self-service confirm.
- `PasswordResetService` + `password_reset_tokens` (hash-only storage, single-use, TTL, purpose-bound).
- Public: `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm`.
- Org admin: `POST .../request-password-reset` — neutral response only (no token/URL).
- Central `PasswordPolicyService` (min length 12, max 128, optional breach check hook).
- Rate limits: IP, email, organization (`password_reset_attempts`).
- On confirm: `IamSessionPolicyService` `PASSWORD_CHANGED` → all global sessions revoked; `mustChangePassword` cleared.

## Architektur

```
Org Admin POST .../request-password-reset
  → rate limits → revoke pending tokens → create hash-only token
  → email (token never in API response or logs)
  → neutral { status: accepted }

User POST /auth/password-reset/confirm { token, newPassword }
  → verify hash + expiry + single-use
  → update passwordHash, mark token used
  → session invalidation outbox (USER_ALL_SESSIONS)
  → audit USER_PASSWORD_RESET_COMPLETED + notification
```

Enumeration protection: self-service request always returns identical neutral message.
