# USR-P2E — Final repository acceptance residuals (E1 execution slice)

P2E scope items C01–C08; **E1-only** acceptance on PR **#2534** branch `cursor/master-users-p2-access-revocation-44c2`.

| ID | Requirement | E1 status (2026-11-26) | Evidence |
|----|-------------|------------------------|----------|
| C01 | True rotation-first revocation contention | **PASS (E1)** | `usr-p2c-deterministic-race.postgres.integration.spec.ts` — `RACE01 rotation-first: revoke waits on rotate fence; successor denied after both commit` (usr-p2-postgres-gate shard) |
| C02 | Organization lifecycle offboarding vs bound issuance + legacy upgrade | **PASS (E1)** | `usr-p2e-e1-org-lifecycle.postgres.integration.spec.ts` — `E1_C02 offboarding execution suspends org and revokes org-bound sessions; unrelated org preserved` (`OrganizationOffboardingService.prepare` + `OrganizationOffboardingExecutionService.execute`, real `RefreshTokenService`) |
| C03 | B10 mutation success + exact security denial assertions | **PASS (E1)** | `usr-p2b-atomic-security-mutations.postgres.integration.spec.ts` — B10 password/MFA/membership shards (mutation must fulfill; old + successor JWT/refresh denied) |
| C04 | Organization role downgrade + RolesGuard | **PASS (E1)** | `usr-p2c-semantic-guard.postgres.integration.spec.ts` — `E1_C04 organization role downgrade denies RolesGuard for stale membershipRole` (`lifecycle.move` role → WORKER; authority + RolesGuard on persisted role) |
| C05 | Custom permission revocation + PermissionsGuard | **PASS (E1)** | same file — `E1_C05 custom permission revocation denies PermissionsGuard for stale JWT` (live DB membership in `PermissionsGuard`) |
| C06 | Platform role downgrade authority | **PASS (E1, documented path)** | same file — `E1_C06 platform role downgrade denies RolesGuard for stale MASTER_ADMIN JWT`. **No dedicated Master Admin HTTP downgrade API** located in repository; evidence uses canonical session invalidation transaction (platformRole → USER + sessionVersion bump) and `RolesGuard` against persisted role. |
| C07 | Public/M2M authentication regressions | **PASS (E1)** | `usr-p2-postgres-gate.sh` — `core-app-m2m-token.http-security.integration.spec.ts` (in-memory HTTP) |
| C08 | Lifecycle routes + session binding | **PASS (E1)** | `usr-p2-postgres-gate.sh` — `org-scoping.organization-status.http-security.integration.spec.ts` (PENDING onboarding allow, operational deny, SUSPENDED deny, MASTER_ADMIN bypass). Vehicle-ownership PG spec remains cited crosswalk probe (separate disposable DB name). |

**Gate execution:** `backend/scripts/test/usr-p2-postgres-gate.sh` — **PASS** (artifact `usr-p2-postgres-gate-e1-final.log`, exit 0, `USR_P2_PG_EXECUTED=1`).

## E2 MFA seal (2026-11-27)

| Area | E2 status |
|------|-----------|
| P2-R22 monotonic TOTP | **PASS** — `resolveAcceptedTotpStep` + PG proofs |
| P2-R23 refresh assurance | **PASS** — TOTP + recovery rotate downgrade |
| P2-R25 step-up grants | **PASS** — E2-G01–G11 + idempotency fix |
| D09 / guards | **PASS** — MasterAdminMfaGuard + StepUpGuard PG |
| Isolation / stale / concurrent | **PASS** — P2D extensions + E2 spec |

Detail: [`USR_P2E_E2_MFA_SEAL.md`](USR_P2E_E2_MFA_SEAL.md).

**R-008** remains **OPEN** until E3–E5 and owner attestation — **E1 PASS**, **E2 PASS** on executed evidence.

## E5B security closeout (2026-11-27)

| Area | Status |
|------|--------|
| Frontend refresh lifecycle | **IMPLEMENTED** — per-stale-access coalescing, multi-rotation, identity-safe in-flight cleanup, stale response cannot overwrite newer access |
| C02 org offboarding concurrency | **IMPLEMENTED** — `C02-A/B/C` on `usr-p2e-e1-org-lifecycle.postgres.integration.spec.ts` |
| Strict step-up grant binding | **IMPLEMENTED** — `iam-mfa-step-up.service.ts` exact scope/version; E2 PG proofs added |
| E3 audit actor/scope replay | **IMPLEMENTED** — missing actor replay denied; org scope binding on outbox match |
| CI verification | **PENDING** — exact-HEAD runs `45987101336` (USR-P2), `45987101532` (Product Catalog), `45987101448` (VO-5B) on `421f19f932500c9cdb7e91442b7ec3d925b3639b` were **not terminal** at E5C implementation start |

## E5C final closeout (2026-11-27)

| Area | Status |
|------|--------|
| Frontend dispatch identity | **IMPLEMENTED** — `captureAuthRequestDispatchIdentity()` wired through `request` / `requestResult` / `fetchBlob`; stale epoch → `Stale request`; delayed old-token 401 without second refresh |
| Active refresh head binding | **IMPLEMENTED** — grant validation checks live refresh head org/membership/session versions |
| C02 offboarding races | **CORRECTED** — execute advisory lock witness; post-offboard denial for issued/rotated credentials regardless of race winner |
| Reset/challenge contention | **IMPLEMENTED** — `E5C concurrent reset-first holds MFA login challenge behind user session lock` (E2 PG) |
| Repository acceptance | **PENDING_CI** on new E5C commit — **R-008 OPEN** until green exact-HEAD gates |