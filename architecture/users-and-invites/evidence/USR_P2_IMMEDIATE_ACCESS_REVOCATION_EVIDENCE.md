# USR-P2 — Immediate access revocation (R-008)

**Operation:** `SYNQDRIVE_MASTER_USERS_P2_IMMEDIATE_ACCESS_REVOCATION`  
**Owner policy:** USR-OWN-02 (**OWNER_APPROVED**)  
**Predecessor merge:** PR #2532 @ `89e3a7c4de13d90e9c44defd377f29db65ea9ad6`

## Implementation summary

| Control | Mechanism |
|---------|-----------|
| Canonical session identity | Refresh token **`family`** embedded as JWT `tokenFamily` (stable across rotation) |
| Family scope binding | Active head row (`replacedBy` null) + JWT/org/membership must match refresh authority |
| Request-time authority | `UserAccessAuthorityService` invoked from `AuthGuard` after crypto verify |
| Session revocation | Family-wide revoke by session id; atomic rotate under `FOR UPDATE` |
| Version invalidation | Separate `sessionVersion` / `securityVersion`; no session→security fallback at issuance |
| Platform privileges | `platformRole` + `platformPermissions` resolved from DB per request |
| MFA reissue | Bound to decoded access JWT `tokenFamily` + membership scope (not latest/first membership) |
| Legacy JWTs (no `tokenFamily`) | **401** `SESSION_BINDING_REQUIRED` — refresh/login rebind required (no permanent bypass) |
| Fail closed | DB/authority errors → `AUTHORITY_UNAVAILABLE`; lifecycle errors not swallowed |
| P1A intersection | Outbox read errors in session-revoke fallback do not block revocation |
| Auth harness | `authGuardHttpSecurityProviders` + bound JWT util for real-`AuthGuard` HTTP specs |

## Legacy / rolling deploy

- **Reauthentication:** Clients with legacy access JWTs must call **`POST /auth/refresh`** (or re-login) once to obtain `tokenFamily` binding.
- **Rolling deploy:** New pods enforce binding; old access tokens without `tokenFamily` fail until refresh. Refresh path already re-issues bound access JWTs.

## Test evidence (local)

```bash
cd backend && npm run build
npx jest user-access-authority.service.spec.ts
USR_P2_ACCESS_REVOCATION_PG=1 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/vo5b_p6c_closeout_test \
  npx jest usr-p2-access-revocation.postgres.integration.spec --runInBand
```

## R-008 status

**IMPLEMENTED + TESTED (repo)** — request-time session binding and version checks on protected API routes. **NOT DEPLOYED / NOT PRODUCTION_VERIFIED.**

## Non-goals preserved

No new IAM system, no MFA policy activation, no production deploy/migration, no permanent legacy bypass.