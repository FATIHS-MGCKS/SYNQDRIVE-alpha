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
| Legacy scope upgrade (P2-R19) | All candidate org advisories (stored / last-selected / memberships) acquired in sorted order **before** user + row locks; destination revalidated inside fence; deny + safe retry if scope not in plan |
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

**P2A disposable IAM baseline (2026-11-26 CET):** see [`USR_P2A_DISPOSABLE_DATABASE_BASELINE.md`](USR_P2A_DISPOSABLE_DATABASE_BASELINE.md) — targeted SQL parity + fail-closed preflight; GATE-1 `AccountService.changePassword` PG now executes (no `password_hash` skip).

**P2B atomic security mutations (2026-11-26 CET):** see [`USR_P2B_ATOMIC_SECURITY_MUTATIONS.md`](USR_P2B_ATOMIC_SECURITY_MUTATIONS.md) — canonical lock fences, authoritative idempotency, P2B PG matrix (B01–B04,B06–B09), disposable gate **60/60** PG.

**Mandatory evidence gate (2026-11-26 CET, branch `cursor/master-users-p2-access-revocation-44c2`):**

```bash
cd backend && USR_P2_PG_USER=synqdrive USR_P2_PG_PASSWORD=synqdrive bash scripts/test/usr-p2-postgres-gate.sh
# Local log: usr-p2-final-gate8.log — USR_P2_PG_EXECUTED=1
```

| Suite | Executed | Pass | Notes |
|-------|----------|------|-------|
| `usr-p2-access-revocation.postgres` | 6 | 6 | incl. cross-replica `PG_CROSS_REPLICA` |
| `usr-p2-session-concurrency.postgres` | 12 | 12 | RACE01–10 + `ORG_OFFBOARDING_RACE` + lock constants (**no explicit lock-order probe hooks**) |
| `usr-p2-security-reset.postgres` | 3 | 3 | `PASSWORD_CHANGED` + MFA pending stale + **status INACTIVE only** — not `PasswordResetService` / `IamMfaResetService` HTTP paths |
| `usr-p1a-session-audit-certification.postgres` | 22 | 22 | **P1A_A** outbox read fault on fallback; **P1A_B** idempotent second revoke (≠ lost commit ack); **P1A_C** dual-`PrismaClient` enqueue |
| **Gate PostgreSQL total** | **43** | **43** | disposable DB ownership check + resilient migrate (baseline warnings persist) |

```bash
npx tsc -p tsconfig.json --noEmit  # PASS (incl. auth-mfa-login.platform-permissions)
npx jest usr-p2-access-revocation.http-security.integration.spec --runInBand  # HTTP01–HTTP21 (HTTP13 billing N/A stub) — 21/21 PASS
npx jest auth-mfa-login.platform-permissions.spec --runInBand
cd frontend && npm run test -- --run src/lib/auth.master-billing.test.ts src/i18n/auth-error-i18n.test.ts  # 6/6
npm run build # backend PASS
bash architecture/scripts/validate-module-registry.sh && node architecture/users-and-invites/scripts/validate-graph.mjs
```

- **HTTP matrix:** **21/21** executed against real `AuthGuard` + authority harness (not full Nest HTTP stack for billing/org lifecycle).
- **RACE matrix:** **10/10 + org offboarding** executed; **deterministic transaction barriers and advisory-order assertions not implemented** (best-effort `Promise.all` races only).
- **Frontend auth:** **6** vitest cases; **no** legacy JWT refresh upgrade / refresh coalescing / failed-refresh logout specs in repo (no coalescing API in `frontend/src/lib/auth.ts`).
- **Security reset gap:** MFA reset via `IamMfaResetService` blocked on disposable DB missing full `users` profile columns when service uses unconstrained `user.findUnique`.

### Schema drift (`users.first_name`)

Prisma `User.firstName` exists in schema; disposable DB after full migrate lacks `users.first_name`. Root cause: **migration baseline gap** (model ahead of applied migrations on fresh disposable DB). Mitigation in gate path: narrow `activityLog` user/org `include` selects for P1A reads; **not** a production schema claim.

## E5C closeout (2026-11-27)

| Area | Evidence |
|------|----------|
| Request dispatch identity | `frontend/src/lib/auth-api-transport.ts` + **27/27** vitest (`auth-api-transport`, `auth-release-compatibility`) |
| Active refresh head binding | `iam-mfa-step-up.service.ts` + `usr-p2e-e2-mfa-seal.postgres.integration.spec.ts` (E5C head-org mismatch) |
| C02 race correction | `usr-p2e-e1-org-lifecycle.postgres.integration.spec.ts` C02-A/B/C |
| Reset vs MFA contention | `usr-p2e-e2-mfa-seal.postgres.integration.spec.ts` E5C barrier reset-first |

**Historical CI (superseded SHAs):** Earlier queued runs on `421f19f93` / `e2119608d` — replaced by accepted product HEAD below.

## Accepted product HEAD — mandatory CI (frozen evidence)

**Implementation SHA:** `7da011d72c806d3bc17aa0c81fc1f5c397febf6f` (PR **#2534**). Authority merge base: `ffa732998` (PR **#2541**).

| Check | Run | Verdict |
|-------|-----|---------|
| USR-P2 disposable PostgreSQL gate | `46006709524` (job `140535127725`) | **PASS**, exit **0**, `USR_P2_PG_EXECUTED=1` |
| i18n authority protection | `46006706168` | **PASS** |
| Product Catalog P1 + V2 HTTP | `46006709629` | **16/16** |
| VO-5B / VO5C-P4A offboard HTTP | `46006709496` | **20/20** |
| Commit rollup | 65 checks @ `7da011d72` | **64 success**, **1 skipped** (bootstrap N/A), **0 failure** |

Documentation-only governance commits after `7da011d72` **do not** extend this runtime attestation.

## R-008 status

**REMEDIATED_REPO (2026-11-27)** — **USR_P2_REPOSITORY_ACCEPTANCE=PASS** on frozen product HEAD above. **NOT DEPLOYED / NOT PRODUCTION_VERIFIED / NOT COMPLIANCE_REVIEWED / NOT CERTIFIED.** Production release requires **USR-P5** owner authorization.

## Non-goals preserved

No new IAM system, no MFA policy activation, no production deploy/migration, no permanent legacy bypass.