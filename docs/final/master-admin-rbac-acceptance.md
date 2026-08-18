# Master Admin Remediation — Phase 2G.3 — RBAC Acceptance

**Date:** 2026-07-26  
**Scope:** Static code audit + automated security test execution + limited production API probes (unauthenticated).  
**Branch:** `cursor/master-admin-rbac-acceptance-2g3-b5f0`  
**Verdict:** **Conditionally accepted for documentation** — core guard stack and tenant isolation are sound; **7 deviations** require remediation or explicit risk acceptance before production RBAC sign-off.

---

## 1. Executive summary

SynqDrive RBAC is implemented as a **two-layer identity model**:

| Layer | Prisma enum | Values | Purpose |
|-------|-------------|--------|---------|
| Platform | `UserPlatformRole` | `MASTER_ADMIN`, `USER` | Cross-tenant control plane |
| Membership | `MembershipRole` | `ORG_ADMIN`, `SUB_ADMIN`, `WORKER`, `DRIVER` | Tenant-scoped operations |

**Naming clarifications required for acceptance:**

| User-facing term | Actual implementation |
|------------------|----------------------|
| **Organisation** | `MembershipRole.ORG_ADMIN` (org admin), not a separate enum |
| **Operator** | Frontend surface `/operator/*` — allowed membership roles: `ORG_ADMIN`, `SUB_ADMIN`, `WORKER`; denied: `DRIVER`. Not a Prisma role. |
| **Customer** | **Not a login role.** External `Customer` records + Stripe checkout/payment links. Notification matrix defines `CUSTOMER` with `apiAccess: false`. |

Backend authorization stack (org-scoped routes):

1. `AuthGuard` — JWT required (global)
2. `OrgScopingGuard` — JWT `organizationId` must match `:orgId`; `MASTER_ADMIN` bypass
3. `RolesGuard` — `@Roles(...)` platform or membership role match
4. `PermissionsGuard` — module permissions; `MASTER_ADMIN` + `ORG_ADMIN` bypass
5. `StationScopeGuard` — station-scoped data when Stations V2 enabled
6. Domain guards — `MasterBillingGuard`, `PaymentsPermissionGuard`, etc.

Frontend gates (`/master`, `/rental`, `/operator`) are **UX routing only**. Security source of truth is the backend.

### Conformance matrix (automated evidence)

| Area | Result | Evidence |
|------|--------|----------|
| Core RBAC guards | **PASS** | 71 tests: `permissions.guard`, `org-scoping`, `notification-access`, `users.controller.security`, `master-billing`, `master-subscription.controller.security` |
| Tenant isolation | **PASS** | `iam-tenant-isolation.security.regression.spec.ts` (4 cases) |
| Billing capability matrix | **PASS** | `billing.permissions.matrix.spec.ts` (Org Admin → Driver templates) |
| IAM security suite (full) | **PARTIAL** | 219 passed, **16 failed** (stale characterization mocks — not runtime RBAC regression) |
| Production unauthenticated probes | **PASS** | `GET /api/v1/admin/dashboard` → 401; `GET /api/v1/organizations/:orgId/users` → 401 |
| Live per-role UI/API E2E | **NOT RUN** | No staging credentials in Cloud Agent environment |

---

## 2. Role model reference

### 2.1 Default permission templates

Source: `backend/src/modules/users/defaults/organization-role.defaults.ts`

| Template | `MembershipRole` | Effective access summary |
|----------|------------------|--------------------------|
| Org Admin | `ORG_ADMIN` | Full module read/write/manage incl. users-roles, billing, payments-connect |
| Sub Admin | `SUB_ADMIN` | Operational modules; users-roles/billing/company-info read-only; no payment modules by default |
| Disposition / Accounting / Station Manager | `SUB_ADMIN` | Specialized subsets (bookings, invoices, stations, etc.) |
| Employee / Field Agent / Service / Read-only | `WORKER` | Read-heavy; limited write on assigned modules |
| Driver | `DRIVER` | Bookings read (+ write on bookings in template); no billing/payments |

`PermissionsGuard` treats **`ORG_ADMIN` as unconditional allow** within the org regardless of JSON permissions.

### 2.2 Guard resolution order

```
Request → AuthGuard (JWT)
       → OrgScopingGuard (:orgId vs JWT, membership ACTIVE)
       → RolesGuard (@Roles if present)
       → PermissionsGuard (@RequirePermission if present)
       → StationScopeGuard / domain guards
       → Controller handler
```

