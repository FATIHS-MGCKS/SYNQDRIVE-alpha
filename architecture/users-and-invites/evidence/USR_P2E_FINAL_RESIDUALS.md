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

**Historical (pre-acceptance):** R-008 remained **OPEN** until E3–E5 and owner attestation — **E1 PASS**, **E2 PASS** on executed evidence (frozen).

## E5B security closeout (2026-11-27)

| Area | Status |
|------|--------|
| Frontend refresh lifecycle | **IMPLEMENTED** — per-stale-access coalescing, multi-rotation, identity-safe in-flight cleanup, stale response cannot overwrite newer access |
| C02 org offboarding concurrency | **IMPLEMENTED** — `C02-A/B/C` on `usr-p2e-e1-org-lifecycle.postgres.integration.spec.ts` |
| Strict step-up grant binding | **IMPLEMENTED** — `iam-mfa-step-up.service.ts` exact scope/version; E2 PG proofs added |
| E3 audit actor/scope replay | **IMPLEMENTED** — missing actor replay denied; org scope binding on outbox match |
| CI verification | **SUPERSEDED** — prior queued runs on older SHAs; see **Accepted product HEAD** below |

## E5C final closeout (2026-11-27)

| Area | Status |
|------|--------|
| Frontend dispatch identity | **IMPLEMENTED** — `captureAuthRequestDispatchIdentity()` wired through `request` / `requestResult` / `fetchBlob`; stale epoch → `Stale request`; delayed old-token 401 without second refresh |
| Active refresh head binding | **IMPLEMENTED** — grant validation checks live refresh head org/membership/session versions |
| C02 offboarding races | **CORRECTED** — execute advisory lock witness; post-offboard denial for issued/rotated credentials regardless of race winner |
| Reset/challenge contention | **IMPLEMENTED** — `E5C concurrent reset-first holds MFA login challenge behind user session lock` (E2 PG) |
| i18n PR gate | **FIXED** on `bded2167d` — restored `hardcoded-copy-inventory.json` (accidental regen in E5C); `GOVERNANCE_AUTHORITY_CHANGED` cleared |
| E5C CI stabilization | **PUSHED** `bded2167d` — C02 infra guards; step-up `membershipVersion`; MFA reset/login cross-connection contention |
| C02-A remediation | **IMPLEMENTED** — org fence in `completeSessionsUnderActiveLease`; C02-A uses `IAM_ORG_SESSION_WRITE_LOCK_CLASS` holder (not execute hashtext lock) |
| Authority split | **MERGED** — Authority PR **#2541** → `main` @ `ffa732998ac9dd366147508537e254c301c8b993`; product PR excludes workflow diff |
| Repository acceptance | **PASS** — see § Accepted product HEAD (runtime frozen @ `7da011d72`) |

## Accepted product HEAD — repository acceptance seal (2026-11-27)

**Frozen implementation SHA (product/runtime):** `7da011d72c806d3bc17aa0c81fc1f5c397febf6f`  
**PR base after authority merge:** `ffa732998ac9dd366147508537e254c301c8b993`  
**Owner authorization:** conditional governance closeout + merge (this seal).  
**Documentation-only commits after this SHA do not re-run or re-claim the evidence below.**

| Gate | Run / job | Result |
|------|-----------|--------|
| USR-P2 PostgreSQL | workflow `46006709524`, certification job `140535127725` | **PASS**, `USR_P2_PG_EXECUTED=1`, gate exit **0** |
| i18n authority protection | `46006706168` | **PASS** |
| Product Catalog disposable | `46006709629` | **PASS**, HTTP **16/16** |
| Vehicle Onboarding VO-5B | `46006709496` | **PASS**, offboard HTTP **20/20** |
| i18n new debt | `46006709571` | **PASS** |
| Bootstrap on product PR | classify | **BOOTSTRAP_ELIGIBLE=NO**, validation **NOT_APPLICABLE** (skipped) |

| Slice | Evidence @ `7da011d72` |
|-------|-------------------------|
| C02-A/B/C | **PASS** (CI log, org session write lock class) |
| E2 MFA seal | **38/38** |
| E3 audit | **23/23** |
| Reset-first / MFA-first contention | **PASS** |
| Strict step-up grant binding | **PASS** (E2-G + E5B/C shards in gate log) |
| Cross-replica authority | **PASS** (P2C + E4 shards) |

**R-008_STATUS=REMEDIATED_REPO** | **USR_P2_REPOSITORY_ACCEPTANCE=PASS**  
**PRODUCTION_VERIFIED=NO** | **COMPLIANCE_REVIEWED=NO** | **CERTIFIED=NO** | **DEPLOYED=NO** | **FLAGS_ARMED=NO**

**Next controlled work:** **USR-P5** production schema preflight + owner-authorized release/cutover per [`USR_P2E_E4_RELEASE_COMPATIBILITY.md`](USR_P2E_E4_RELEASE_COMPATIBILITY.md) — not authorized by this seal.