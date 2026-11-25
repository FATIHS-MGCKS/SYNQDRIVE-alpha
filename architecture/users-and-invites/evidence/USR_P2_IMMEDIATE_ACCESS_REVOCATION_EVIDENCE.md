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
| Session write fencing (P2-R07–R13) | Lock order: org advisory `913105` → user advisory `913104` → row `FOR UPDATE`; `acquireSessionWriteLocks` on all writers |
| Lock inversion (P2-R12) | Rotate resolves token id, acquires advisories, then `FOR UPDATE` |
| Logout family (P2-R14) | `revoke(raw)` revokes entire session `family` under fence |
| Orphan prevention (P2-R10/R15) | Rotate throws on replace race → full tx rollback |
| MFA pending (P2-R16) | Pending JWT binds `sessionVersion`, `securityVersion`, `platformRole`; completion rejects stale snapshot |
| Auth snapshot fence (P2-R17) | `issueTokenPair` compares caller/`expectedAuth` to authoritative user row inside tx |
| MFA assurance (P2-R18) | Rotation does not fabricate `totp`/`recovery` in `authMethods`; conservative `['pwd']` on stored MFA rows |
| Legacy scope upgrade (P2-R19) | Destination org advisory acquired when binding resolves to a different org than predecessor |
| MFA refresh assurance | `buildSessionClaimsForStored` preserves MFA timestamps/level on rotation (methods conservative) |
| Denial persistence (P2-R10) | Rotate returns outcome from tx; `UnauthorizedException` only after commit |
| MFA login (P2-R08) | Verify-only MFA step; `issueTokenPair` returns single bound access JWT + refresh |
| Current session (P2-R09) | `revokeOtherSessions` keeps authenticated JWT `tokenFamily`, not newest row id |
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
npx jest user-access-authority.service.spec.ts refresh-token-org-binding.spec.ts account.service.spec.ts
USR_P2_ACCESS_REVOCATION_PG=1 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/vo5b_p6c_closeout_test \
  npx jest usr-p2-access-revocation.postgres.integration.spec --runInBand
USR_P2_SESSION_CONCURRENCY_PG=1 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/usr_p2_concurrency_test \
  npx jest usr-p2-session-concurrency.postgres.integration.spec --runInBand
```

**Mandatory evidence gate (2026-11-26 CET, branch `cursor/master-users-p2-access-revocation-44c2`):**

```bash
cd backend && USR_P2_PG_USER=synqdrive USR_P2_PG_PASSWORD=synqdrive bash scripts/test/usr-p2-postgres-gate.sh
```

| Suite | Executed | Pass | Notes |
|-------|----------|------|-------|
| `usr-p2-access-revocation.postgres` | 5 | 5 | PG01,04,06,12,20 |
| `usr-p2-session-concurrency.postgres` | 5 | 5 | RACE01,02,04,06 + lock constants |
| `usr-p1a-session-audit-certification.postgres` | 19 | 19 | PG01–13, PGA–PGF (incl. PG10 intent fault, PG07 lost-ack style replay) |
| **Gate PostgreSQL total** | **29** | **29** | 456 migrations via resilient deploy |

```bash
npx jest auth-mfa-login.service.spec refresh-token-org-binding usr-p2-access-revocation.http-security.integration
cd frontend && npm run test -- --run src/lib/auth.master-billing.test.ts src/i18n/auth-error-i18n.test.ts
npm run build # backend
```

- HTTP harness: **9/21 executed** (HTTP01–07, HTTP18–19) — remainder not implemented in spec file.
- RACE matrix: **4/10 + org offboarding** — RACE03,05,07–10, `ORG_OFFBOARDING_RACE` not implemented.
- Frontend auth: **6** vitest cases executed (4 master-billing + 2 auth-error i18n); no dedicated refresh-coalescing E2E in repo.

### Schema drift (`users.first_name`)

Prisma `User.firstName` exists in schema; disposable DB after full migrate lacks `users.first_name`. Root cause: **migration baseline gap** (model ahead of applied migrations on fresh disposable DB). Mitigation in gate path: narrow `activityLog` user/org `include` selects for P1A reads; **not** a production schema claim.

## R-008 status

**IMPLEMENTED + TESTED (repo)** — request-time session binding and version checks on protected API routes. **NOT DEPLOYED / NOT PRODUCTION_VERIFIED.**

## Non-goals preserved

No new IAM system, no MFA policy activation, no production deploy/migration, no permanent legacy bypass.