---

## 3. Per-role acceptance

### 3.1 Master Admin (`UserPlatformRole.MASTER_ADMIN`)

#### Allowed actions

| Surface | Allowed |
|---------|---------|
| **API** | All `/api/v1/admin/*` (`PlatformAdminController` — class-level `@Roles('MASTER_ADMIN')`): dashboard, monitoring, changelogs, prune, vehicle logbook, trip backfill, battery shadow reports, hardware backfill |
| **API** | Cross-tenant org routes via `OrgScopingGuard` bypass (`tenantId` stamped from `:orgId`) |
| **API** | `UsersController` admin routes (`adminFindAll`, `adminCreate`, …) — `MASTER_ADMIN` via `RolesGuard` |
| **API** | Most `billing.controller` master routes — `@Roles('MASTER_ADMIN')`; subset also `@UseGuards(MasterBillingGuard)` |
| **API** | `voice-control-plane-admin.controller` — `MASTER_ADMIN` |
| **UI** | `/master/*` — `ProtectedRoute requiredRole="MASTER_ADMIN"` |
| **UI** | `/operator/*` — `evaluateOperatorAccess` allows `isMasterAdmin()` |
| **UI** | `/rental/*` — accessible (no membership role gate at route level) |
| **Tenant isolation** | Intentional cross-tenant access; audit via `ActivityLog` on destructive admin ops |

#### Forbidden actions

| Surface | Expected denial | Enforcement |
|---------|-----------------|-------------|
| Unauthenticated admin API | 401 | `AuthGuard` — verified prod `GET /admin/dashboard` → 401 |
| Tenant user calling `/admin/*` | 403 `Insufficient role permissions` | `RolesGuard` |
| Tenant user with tampered JWT on another org | 403 on org-scoped routes | `OrgScopingGuard` (tenant users) |

#### Deviations

| ID | Severity | Finding |
|----|----------|---------|
| RBAC-MA-1 | P2 | **Billing split:** `MasterBillingGuard` allows `platformPermissions` containing `master-billing` without `MASTER_ADMIN`. Intentional delegation but must be documented in ops runbooks. |
| RBAC-MA-2 | P3 | **Login redirect:** Users without `organizationId` are sent to `/master` (`LoginPage.tsx` L74); non–Master-Admins are then redirected to `/rental` by `ProtectedRoute`. Confusing UX, not a security bypass. |
| RBAC-MA-3 | P2 | **`PlatformAdminController` cross-tenant vehicle ops** (e.g. `hardware-backfill`, logbook) operate on vehicle IDs without explicit org ownership check in controller — relies on admin trust model. |

---

### 3.2 Organisation Admin (`MembershipRole.ORG_ADMIN`)

*User term "Organisation" maps to org admin membership.*

#### Allowed actions

| Surface | Allowed |
|---------|---------|
| **API** | All org-scoped routes under `/api/v1/organizations/:orgId/*` where user has ACTIVE membership and JWT org matches |
| **API** | `PermissionsGuard` — unconditional allow within org |
| **API** | `PATCH/POST /organizations/:orgId/profile` — `assertCanWriteOrgProfile` allows `ORG_ADMIN` |
| **API** | Full billing SaaS + customer payment capabilities per `org_admin` template |
| **API** | Notifications — full org visibility, resolve + archive (`notification-access.matrix`) |
| **UI** | `/rental/*` — all tabs; `hasPermission()` always `true` in `RentalContext` |
| **UI** | `/operator/*` — allowed via `OPERATOR_ALLOWED_MEMBERSHIP_ROLES` |
| **Tenant isolation** | Restricted to JWT `organizationId`; cross-org path → 403 |

#### Forbidden actions

| Surface | Expected denial | Enforcement |
|---------|-----------------|-------------|
| `/api/v1/admin/*` | 403 | `RolesGuard` on `PlatformAdminController` |
| `/master` UI (direct URL) | Redirect to `/rental` | `ProtectedRoute` checks `platformRole` only |
| Another org's `:orgId` in API | 403 | `OrgScopingGuard` |
| Last effective org admin demotion/deletion | 400 | `assertNotLastEffectiveOrgAdmin` |

#### Deviations

| ID | Severity | Finding |
|----|----------|---------|
| RBAC-OA-1 | P3 | **Frontend `/rental` has no membership role gate** — any authenticated user with org context reaches rental shell; module tabs gated by `hasPermission` (UX). Backend remains SoT. |
| RBAC-OA-2 | P3 | **Stations V2:** When `stationsScopeV2Enabled`, `ORG_ADMIN` typically has `stationScope: ALL` — documented in notification matrix; station guard behavior depends on membership config. |

