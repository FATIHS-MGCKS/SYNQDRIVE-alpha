# Users & Invites — current state (USR_P0 seal + USR-P1A delta)

**Epistemic baseline:** Repository @ `origin/main` post PR #2530 (`270a0b4c2`). Production runtime **NOT_VERIFIED**.

**Owner policies (2026-11-25):** USR-OWN-01–04 **OWNER_APPROVED** — documented in [USR_P0_OWNER_ATTESTATION_2026-11-25.md](evidence/USR_P0_OWNER_ATTESTATION_2026-11-25.md). **Not implemented** in repository by this attestation; **no** deploy/flag/prod authorization.

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
| Session-audit HTTP security tests | **IMPLEMENTED + TESTED (repo)** — harness + real-guard HTTP specs | USR-P1A closes F-003 |
| Session audit accountability (R-002) | **IMPLEMENTED (repo)** — `MasterAdminAuditDeliveryService` | USR-P1A / USR-OWN-04 |
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

## Findings summary (post closeout — not a certification of zero risk)

| Severity | Open confirmed |
|----------|----------------|
| P0 | 0 |
| P1 | 0 |
| P1 | 1 (R-008 stale privileged JWT) |
| P2 | 6+ (F-001, F-002, F-004, F-006, R-002, R-013, …) |

**P0 seal:** [USR_P0_FINAL_EVIDENCE_SEAL.md](evidence/USR_P0_FINAL_EVIDENCE_SEAL.md) — **not** a claim of zero security gaps.
| P3 | 1 (R-005 doc fixed) |

**Audit coverage gaps closed:** R-003, R-004, R-007, **R-002 (USR-P1A)**, **F-003 (USR-P1A)**. **Security gaps:** R-008 stale JWT (P1).

Full register: [evidence/USR_P0_FINDINGS_REGISTER.md](evidence/USR_P0_FINDINGS_REGISTER.md).

## Test evidence (USR_P0 run)

```text
USR-P1A: security-governance-session-audit.http-security.spec 5/5 pass
USR-P1A: security-governance-session-revoke.http-security.integration.spec 7/7 pass
USR-P1A: master-admin-audit-delivery.service.spec 3/3 pass
USR-P1A PG (optional USR_P1A_SESSION_AUDIT_PG=1): master-admin-audit-delivery.postgres.integration.spec
```

## Promotion status

Registry **`AUDIT_IN_PROGRESS`** — Gate A **not** eligible (no Production read-only audit).