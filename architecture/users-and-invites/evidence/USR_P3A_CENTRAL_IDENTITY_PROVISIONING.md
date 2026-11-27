# USR-P3A — Central identity provisioning (repository evidence)

**Baseline:** `3de62a1777a5e096bede0f4b1eacd34525b4dffc` (`main` post PR #2542)  
**Scope:** Master Admin global identity create + governed profile patch; legacy `admin/users` forwarding.  
**Not claimed:** merge, deploy, production verification, compliance certification, flag arm.

## Canonical authority

| Item | Value |
|------|--------|
| Service | `MasterGlobalIdentityService` (`backend/src/modules/users/master-global-identity.service.ts`) |
| Create | `POST /api/v1/admin/security/users` |
| Profile | `PATCH /api/v1/admin/security/users/:userId` |
| Legacy create/update | `POST/PATCH /api/v1/admin/users` → same service |
| Audit | `PLATFORM_USER_CREATED` / `PLATFORM_USER_UPDATED` via `MasterAdminAuditDeliveryService` |
| Profile allowlist | `MASTER_GLOBAL_PROFILE_ALLOWLIST` in `policies/master-global-profile.policy.ts` |
| Email change | **Not supported** on profile PATCH (documented restriction) |
| Onboarding | Identity-only create; org path reuses `UsersService.createOrgUser` + `OrganizationInviteService.createInvite` |

## F004 / R013 status

- **F004:** **PARTIAL** — central provisioning + profile edit implemented; roles/suspension/P3B and full legacy retirement remain.
- **R013:** **OPEN** — legacy read/password/delete paths inventoried for P3D; mutations now forward to canonical service.

## Tests executed (agent)

- `jest --testPathPatterns='master-global-identity|security-governance-identity'` — **3 passed**
- `frontend npm run i18n:check` — **passed** (new `master.securityAccess.users.create*` keys in all 9 locales)
- `backend npx tsc --noEmit` — **passed**

## USR-P3A.1 backend authority transaction seal (same PR #2544)

**Date:** 2026-11-27 (agent)  
**Governance:** Restored `frontend/src/i18n/hardcoded-copy-inventory.json` to PR base `3de62a177` (no authority change; fixes i18n PR gate EXIT_CODE=3).

### P3A-01 audit operation binding

- `MasterIdentityOperationBinding` + server-derived audit idempotency keys in `policies/master-global-identity-operation.policy.ts`
- Client `idempotencyKey` → `securityOperationId` only; audit outbox key binds actor, action, target, org, normalized email, payload fingerprint
- Pre-mutation admission + outbox replay check; `OPERATION_IDEMPOTENCY_CONFLICT` on binding mismatch
- Audit descriptions reference user id (not full email)

### P3A-02 creation concurrency

- `UsersService.createOrgUser({ transactionClient, requireNewGlobalIdentity: true })` for master path — no silent attach on `IDENTITY_ALREADY_EXISTS`
- `acquireIdentityEmailProvisionLock` (advisory class `913_107`)

### P3A-03 provisioning atomicity

- Org onboarding: single Prisma transaction — identity, membership, invite persist (`persistNewInviteInTransaction`), master audit in-tx; delivery enqueue post-commit only
- `OrganizationStatus.ACTIVE` gate; credential setup without org → `CREDENTIAL_SETUP_REQUIRES_ORG`

### Profile (P3A-05)

- `master-global-profile.validation.ts` — reject unsupported `null`; validate locale/timezone/date format against platform contracts
- Before/after snapshots from persisted row inside mutation transaction

### Tests (agent, post–P3A.1)

| Command | Result |
|---------|--------|
| `jest --testPathPatterns='master-global\|usr-p3a1\|security-governance-identity'` | **4 passed**, 1 skipped (PG opt-in) |
| `jest master-global-identity.policy` | **1 passed** |
| `backend npm run build` + `tsc --noEmit` | **passed** |
| `frontend npm run i18n:check` | **passed** (inventory at base) |
| `validate-module-registry.sh` | **passed** |
| `users-and-invites/scripts/validate-graph.sh` | run at seal commit |

### Opt-in Postgres

`USR_P3A1_MASTER_IDENTITY_PG=1` + loopback disposable DB — email uniqueness race, audit idempotency dedup, advisory lock serialization (`usr-p3a1-master-identity.postgres.integration.spec.ts`).

## Remaining matrix (not executed this PR)

Full A01–A24 with **real** AuthGuard/MFA/step-up on disposable Postgres (current HTTP spec mocks identity service), commit-then-lost-ack replay E2E, Playwright responsive flows (P3A.2), and CI green on pushed HEAD.