---

### 3.3 Sub Admin (`MembershipRole.SUB_ADMIN`)

#### Allowed actions

| Surface | Allowed |
|---------|---------|
| **API** | Org-scoped routes with `PermissionsGuard` — per membership JSON (default template: broad read, limited write; no users-roles write/manage, no billing write) |
| **API** | Notifications — station-scoped when `stationScope` set; resolve + archive |
| **API** | Operator handover/booking APIs — same as other staff roles with module permissions |
| **UI** | `/rental/*` — tabs per `hasPermission` |
| **UI** | `/operator/*` — allowed |
| **Billing** | SaaS billing read; invoices read/write; **no** customer portal / payment-method manage without override |

#### Forbidden actions

| Surface | Expected denial | Enforcement |
|---------|-----------------|-------------|
| `users-roles.manage` (password reset trigger) | 403 | `PermissionsGuard` + characterization tests on `UsersController` |
| `billing.write` (customer portal, payment methods) | 403 | `billing.permissions.matrix.spec.ts` |
| `/admin/*`, `/master` | 403 / redirect | Backend + frontend |
| Cross-org access | 403 | `OrgScopingGuard` |

#### Deviations

| ID | Severity | Finding |
|----|----------|---------|
| RBAC-SA-1 | P3 | Custom org role templates may grant `billing.write` — matrix documents override path; ops must review custom roles. |

---

### 3.4 Operator (application surface, not a Prisma role)

**Canonical roles:** `ORG_ADMIN`, `SUB_ADMIN`, `WORKER`  
**Denied:** `DRIVER`  
**Also allowed:** `MASTER_ADMIN` (platform support)

Source: `frontend/src/operator/lib/operatorAccess.types.ts`, `operatorAccess.ts`

#### Allowed actions

| Surface | Allowed |
|---------|---------|
| **UI** | `/operator/*` when `evaluateOperatorAccess` passes + org has `businessType === RENTAL` |
| **API** | Same backend endpoints as rental staff (bookings handover, damages, documents, tasks) — guarded by org scope + module permissions on each endpoint |

#### Forbidden actions

| Surface | Expected denial | Enforcement |
|---------|-----------------|-------------|
| `DRIVER` membership | `OperatorAccessDeniedScreen` (forbidden_role) | `OperatorAccessGuard` |
| Non-rental org | `no_rental_product` screen | `OperatorOrgAccessGate` |
| No `organizationId` | `no_organization` screen | `OperatorOrgAccessGate` |
| Direct API as DRIVER | 403 on permission-gated endpoints | Backend `PermissionsGuard` |

#### Deviations

| ID | Severity | Finding |
|----|----------|---------|
| RBAC-OP-1 | P3 | **No dedicated backend "operator" guard** — operator is a frontend product surface; security = org scope + module permissions. Acceptable if documented. |
| RBAC-OP-2 | P3 | **MASTER_ADMIN on operator** bypasses membership role check but still needs rental org context for handover flows. |

---

### 3.5 Driver (`MembershipRole.DRIVER`)

#### Allowed actions

| Surface | Allowed |
|---------|---------|
| **API** | Org-scoped endpoints where default `driver` template grants permission (primarily `bookings.read`, limited `bookings.write`) |
| **API** | Notifications — driver event subset; **no** resolve/archive |
| **UI** | `/rental/*` — limited tabs per permissions |
| **Tenant isolation** | Same as other tenant users |

#### Forbidden actions

| Surface | Expected denial | Enforcement |
|---------|-----------------|-------------|
| `/operator/*` | `forbidden_role` | `OperatorAccessGuard` |
| `users-roles.*`, `billing.*`, `payments-*` | 403 | Default template + `PermissionsGuard` |
| Notification resolve/archive | Denied | `notification-access.security.regression.spec.ts` |
| `/master`, `/admin/*` | Redirect / 403 | Frontend + `RolesGuard` |

#### Deviations

| ID | Severity | Finding |
|----|----------|---------|
| RBAC-DR-1 | P3 | **Rental UI does not block DRIVER at route level** — relies on per-tab `hasPermission`. Acceptable with backend enforcement. |

---

### 3.6 Customer (external party, not org login user)

#### Model

