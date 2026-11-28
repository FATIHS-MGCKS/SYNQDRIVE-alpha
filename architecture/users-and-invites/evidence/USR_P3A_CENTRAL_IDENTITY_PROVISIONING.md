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

### P3A-01 audit operation binding (P3A.1 closeout)

- Recursive canonical payload fingerprint (`canonicalizeForFingerprint`); all provision profile scalars + nested `initialMembership` bound
- Creation replay: provision operations match when client binding omits `targetUserId` and stored outbox carries persisted user id
- Profile replay: strict `targetUserId` equality unchanged
- Pre-mutation admission + outbox replay check; `OPERATION_IDEMPOTENCY_CONFLICT` on binding mismatch
- Audit descriptions reference user id (not full email)

### P3A-02 creation concurrency

- `UsersService.createOrgUser({ transactionClient, requireNewGlobalIdentity: true })` for master path — no silent attach on `IDENTITY_ALREADY_EXISTS`
- `acquireIdentityEmailProvisionLock` (advisory class `913_107`)

### P3A-03 provisioning atomicity + delivery recovery

- Org onboarding: single Prisma transaction — identity, membership, invite persist (`persistNewInviteInTransaction`), master audit in-tx; delivery enqueue post-commit only
- `OrganizationStatus.ACTIVE` validated inside authoritative transaction (under org lock)
- `ensureInviteDeliveryContinuity` reuses invite outbox / token rotation (no plaintext in logs) when enqueue missed or on idempotent replay
- `resolveInviteCreateFields` shared with `createInvite` (roles, permissions, station scope parity)

### Profile (P3A-05)

- `master-global-profile.validation.ts` — reject unsupported `null`; validate locale/timezone/date format against platform contracts
- Before/after snapshots from persisted row inside mutation transaction

### Tests (agent, post–P3A.1)

| Command | Result |
|---------|--------|
| `jest --testPathPatterns='master-global\|usr-p3a1\|security-governance-identity'` | **14 passed**, PG suite skipped without opt-in |
| `jest master-global-identity.policy` | **1 passed** |
| `backend npm run build` + `tsc --noEmit` | **passed** |
| `frontend npm run i18n:check` | **passed** (inventory at base) |
| `validate-module-registry.sh` | **passed** |
| `users-and-invites/scripts/validate-graph.sh` | run at seal commit |

### Opt-in Postgres

`USR_P3A1_MASTER_IDENTITY_PG=1` + loopback disposable DB — email uniqueness race, audit idempotency dedup, advisory lock serialization (`usr-p3a1-master-identity.postgres.integration.spec.ts`).

## USR-P3A.2 frontend provisioning + profile (PR #2544)

- **Read contract:** `GET /admin/security/users/:userId` includes `globalProfile` (safe persisted fields, null preserved)
- **Create dialog:** org/role selectors, onboarding modes, authoritative result step (no silent toast-only success)
- **Profile editor:** hydrates from `globalProfile`, changed-fields-only PATCH, generation-bound saves
- **i18n:** new `master.securityAccess.users.create.*` + profile keys in all 9 locales (pl–it rows still English placeholders — native review debt)
- **Tests:** vitest security-access matrix **87** (incl. P1B drawer **13**, USR-P2 auth transport **14**, profile patch **3**, P3A2 F01); playwright **6/6** (desktop/tablet/mobile × light/dark) with synthetic fixtures; screenshots `/opt/cursor/artifacts/p3a2-*.png`
- **Fix:** `ProvisionResultView` capitalized component (lowercase JSX had rendered invalid `<motionresult>` — result panel absent in Playwright)
- **F01–F24 matrix:** partial in vitest (F01, F16 util, P1B F20–F22, stale-role/concurrency in drawer tests); full F-matrix expansion remains pre-production debt

## USR-P3A.3A backend security acceptance (PR #2544)

**Executed (local disposable PG):** `bash backend/scripts/test/usr-p3a3-postgres-gate.sh` → `USR_P3A3_PG_EXECUTED=1` (loopback `127.0.0.1`, DB `usr_p2_p3a3_*`, migrate deploy + IAM parity preflight). **HEAD evidence:** full P3A.1 suite **4/4**, P3A.3 security **12/12**, policy unit **9/9**, **0 skipped**.

| R-ID | Verdict | Notes |
|------|---------|-------|
| R01 | **PASS (partial)** | Fingerprint + PG conflicting fingerprint; policy **9/9** |
| R02 | **PASS (partial)** | Real-stack PG identity/profile replay; outbox-bound `inviteId` |
| R03 | **PASS (partial)** | `acquireInviteDeliveryContinuityLock` (913108); PG concurrent recovery + real invite delivery (mail mocked) |
| R04 | **PASS (partial)** | `credentialSetupRequested` metadata + PG idempotent credential replay (no duplicate reset mail) |
| R05 | **PARTIAL** | PG lock-wait **PASS** (p3a1 + p3a3); HTTP still harness **7/7** — full A01–A24 disposable-PG guards **NOT_EXECUTED** |
| R06 | **PASS (partial)** | PG duplicate email + timezone; real org provision paths in R03/R04 cases |

**Critical fix:** `master-admin-audit-privacy.util.ts` now retains `operationBinding`, `inviteId`, `membershipId`, `inviteByEmail` in persisted metadata (replay was fail-closed when binding was stripped).

### P3A.3B frontend residuals (record only)

| ID | Record |
|----|--------|
| P3A-FR01 | Immutable idempotency payload binding + operation-conflict UX |
| P3A-FR02 | Profile draft vs unrelated refresh + generation binding |
| P3A-FR03 | Org role clear/disable while roles load |
| P3A-FR04 | Seven locales English placeholders for new security-access keys |
| P3A-FR05 | Credential setup UI gated until full R04 E2E proof |

### A01–A24 matrix (this iteration)

| Case | Result |
|------|--------|
| A01 | **PASS** (HTTP harness, mocked service) |
| A02–A03b | **PASS** (existing HTTP harness) |
| A04–A05, A08–A24 | **NOT_EXECUTED** (requires full Nest + disposable PG security harness) |
| A06–A07 | **PASS** (HTTP / DTO contract) |

**P3A1_SECURITY_ACCEPTANCE=PENDING_P3A3B** — partial R + partial A; **no merge readiness**.

### CI authority

`usr-p3a3-postgres-gate.sh` is **not** wired into `.github/workflows` (scope freeze). Design: `architecture/users-and-invites/evidence/USR_P3A3_CI_AUTHORITY_PROPOSAL.md`. **NEW_CI_AUTHORITY_REQUIRED=YES** (separate authority PR; not in #2544).

## Remaining matrix (P3A.3B)

Full A01–A24 on disposable PG with real guards, lost-ack replay E2E, org-provision + invite acceptance PG, concurrent recovery scenarios, and CI gate wiring.