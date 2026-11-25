# Users & Invites — current state (USR_P0 seal)

**Epistemic baseline:** Repository @ `a5664ac105cc43ee4cd12da22bb4cffc1ffb50f6` (audited `origin/main`). Production runtime **NOT_VERIFIED**.

## Executive verdicts (repository evidence only)

| Verdict | Status | Evidence |
|---------|--------|----------|
| Global identity | **CONFIRMED** — `User` model + Clerk-less email/password in monolith | `backend/prisma/schema.prisma` `User` |
| Membership isolation (REMOVED re-add) | **IMPLEMENTED + TESTED** (repo) | PR #2481, `iam-removed-membership` tests **pass** |
| Master Admin users UI | **PARTIALLY_WIRED** — `SecurityAccessHub` canonical; legacy `App.tsx` user CRUD dead | USR-P0-F-001 |
| Authorization on `/admin/security` | **IMPLEMENTED** — `MASTER_ADMIN`, `MasterAdminMfaGuard`, step-up on privileged | `security-governance.controller.ts` |
| MFA / sessions | **IMPLEMENTED** (repo) — revoke + reset with audit hooks | controller + `RefreshTokenService` |
| Platform user create via MA hub | **MISSING_CAPABILITY** | No POST create on governance API |
| i18n (Security & Access) | **GAP** — hardcoded DE strings | USR-P0-F-002 |
| Session-audit HTTP security tests | **BROKEN HARNESS** | USR-P0-F-003 |
| Audit on billing grant/revoke | **IMPLEMENTED** — mandatory audit service | `grantMasterBillingWithMandatoryAudit` |
| Production IAM posture | **UNKNOWN** | PRODUCTION_AUDIT_STATUS=NOT_EXECUTED |

## Canonical Master Admin surface

| Route | Component | Status |
|-------|-----------|--------|
| `?view=security-access` | `SecurityAccessHub` | **ACTIVE** |
| `?view=users` | redirect → security-access | **MIGRATED** (`security-access-url.ts`) |
| Legacy `users` state in `App.tsx` | unused handlers + `listAll` on mount | **DEAD / PARTIAL** |

## Backend entrypoints (inventory summary)

| Prefix | Controller / module | MA scope |
|--------|---------------------|----------|
| `admin/security/*` | `SecurityGovernanceController` | Platform governance read + privileged mutations |
| `admin/users/*` | platform admin users (legacy list/create) | Still referenced by dead `App.tsx` paths |
| `organizations/:orgId/users/*` | `users` module | Org IAM tab, invites, roles |
| `auth/*`, `account/*` | self-service | Not MA |

See [evidence/USR_P0_API_INVENTORY.md](evidence/USR_P0_API_INVENTORY.md).

## Lifecycle (actual enums — not invented)

**Global `UserStatus`:** `ACTIVE`, `INACTIVE`, `SUSPENDED`  
**`MembershipStatus`:** `INVITED`, `ACTIVE`, `SUSPENDED`, `OFFBOARDING`, `REMOVED`, `REACTIVATION_REQUIRED`  
**`OrganizationInviteStatus`:** `PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED`

Transition implementation: `backend/src/modules/users/*`, organization onboarding P4, P6B2 REMOVED isolation — detailed matrix in [evidence/USR_P0_WIRING_MATRIX.md](evidence/USR_P0_WIRING_MATRIX.md).

## Findings summary

| Severity | Count |
|----------|-------|
| P0 | 0 confirmed |
| P1 | 0 confirmed |
| P2 | 4 |
| P3 | 2 |

Full register: [evidence/USR_P0_FINDINGS_REGISTER.md](evidence/USR_P0_FINDINGS_REGISTER.md).

## Test evidence (USR_P0 run)

```text
backend jest (filtered IAM): 9 passed suites / 1 failed — security-governance-session-audit.http-security.spec (5 failures)
frontend vitest security-access-url: 5/5 pass
```

## Promotion status

Registry **`AUDIT_IN_PROGRESS`** — Gate A **not** eligible (no Production read-only audit).