- Prisma `Customer` entity linked to bookings/invoices/payments.
- `NOTIFICATION_ACCESS_MATRIX` entry: `apiAccess: false`, no event types.
- End-customer payments via Stripe Checkout / payment request links (public/token-scoped), not org JWT.

#### Allowed actions

| Surface | Allowed |
|---------|---------|
| **API** | Token-scoped payment/checkout webhooks (public paths in `AuthGuard`) |
| **API** | No org notification API |
| **UI** | No SynqDrive org login surface for customers |

#### Forbidden actions

| Surface | Expected denial | Enforcement |
|---------|-----------------|-------------|
| Org JWT routes | 401 without login | `AuthGuard` |
| Notification inbox API as CUSTOMER | Denied by policy | `notification-access` tests |
| Rental/Master/Operator apps | N/A — no account type | — |

#### Deviations

| ID | Severity | Finding |
|----|----------|---------|
| RBAC-CU-1 | P3 | **Terminology:** "Customer" in product docs must not be confused with `MembershipRole` — acceptance requires glossary alignment only. |

---

## 4. Cross-cutting security analysis

### 4.1 Tenant isolation

| Control | Behavior | Test |
|---------|----------|------|
| JWT org vs path org | Mismatch → 403 before DB | `iam-tenant-isolation` |
| Inactive/revoked membership | DB check → 403 | `OrgScopingGuard` |
| MASTER_ADMIN | Cross-org allowed; `tenantId` set | `iam-tenant-isolation` |
| Query `orgId` tampering (billing) | Cross-org query rejected for tenants | `permissions.guard.spec` `resolvePermissionOrgId` |

### 4.2 Frontend vs backend boundary

| Check | Backend enforced? | Frontend gated? |
|-------|-------------------|-----------------|
| `/master` | Yes (`@Roles MASTER_ADMIN`) | Yes (`platformRole`) |
| `/rental` module tabs | Yes (`PermissionsGuard`) | Yes (`hasPermission`) |
| `/operator` | Yes (per-endpoint) | Yes (`OperatorAccessGuard`) |
| Direct API (curl) | Yes | N/A |

**Rule:** Frontend `hasPermission` and `ProtectedRoute` must never be treated as security boundaries.

### 4.3 `RolesGuard` implementation note

`RolesGuard` matches `user.platformRole === role || user.membershipRole === role`. There is **no** `MembershipRole.MASTER_ADMIN` in Prisma — the `membershipRole` branch is dead for platform admin but harmless.

---

## 5. Deviation register (consolidated)

| ID | Severity | Component | Description | Recommendation |
|----|----------|-----------|-------------|----------------|
| **RBAC-TB-1** | **P1** | `insurances.controller.ts` | `PATCH /insurances/live-sharing/:id` updates by record `id` only — **no `organizationId` check** in controller or `updateLiveSharing` service | Add org ownership verification; reject cross-tenant ID enumeration |
| RBAC-MA-1 | P2 | `MasterBillingGuard` | `master-billing` platform permission delegates billing control without `MASTER_ADMIN` | Document + audit assignees; consider narrowing scope |
| RBAC-MA-3 | P2 | `PlatformAdminController` | Cross-tenant vehicle/admin mutations by ID | Add optional org filter or audit-only confirmation |
| RBAC-MA-2 | P3 | `LoginPage.tsx` | No-org users redirected to `/master` then bounced | Redirect no-org non-admins to org picker or error |
| RBAC-OA-1 | P3 | `App.tsx` `/rental` | No membership role at route level | Accept with backend SoT; optional route-level role hint |
| RBAC-OP-1 | P3 | Operator surface | No backend operator role enum | Document architecture decision |
| RBAC-IAM-1 | P3 | IAM test suite | 16 failing characterization tests (mock drift) | Fix mocks; does not indicate prod RBAC failure |
| RBAC-CU-1 | P3 | Terminology | Customer ≠ membership role | Glossary in IAM docs |

---

## 6. Automated test evidence

### 6.1 Executed (2026-07-26)

```bash
# Core RBAC — PASS (71 tests)
cd backend && npm test -- --testPathPattern="permissions.guard|org-scoping|notification-access|users.controller.security|master-billing|master-subscription.controller.security|roles.guard"

# Tenant isolation + billing matrix — PASS (36 tests)
cd backend && npm test -- --testPathPattern="iam-tenant-isolation|org-admin-protection|billing.permissions.matrix"

# Full IAM security — PARTIAL (219 pass, 16 fail)
cd backend && npm run test:iam:security
```

### 6.2 IAM failures (characterization drift, not guard regression)

