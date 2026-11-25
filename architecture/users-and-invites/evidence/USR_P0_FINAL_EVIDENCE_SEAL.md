# USR_P0 — Final evidence seal (2026-11-25)

**PR:** #2530 · **Seal type:** governance + characterization · **Runtime remediation:** not in scope

## R008 — Request-time authorization and stale access

### JWT TTL

- Default `JWT_EXPIRES_IN` / `app.jwtExpiresIn`: **24h** (`backend/src/config/app.config.ts`)
- Refresh issue path uses same TTL (`refresh-token.service.ts`)
- Harness/tests often use **15m**

### Access vs refresh

| Layer | Invalidation mechanism | Request-time DB checks |
|-------|------------------------|-------------------------|
| **Refresh token** | Row `revoked_at`, version mismatch, user `status !== ACTIVE`, membership binding | **YES** on `/auth/refresh` |
| **Access JWT** | Cryptographic expiry only on most routes | **NO** in `AuthGuard` (no `sessionVersion` / status re-read) |

### Session identity binding

Access JWT payload includes `sessionVersion`, `membershipId`, `platformPermissions`, `platformRole` — **not** refresh-token row id (`signAccessToken`).

**Single-session revoke** revokes refresh row; **access JWT remains valid until exp** for MA routes using JWT claims only.

### Effective revocation matrix

| Event | Refresh next call | Org-scoped route (OrgScopingGuard) | MA `/admin/*` (RolesGuard + JWT) | Billing delegate route |
|-------|-------------------|-------------------------------------|-----------------------------------|-------------------------|
| Global account suspend | **DENY** (`user.status`) | N/A if no refresh | **ALLOW until JWT exp** | DB grant + guard mix |
| Platform role downgrade (JWT stale) | Re-issue on refresh if versions bump | JWT role until exp | **ALLOW until JWT exp** | — |
| Platform permission revoke | Next refresh drops claim | — | **ALLOW until JWT exp** unless route uses DB guard | **MasterBillingGuard → DENY** (platform-permission-jwt.integration) |
| Membership suspend/remove | **DENY** binding | **DENY** (DB ACTIVE membership) | JWT may still show old org context until exp | — |
| Single session revoke | Revoked row **DENY** | — | Other sessions' access JWTs unaffected | — |
| All-session revoke | All rows revoked | — | Access JWTs unaffected until exp | — |
| Password / MFA reset | Policy bumps versions / revokes per `IamSessionPolicyService` | — | Stale access window remains | — |
| Global delete | Tokens revoked in pipeline | **DENY** | **DENY** after exp only if JWT still valid | — |

**Characterization evidence:** `platform-permission-jwt.integration.spec.ts` **3/3 PASS** (DB grant vs JWT); `iam-session-invalidation.policy.ts` documents access-token residual note.

**Severity reassessment:** **P1** for **privileged platform access** (MASTER_ADMIN + stale `platformRole` / permissions on `/api/v1/admin/*`) — **CONFIRMED_SECURITY_GAP** until USR-OWN-02 implementation. Org tenant routes partially mitigated by `OrgScopingGuard` DB membership check.

## R009 — API inventory accuracy

**Canonical count:** **98** unique method+path combinations in USR_P0 IAM scope (see [USR_P0_COMPLETE_API_INVENTORY.md](USR_P0_COMPLETE_API_INVENTORY.md)).

**78 discrepancy:** prior summary under-counted or excluded auth/account/MFA/retention slices; **98** is the reconciled static controller scan.

## R010/R011 — Disposable PG safety

- Preflight: `usr-p0-disposable-postgres-preflight.ts` (localhost + disposable name pattern)
- Single Prisma `$transaction`; `SET TRANSACTION READ ONLY`; `SHOW transaction_read_only` asserted
- **19** pinned SELECT statements
- **Test result:** `USR_P0_INVENTORY_PG=1` → **2/2 PASS** (2026-11-25)

## R012 — MFA orchestration

When `mfaStepUpEnforced` and enrolled:

- **Session revoke:** `MasterAdminMfaGuard(MASTER_USER_MANAGEMENT)` + `StepUpGuard(REVOKE_OTHER_USER_SESSIONS)` — fresh JWT MFA **or** matching step-up grant per action (`step-up.guard.ts`, `master-admin-mfa.guard.ts`)
- **MFA reset other user:** `StepUpGuard(MFA_RESET_OTHER_USER)`
- **Billing grant:** `MasterAdminMfaGuard(MASTER_USER_MANAGEMENT)` only — repository test documents intentional scope

**Verdict:** End-to-end enforcement **flag-dependent**; guard registration ≠ enforced when `masterAdminMfaEnabled` false. **Not** a guaranteed unconditional MFA matrix.

## R013 — Legacy `admin/users`

| Route | Guards | Service behavior | Risk |
|-------|--------|------------------|------|
| GET `admin/users` | MASTER_ADMIN | `findAll` / `findByOrganization` | Legacy UI fetch |
| POST/PATCH | MASTER_ADMIN + MasterAdminMfa* | `create`/`update` global email/name only | Parallel authority vs MA hub |
| POST change-password | +StepUp + MFA | **Direct password hash write** | Inconsistent with org reset-only policy |
| DELETE | Deletion controller pipeline | Assessment + hard delete / pseudonymize | Governed |

\* MFA effective only when flags + metadata enforced.

**Inconsistency:** `admin/users` global credential mutation without central Security & Access UI; overlaps USR-OWN-01 consolidation target.

## R002 — Audit durability (minimal remediation proposal)

- **Confirmed:** session audit `void ...catch(() => undefined)`; billing uses transactional `persistPlatformPermissionMandatoryAuditTx`
- **Interceptor:** `MasterAdminPrivilegedAuditInterceptor` records success/failure for `/admin/*` mutations but session path also uses dedicated service (risk duplicate / miss)
- **Reuse:** `IamAuditOutboxRepository` for org IAM; consider **async outbox enqueue** for MA session audit on failure
- **Constraint:** revocation must **not** fail when audit fails (USR-OWN-04)

## Explicit limitations (unchanged)

- Production audit **NOT_EXECUTED**
- Retention operational jobs **not proven**
- ISO 27701 normative mapping **pending**
- **No** zero-gap certification claim