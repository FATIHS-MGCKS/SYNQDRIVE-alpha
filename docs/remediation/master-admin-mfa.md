# Master Admin Remediation — Phase 2A.5: Master Admin MFA

**Date:** 2026-07-26  
**Status:** Implemented (feature-flagged)  
**Scope:** Mandatory MFA, enrollment, recovery, and step-up authentication for Master Admin control-plane surfaces. Normal tenant users unchanged.

---

## 1. Objective

Master administrators must use **TOTP MFA** with **recovery codes** for:

| Surface | Step-up action | Backend routes |
|---------|----------------|----------------|
| Billing | `MASTER_BILLING` | `admin/billing/*`, stripe catalog mapping |
| Subscription | `MASTER_SUBSCRIPTION` | `admin/billing/organizations/:orgId/subscription/*` |
| Organization | `MASTER_ORGANIZATION` | `admin/organizations/*` |
| Master settings | `MASTER_PLATFORM_SETTINGS` | `admin/*` (platform-admin), `admin/email/*` |
| API keys / credentials | `MASTER_API_KEYS` | Reserved for future personal API keys; platform credential ops under integrations/settings |
| Integrations | `MASTER_INTEGRATIONS` | `admin/dimo/*`, `admin/high-mobility/*`, voice control plane |
| User management | `MASTER_USER_MANAGEMENT` | `admin/users` mutations |

**Normal users:** Existing org-scoped IAM MFA flags (`IAM_MFA_*`) unchanged — no new requirements unless those flags are enabled separately.

---

## 2. Architecture (reused)

Built on existing **Prompt 18 IAM MFA module** (`backend/src/modules/iam-mfa/`):

- TOTP enrollment + hashed recovery codes
- JWT assurance claims (`assuranceLevel`, `mfaAuthenticatedAt`)
- Step-up grants (`x-step-up-token`, 10 min TTL)
- Account API: `/account/mfa/*`

### New / extended components

| Component | Purpose |
|-----------|---------|
| `IAM_MFA_MASTER_ADMIN_ENABLED` | Platform flag — master admin MFA independent of org allowlist |
| `resolveIamMfaFeatureFlagsForPrincipal()` | Resolves flags by `platformRole` + `organizationId` |
| `MasterAdminMfaGuard` | Enrollment + step-up on **mutating** master-admin routes only |
| `AuthMfaLoginService` | Login-time MFA gate for enrolled master admins |
| `POST /auth/login/mfa` | Complete login after TOTP/recovery |
| `AuthGuard` | Now populates `request.user.sessionClaims` from JWT |
| Master UI | `MasterMfaGate`, `MfaEnrollmentPanel`, `MfaStepUpDialog`, login MFA step |

---

## 3. Feature flag

```bash
# Production VPS backend.env — enable after deploy
IAM_MFA_MASTER_ADMIN_ENABLED=true
```

When `true` for `MASTER_ADMIN`:

- `mfaEnrollmentEnabled` = true  
- `mfaStepUpEnforced` = true  
- `mfaPrivilegedEnrollmentRequired` = true  

Org allowlist (`IAM_MFA_ORG_ALLOWLIST`) does **not** apply to master admins.

When `false` (default): **no behavior change** for any user.

---

## 4. Flows

### 4.1 Enrollment (first-time master admin)

1. Login with password (allowed without MFA if not yet enrolled)
2. `MasterMfaGate` blocks master UI → shows enrollment wizard
3. `POST /account/mfa/totp/enroll/start` → QR / otpauth URL
4. `POST /account/mfa/totp/enroll/confirm` → **10 recovery codes** (one-time display)
5. Subsequent logins require MFA (§4.2)

### 4.2 Login MFA (enrolled master admin)

1. `POST /auth/login` → `{ requiresMfa: true, mfaPendingToken }` (no session tokens)
2. `POST /auth/login/mfa` with TOTP or recovery code → full `accessToken` + `refreshToken` with MFA claims

### 4.3 Step-up (sensitive mutations)

1. Master admin performs POST/PATCH/PUT/DELETE on guarded route
2. Without fresh MFA: `403 STEP_UP_REQUIRED`
3. Frontend opens step-up dialog → `POST /account/mfa/challenge`
4. Client stores `stepUpToken` → retries request with `x-step-up-token` header

### 4.4 Recovery

- **Login:** recovery code via `/auth/login/mfa`
- **Step-up:** recovery code via `/account/mfa/challenge`
- **Self-reset:** `POST /account/mfa/reset` (step-up gated)
- **Admin reset:** org-scoped `/organizations/:orgId/users/:userId/mfa/reset` (unchanged)

---

## 5. Verification

### Backend tests

```bash
cd backend && npm test -- --testPathPattern="master-admin-mfa|auth-mfa-login|iam-mfa-feature-flags.resolver"
cd backend && npm test -- --testPathPattern=iam-mfa.security
```

### Manual (with flag enabled)

1. Master admin login → enrollment wizard if not enrolled
2. After enrollment → login requires 6-digit code
3. Billing/org mutation without step-up → 403
4. Step-up dialog → mutation succeeds on retry
5. Tenant user login → unchanged

---

## 6. Files changed

### Backend

- `iam-mfa.policy.ts` — master admin step-up actions
- `iam-mfa-feature-flags.*` — `IAM_MFA_MASTER_ADMIN_ENABLED`
- `master-admin-mfa.guard.ts` + spec
- `auth-mfa-login.service.ts` + spec
- `auth.controller.ts` — login MFA gate + `/auth/login/mfa`
- `auth.guard.ts` — `sessionClaims`, public `/auth/login/mfa`
- `step-up.guard.ts` — principal-aware flags
- Controllers: organizations, billing, subscription, platform-admin, platform-email, dimo, HM admin, voice control plane, users (admin mutations)
- `.env.example`

### Frontend

- `lib/mfa.ts`, `lib/api.ts` — MFA API + step-up header
- `components/mfa/*` — enrollment + step-up UI
- `master/components/MasterMfaGate.tsx`
- `master/App.tsx` — gate + step-up listener
- `pages/LoginPage.tsx` — MFA login step

---

## 7. Production rollout

1. Merge + deploy backend + frontend
2. Set `IAM_MFA_MASTER_ADMIN_ENABLED=true` in production `backend.env`
3. PM2 restart
4. Each master admin enrolls on next login
5. Verify step-up on billing mutation

**Rollback:** Set `IAM_MFA_MASTER_ADMIN_ENABLED=false` and restart — immediate disable without code deploy.

---

## 8. Residual / follow-up

| Item | Notes |
|------|-------|
| Personal API keys | No model yet — `MASTER_API_KEYS` action reserved |
| Rental MFA UI | Still disabled in tenant settings — unchanged |
| `platformPermissions` / `master-billing` JWT | Pre-existing gap — not in scope |

---

**Changes / Architektur:** Not updated — extends existing IAM MFA architecture (`architecture/IAM_MFA_STEP_UP_2026-07-21.md`).