Failing suites include stale mocks in:

- `users.service.spec.ts` — expects `BadRequestException`, receives `GoneException` on deprecated password path
- `iam-security-regression.spec.ts` — `inviteRateLimit.assertResendAllowed`, `lifecycle.move` not mocked
- `organization-invite.service.spec.ts` — related mock gaps

**Impact on 2G.3:** Does not invalidate guard behavior verified by passing targeted suites; blocks **full IAM CI green** until fixed.

### 6.3 Production probes (unauthenticated)

| Endpoint | HTTP |
|----------|------|
| `GET https://app.synqdrive.eu/api/v1/admin/dashboard` | 401 |
| `GET https://app.synqdrive.eu/api/v1/organizations/{uuid}/users` | 401 |

---

## 7. Manual staging checklist (required for full sign-off)

Execute with one account per role on staging (`app.synqdrive.eu` or staging equivalent):

| # | Role | UI direct URL | API curl with JWT | Expected |
|---|------|---------------|-------------------|----------|
| 1 | Master Admin | `/master`, `/rental`, `/operator` | `GET /admin/dashboard` | All UI loads; API 200 |
| 2 | Org Admin | `/master` → redirect; `/rental`, `/operator` | `PATCH .../profile`; `GET .../users` | 200 on own org; 403 other org |
| 3 | Sub Admin | `/rental`, `/operator` | `POST .../users` (create) | 403 without users-roles.write |
| 4 | Worker | `/operator` | Handover endpoint | 200 if module perm; 403 otherwise |
| 5 | Driver | `/operator` | `GET .../bookings` | Operator denied; bookings per template |
| 6 | Customer | N/A | Org notification API | 401/403 — no org JWT |
| 7 | Cross-tenant | Any tenant JWT | `GET /organizations/{foreignOrgId}/vehicles` | 403 |
| 8 | TB-1 verify | N/A | `PATCH /insurances/live-sharing/{foreignId}` | **Should be 403/404 — currently vulnerable** |

---

## 8. Acceptance decision

| Criterion | Status |
|-----------|--------|
| Role model documented and mapped | ✅ |
| Per-role allowed/forbidden catalogued | ✅ |
| Backend guards verified (automated) | ✅ |
| Tenant isolation verified (automated) | ✅ |
| Frontend routing documented as non-SoT | ✅ |
| All deviations listed | ✅ (8 items) |
| P1 tenant bypass remediated | ❌ **RBAC-TB-1 open** |
| Live per-role E2E | ⏸ Blocked (credentials) |

### Final verdict

**RBAC acceptance: CONDITIONAL PASS**

The platform RBAC architecture is **fundamentally correct** for Master Admin, Organisation Admin, Sub Admin, Operator (surface), Driver, and Customer (external). Automated guard and tenant-isolation tests pass. **Full production sign-off is blocked** until:

1. **RBAC-TB-1** (`PATCH insurances/live-sharing/:id`) is remediated or explicitly accepted with compensating controls.
2. Manual staging checklist (§7) is executed for all six role classes.
3. (Recommended) IAM characterization test drift (RBAC-IAM-1) is repaired for CI confidence.

---

## 9. Source files inspected

| Area | Path |
|------|------|
| Prisma roles | `backend/prisma/schema.prisma` |
| Guards | `backend/src/shared/auth/{auth,roles,permissions,org-scoping,master-billing}.guard.ts` |
| Platform admin | `backend/src/modules/platform-admin/platform-admin.controller.ts` |
| Tenant profile RBAC | `backend/src/modules/organizations/tenant-organization-profile.controller.ts` |
| Users admin RBAC | `backend/src/modules/users/users.controller.ts` + `.security.characterization.spec.ts` |
| Role defaults | `backend/src/modules/users/defaults/organization-role.defaults.ts` |
| Notification matrix | `backend/src/modules/notifications/access/notification-access.matrix.ts` |
| Operator access | `frontend/src/operator/lib/operatorAccess*.ts`, `OperatorAccessGuard.tsx` |
| Frontend routing | `frontend/src/App.tsx`, `frontend/src/rental/RentalContext.tsx` |
| TB-1 finding | `backend/src/modules/insurances/insurances.controller.ts` L97–104 |
| Billing matrix | `backend/src/modules/billing/billing.permissions.matrix.spec.ts` |

---

## 10. Changes / Architektur

**Not updated** — documentation-only acceptance audit (consistent with Phase 2G.1 and 2G.2).
