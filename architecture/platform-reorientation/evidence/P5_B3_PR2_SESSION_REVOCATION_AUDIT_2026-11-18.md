# P5-B3-PR2 — Master Admin session revocation audit

**Date:** 2026-11-18 (Europe/Berlin)  
**Base:** `a2596ae23ea58a98eeece88488e8545d4ebce801`

## Audit actions added

| Action | Route |
|--------|--------|
| `MASTER_USER_SESSION_REVOKED` | `POST …/admin/security/users/:userId/sessions/:sessionId/revoke` |
| `MASTER_USER_SESSIONS_REVOKED_ALL` | `POST …/admin/security/users/:userId/sessions/revoke-all` |

Metadata: `targetUserId`, `sessionId` (single), `outcome` (`SUCCESS` / `NO_OP`), `revokedSessionCount` (revoke-all), MFA fields from request context.

## Dedup with PR #2430

`shouldSkipGenericPrivilegedSuccessAudit` suppresses generic interceptor success rows on session-revocation routes. Unauthorized attempts still emit a single `PRIVILEGED_MUTATION_DENIED` via the exception filter.

## Remaining limitations

- Revoke-all does not attach per-tenant organization context (platform-scoped operation).
- No token material persisted (session ids are opaque DB ids only).
- Transactional coupling between revocation and audit not implemented (fire-and-forget).

**REGISTRY_REVIEWED:** UNCHANGED