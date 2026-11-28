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

**Executed (local disposable PG):** `bash backend/scripts/test/usr-p3a3-postgres-gate.sh` → `USR_P3A3_PG_EXECUTED=1` (loopback `127.0.0.1`, DB `usr_p2_p3a3_*`, migrate deploy + IAM parity preflight). **Gate evidence (post credential authority seal):** P3A.1 **4/4**, P3A.3 security **12/12**, **transaction + invitation 20/20**, **L-matrix 10/10**, **E-matrix 10/10**, **credential C+FLE 8/8**, **HTTP authorization 15/15**, policy unit **9/9**, IAM invite acceptance **14/14**, **102/102 total**, **0 skipped**, exit **0**.

**Atomic invitation delivery (P3A.3A tx seal):** encrypted `inviteEmailOutbox` rows are created inside the same Prisma transaction as invite create/resend/recovery token rotation (+ IAM rotation audit on recovery). SMTP runs only via `processOutboxIds` after commit. Stale generations are suppressed at dispatch (`STALE_TOKEN_GENERATION` / `INVITE_NOT_PENDING`). Not exactly-once SMTP — in-flight transport may complete after supersede (documented).

**USR-P3A.3A real HTTP authorization (PR #2544):** `createUsrP3a3IdentityHttpApp` — real `AuthGuard` (APP_GUARD), `RolesGuard`, `MasterAdminMfaGuard`, `StepUpGuard`, `UserAccessAuthorityService`, `IamMfaStepUpService`, `MasterGlobalIdentityService` via `createUsrP3a3IdentityPgStack`; signed access JWTs + persisted session families; MFA/step-up flags enabled in disposable env; `ValidationPipe` whitelist + forbidNonWhitelisted; only `TransactionalMailService` mocked. Preliminary mocked harness (`security-governance-identity.http-security.integration.spec.ts` **7/7**) retained as non-authoritative.

| R-ID | Verdict | Notes |
|------|---------|-------|
| R01 | **PASS (partial)** | Fingerprint + PG conflicting fingerprint; policy **9/9** |
| R02 | **PASS (partial)** | Real-stack PG identity/profile replay; outbox-bound `inviteId` |
| R03 | **PASS (partial)** | Continuity lock + **single recovery generation** (exact live outbox idempotency); atomic rotation + delivery intent in one tx |
| R04 | **PASS (partial)** | `credentialSetupRequested` metadata + PG idempotent credential replay (no duplicate reset mail) |
| R05 | **PASS (partial)** | PG lock-wait + **real HTTP H01–H10** on disposable PG (see below); full A01–A24 matrix **not** claimed |
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

### HTTP authorization subset (H01–H10, disposable PG)

| ID | Mapping | Result |
|----|---------|--------|
| H01 | A01 authorized create + audit | **PASS** |
| H02 | A02 unauthenticated | **PASS** |
| H03 | A03 org admin denied | **PASS** |
| H04 | A04 billing delegate denied | **PASS** |
| H05 | A05 revoked JWT | **PASS** |
| H06 | A06 MFA/step-up matrix | **PASS** (invalid step-up → `STEP_UP_EXPIRED`; explicit clock-skew expiry case not split) |
| H07 | A07 DTO / unknown fields | **PASS** |
| H08 | A17 profile update | **PASS** |
| H09 | A18 forbidden patch fields | **PASS** |
| H10 | A19 legacy `/admin/users` parity | **PASS** |

`FULL_NEST_BOOT` — bounded Nest module for identity HTTP surface (DI resolve `MasterGlobalIdentityService`, `GET /api/v1/health`, `SELECT 1`; not full `AppModule` — Redis/workers absent in disposable runner).

### A01–A24 matrix (honest scope)

| Case | Result |
|------|--------|
| A01–A07, A17–A19 | **PASS** (disposable PG real HTTP, subset above) |
| A08–A16, A20–A24 | **NOT_EXECUTED** (P3A.3B / expanded matrix) |
| Preliminary mocked harness | **7/7** (non-authoritative) |

**P3A3A_HTTP_AUTHORIZATION=CONDITIONAL_PARTIAL** — H01–H10 executed; **no full A01–A24**; **no merge readiness**.

### Transaction + invitation PG matrix (T01–T17)

| ID | Result | Maps (A-matrix) |
|----|--------|-----------------|
| T01 | **PASS** | identity replay / A04 partial |
| T02 | **PASS** | org provision replay binding |
| T03 | **PASS** | R06 email uniqueness |
| T04 | **PASS** | concurrent idempotency |
| T05 | **PASS** | commit + lost ack replay |
| T06 | **PASS** | cross-actor denial |
| T07 | **PASS** | audit failure rollback |
| T08 | **PASS** | invite failure rollback |
| T09 | **PASS** | delivery intent failure rollback |
| T10 | **PASS** | concurrent recovery generation |
| T11 | **PASS** | stale delivery suppression |
| T12 | **PASS** | accept + recovery token parity (credentialless, no pre-auth) |
| T13 | **PASS** | revoke fences recovery |
| T14 | **PASS** | authoritative accept (credentialless, no pre-auth) |
| T15 | **PASS** | single semantic CREATE log |
| T16 | **PASS** | org lifecycle fence |
| T17 | **PASS** | invite/membership role parity |

**P3A3A_TRANSACTION_INVITATION=CONDITIONAL_PARTIAL** — core R01/R02/R03/R06 invariants exercised; **not** full repository acceptance.

### Actual first-login (L01–L12, public HTTP, disposable PG)

**Root cause:** Master provisioning persists `User` + `INVITED` membership before invite acceptance (`passwordHash = null`). `InviteAcceptService` required authentication for any existing user while only setting passwords when no user row existed — credentialless recipients deadlocked.

**Correction:** `canEstablishInitialCredentialsViaInvite` policy + `credentiallessFirstLogin` branch in `InviteAcceptService` (authoritative membership `INVITED`, `UserPlatformRole.USER`, `ACTIVE`, no password). Established accounts, suspended users, and privileged platform roles remain auth-gated.

| ID | Result | Notes |
|----|--------|-------|
| L01 | **PASS** | MA provision + encrypted delivery outbox |
| L02 | **PASS** | captured invite URL token |
| L03–L06 | **PASS** | unauthenticated accept + `POST /api/v1/auth/login` + `validateAccessJwt` |
| L07 | **PASS** | idempotent accept (no duplicate identity/membership) |
| L08 | **PASS** | established password requires auth |
| L09 | **PASS** | suspended identity denied |
| L09b | **PASS** | privileged platform role denied credentialless path |
| L10 | **PASS** | revoked/invalid token denied |
| L11 | **PASS** | stale generation after recovery rotation; invite continuity lock `pg_backend_pid` barrier |
| L12 | **PASS** | accept after revocation denied |

**Harness:** `usr-p3a3-first-login-http-pg.harness.ts` — real `PublicInvitesController` + `AuthController`, canonical P2/P3 stack; mock mail transport only. Opt-in: `USR_P3A3_FIRST_LOGIN_HTTP_PG=1`.

**R04 (`sendCredentialSetup` admin path):** still **OPEN** — optional admin credential reset not expanded; first-login uses invite accept + bcrypt only (no parallel credential authority).

**P3A3A_FIRST_LOGIN=CONDITIONAL_PARTIAL** — proves public HTTP onboarding for MA-provisioned credentialless identities; **not** full A01–A24; **no merge readiness**.

### First-login security edge seal (FL-01 / FL-02, PR #2544)

**Operation:** `SYNQDRIVE_MASTER_USERS_P3A3A_FIRST_LOGIN_SECURITY_EDGE_SEAL`

**FL-01 provisioning binding:** `OrganizationUserInvite.provisionedUserId` + `provisionedMembershipId` (migration `20261128110000_organization_invite_provision_binding`); master org onboarding persists binding in invite create tx; `evaluateInitialCredentialEligibility` fail-closes on missing/mismatch + security snapshot (MFA, refresh sessions, platform grants); public `validateInviteToken` exposes same `initialCredentialEligible` semantics as accept.

**FL-02 atomic first credential:** accept path reloads invite/membership/user inside `acquireInviteDeliveryContinuityLock` + `acquireCanonicalSecurityMutationLocks`; conditional `user.updateMany` (`passwordHash: null`, `ACTIVE`, `USER`); invite consume `updateMany` on `PENDING`; `resendInvite` / `revokeInvite` / `markExpired` fenced with continuity lock + pending CAS; `PasswordPolicyService` on accept.

| ID | Result |
|----|--------|
| E01 | **PASS** — L03–L06 bound provision path |
| E02 | **PASS** — unbound invite → `PROVISIONING_BINDING_INVALID` |
| E03 | **PASS** — MFA identity denied initial path |
| E04 | **PASS** — one `updateMany` password admit; single activation |
| E05 | **PASS** — established `passwordHash` not overwritten |
| E06 | **PASS** — stale token after recovery rotation rejected |
| E07 | **PASS** — accept∥revoke; authoritative final invite state; optional `pg_blocking_pids` on holder |
| E08 | **PASS** — expired invite + weak password denied |
| E09 | **PASS** — suspended / protections exercised |
| E10 | **PASS** — preview parity with accept eligibility |

**Gate (agent):** `bash backend/scripts/test/usr-p3a3-postgres-gate.sh` → **94/94** (4+12+20+10 L-matrix + **10 E-matrix** +15+9+14), **0 skipped**, exit **0**; `tsc --noEmit` + `npm run build` **passed**; `validate-module-registry.sh` + `users-and-invites/scripts/validate-graph.sh` **passed**.

**L-matrix deltas:** L09/L09b expect **400** on ineligible identity; L11 advisory-only pid barrier removed (E07 carries overlap proof).

**P3A3A_FIRST_LOGIN_SECURITY=CONDITIONAL_PARTIAL** — FL-01/FL-02 sealed in repo; **not** merge/deploy/production.

### Final credential authority seal (FL-R01 / FL-R02 / R04, PR #2544)

**Operation:** `SYNQDRIVE_MASTER_USERS_P3A3A_FINAL_CREDENTIAL_AUTHORITY_SEAL`

**FL-R01:** `InviteAcceptService` reloads authoritative user inside mutation locks; revalidates optional auth via `UserAccessAuthorityService.validateAccessJwt`; membership lifecycle / rejoin checks use in-tx membership rows for established identities.

**FL-R02:** Canonical lock order documented in `iam-identity-mutation-lock-order.ts`; provisioning uses op → org → email; invite accept uses continuity → org → email (net-new).

**R04:** `master_identity_credential_setup_intents` + `password_reset_tokens.security_operation_id`; durable intent in provision tx; post-commit `continueCredentialSetupForOperation` + `requestAdminResetBoundToOperation`; audit payload no longer mutated for workflow state; confirm marks `credentialEstablishedAt`.

| Matrix | Result |
|--------|--------|
| C01–C05 | **PASS** (provision → intent → mock transport → reset confirm → login) |
| C06–C07 | **PASS** (replay + concurrent admission) |
| C09–C11 | **PASS** (unrelated reset isolation, ineligible deny, revoked token) |
| C10 | **PASS** (suspended) |
| C08/C12 | **PARTIAL** (recovery covered by intent continuation + transport mocks; no operator secret exposure in responses) |
| FLE04–FLE05 | **PASS** |
| E01–E10 + L-matrix | **PASS** (regression via gate) |

**Gate (agent):** `usr-p3a3-postgres-gate.sh` **102/102** (prior 94 + credential authority **8/8**), exit **0**.

**P3A3A_CREDENTIAL_AUTHORITY=CONDITIONAL_PARTIAL** — R04 path proven on disposable PG; **FR01–FR05** still open; **no merge/deploy**.

### Credential delivery final edge seal (CR01–CR03, PR #2544)

**Operation:** `SYNQDRIVE_MASTER_USERS_P3A3A_CREDENTIAL_DELIVERY_FINAL_EDGE_SEAL`

**CR01:** `MasterCredentialSetupDeliveryService` — persist token + intent (`delivery_generation`, encrypted `delivery_token_ciphertext`) inside security-op tx; SMTP **post-commit**; `transport_confirmed_at` truth; failed transport retry without classifying token existence as delivery success.

**CR02:** `evaluateOperationBoundCredentialSetupConfirm` + `PasswordResetService.confirmReset` CAS (`passwordHash: null`, single token admit, intent `credentialEstablishedAt`) for `securityOperationId` tokens.

**CR03:** Operation-scoped revoke preserved; unrelated `security_operation_id: null` admin resets not revoked on provision replay; operation-bound rate buckets keyed per `securityOperationId`.

| ID | Result |
|----|--------|
| D01–D10 | **PASS** (`usr-p3a3-credential-delivery-edge.postgres.integration.spec.ts`) |
| C01–C11 + FLE + prior matrices | **PASS** (regression via gate) |

**Gate (agent):** `usr-p3a3-postgres-gate.sh` **113/113**, exit **0**; `npm run build` + `tsc` **passed**; `i18n:check` **passed**; `validate-module-registry.sh` **passed**.

**`main` sync:** merged `origin/main` at `e8c2422064309501dc31685ddca4ab16966b3cea`; `hardcoded-copy-inventory.json` restored from trusted `main`.

**BACKEND_IMPLEMENTATION_FROZEN=YES** (CR01–CR03 closure); **A01–A24**, **AppModule boot**, **FR01–FR05** remain acceptance blockers.

### P3A.3B frontend integration seal (PR #2544)

**Operation:** `SYNQDRIVE_MASTER_USERS_P3A3B_FRONTEND_INTEGRATION_SEAL`

**Governance:** `hardcoded-copy-inventory.json` restored to trusted `main` (empty three-dot PR diff after commit).

**CR-R01–R03:** Transport ack fenced by `intentId` + `deliveryGeneration` + `passwordResetTokenId`; retry uses persisted `expiresAt`; obsolete reset tokens revoked after successful mutation; ciphertext cleared after transport confirm / completion.

**FR01–FR05:** Immutable submitted create/profile operations; org/role isolation; nine-locale strings for P3A onboarding copy; truthful credential/invite delivery UI.

**P3A3B_VERDICT=CONDITIONAL_PARTIAL** — core UI + targeted tests; **P3A3C** (A01–A24, AppModule boot, CI authority) outstanding.

### P3A.3B final frontend acceptance (PR #2544)

**Operation:** `SYNQDRIVE_MASTER_USERS_P3A3B_FINAL_FRONTEND_ACCEPTANCE`  
**Verified HEAD:** `e8d56b2059faaaeb05bae43a7f86877f69256e63` (local = remote PR head at agent run).

| Area | Status |
|------|--------|
| FR01 submitted-operation UI | **IMPLEMENTED** — form lock + immutable payload retry; `OPERATION_IDEMPOTENCY_CONFLICT` before generic 409; generation invalidation on close |
| FR02 authoritative profile | **IMPLEMENTED** — `getUser` reload after PATCH; discard draft; dirty preserve on background refresh |
| FR03 role scope | **IMPLEMENTED** — request-id fence, load error state, submit guard when roles invalid/loading |
| FR04 nine locales | **IMPLEMENTED** for P3A create/onboarding/result keys (pl, fr, cs, nl, es, tr, it translated; native review debt remains) |
| FR05 onboarding UX | **IMPLEMENTED** — result binds `submittedOnboardingMode`; pending delivery retry on result step |
| Step-up | **IMPLEMENTED** — `useMasterIdentityPrivilegedMutations` + `MasterApp` retry after MFA; hook test executed |
| Vitest F-matrix | **EXECUTED** — `master-security-access-p3a3b-f-matrix.ui.test.tsx` **5/5**; `useMasterIdentityPrivilegedMutations.test.ts` **1/1**; P3A2/locale/stale **8/8** |
| Playwright | **EXECUTED** — `e2e/master-security-access-p3a2-provisioning.spec.ts` **66/66**, exit **0** (webServer `127.0.0.1:5173`) |
| `npm run build` | **PASS** |
| `npm run i18n:check` | **PASS** |
| `validate-module-registry.sh` | **PASS** |
| Protected inventory diff | **EMPTY** (restored from `origin/main`) |

**F01–F24 crosswalk:** F03, F05, F07, F09, F16 evidenced in vitest; F01/F23 partial via P3A2 + locale tests; responsive F01–F24 flows partially covered by Playwright fixture spec (not per-id matrix file). Remaining explicit per-case UI tests: backlog for P3A3C.

**P3A3B_FINAL_VERDICT=CONDITIONAL_COMPLETE** (frontend acceptance scope; backend frozen). **P3A3C_READY=NO**.

### P3A.3C final repository acceptance (PR #2544)

**Operation:** `SYNQDRIVE_MASTER_USERS_P3A3C_FINAL_REPOSITORY_ACCEPTANCE`  
**Baseline main:** `e8c2422064309501dc31685ddca4ab16966b3cea`  
**Candidate HEAD:** `d6c674a2ae69fd3ee2022f54ee7bf08a4078a021`

| Gate | Command | Exit | Result |
|------|---------|------|--------|
| P3A PG gate | `bash backend/scripts/test/usr-p3a3-postgres-gate.sh` | 0 | **116/116** tests (suites: 4+12+20+10+10+8+14+15+9+14) |
| Backend build | `cd backend && npm run build` | 0 | PASS |
| Backend typecheck | `npx tsc -p tsconfig.build.json --noEmit` | 0 | PASS |
| Frontend build | `cd frontend && npm run build` | 0 | PASS |
| Frontend typecheck | `npx tsc -p tsconfig.app.json --noEmit` | 0 | PASS |
| i18n PR gate | `cd frontend && npm run i18n:check` | 0 | PASS |
| Registry | `bash architecture/scripts/validate-module-registry.sh` | 0 | PASS |
| Users graph | `bash architecture/users-and-invites/scripts/validate-graph.sh` | 0 | PASS |

**FE-R01 (admission fence):** frozen `MasterIdentityPendingOp` + pre-dispatch `assertStillAdmitted` + `authDispatchIdentityMatches`; vitest **2/2** in `useMasterIdentityPrivilegedMutations.test.ts`. Header transport: canonical `x-step-up-token` via `auth-api-transport.ts` (existing).

**FE-R02 (profile draft):** freeze inputs while save/pending; authoritative `getUser` after PATCH; preserve unsent overlay; definitive 400 clears operation key.

**FE-R03 (browser):** `master-security-access-p3a3c-acceptance.spec.ts` — **24 passed, 3 skipped** (step-up OTP overlay; vitest covers retry fence). **66/66** retained on `master-security-access-p3a2-provisioning.spec.ts`. Screenshots: `p3a3c-create-form-before-submit.png`, `p3a3c-org-invite-result.png`, p3a2 form/result/profile (fixed pre-submit form capture).

**Full Nest HTTP boot (bounded):** `FULL_NEST_BOOT` in `usr-p3a3-identity-http-security.postgres.integration.spec.ts` — `MasterGlobalIdentityService` DI + `/api/v1/health` 200 on disposable PG harness (`createUsrP3a3IdentityHttpApp`). **Not** full production `AppModule` import.

**A01–A24 crosswalk (executed PG/HTTP highlights):**

| ID | Evidence |
|----|----------|
| A01 | H01 identity HTTP; R01/R04 master-identity-security |
| A02 | H02 |
| A03 | H03 |
| A04 | H04 |
| A05 | H05 |
| A06 | H06 suite (incl. wrong-family grant) |
| A07 | H07 |
| A08 | R06 duplicate email |
| A09–A11 | T04/T05/T09–T12 transaction-invitation |
| A12–A14 | R-cross-tenant + rollback suites (master-identity-security / transaction) |
| A15–A16 | Audit / no credential exposure (C/L/R cases) |
| A17–A18 | H08/H09 |
| A19 | H10 legacy |
| A20 | IAM REMOVED isolation (invite specs) |
| A21–A22 | first-login HTTP + security edge |
| A23 | R01 audit dedup lock |
| A24 | USR-P2 invariants preserved via gate IAM regression |

**F01–F24 crosswalk:** Vitest matrix (F03,F05,F07,F09,F16); P1B drawer/locale/nav/shell/privileged **54** tests; P3A2 Playwright **66**; P3A3C Playwright **24** (org invite, credential, ambiguous retry, responsive desktop/tablet/mobile × light/dark).

**B01–B03:** CR/D/R delivery-edge + credential-authority PG specs; H06 HTTP edge (same-user different session: H06d cross-principal grant); clock-expired: invalid token (H06c); forbidden PATCH (H09). **B03 gap:** explicit clock-expired issued grant test not added (optional debt).

**PRODUCT_REPOSITORY_ACCEPTANCE=CONDITIONAL_PASS** — FE-R01/R02 implemented and tested; PG **116/116**; browser step-up auto-retry E2E **NOT_EXECUTED** (skipped; vitest + HTTP MFA). **MERGE_READINESS=BLOCKED_CI_AUTHORITY** (P3A PG not in GitHub CI + full `AppModule` boot not demonstrated).

### CI authority

`usr-p3a3-postgres-gate.sh` is **not** wired into `.github/workflows` (scope freeze). Design: `architecture/users-and-invites/evidence/USR_P3A3_CI_AUTHORITY_PROPOSAL.md`. **NEW_CI_AUTHORITY_REQUIRED=YES** (separate authority PR; not in #2544).

## Remaining matrix (P3A.3B)

Full A01–A24 on disposable PG with real guards, lost-ack replay E2E, org-provision + invite acceptance PG, concurrent recovery scenarios, and CI gate wiring.