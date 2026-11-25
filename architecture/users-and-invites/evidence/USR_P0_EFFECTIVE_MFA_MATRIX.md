# USR_P0-R-004 — Effective MFA and step-up matrix

Feature flags: `resolveIamMfaFeatureFlagsForPrincipal` (`iam-mfa-feature-flags.resolver.ts`).

**Do not infer enforcement from guard registration alone.** `MasterAdminMfaGuard` returns `true` when: no `@RequireMasterAdminMfa` metadata; principal not `MASTER_ADMIN`; `masterAdminMfaEnabled` false; GET non-sensitive; `mfaStepUpEnforced` false.

## Master user management operations

| Operation | Route | RolesGuard | MasterAdminMfa metadata | StepUpGuard | Effective MFA when flags ON |
|-----------|-------|------------|---------------------------|-------------|-----------------------------|
| List users | GET `admin/security/users` | MASTER_ADMIN | **none** → guard noop | no | **NO** (read) |
| User detail | GET `.../users/:id` | same | none | no | **NO** |
| Revoke session | POST `.../sessions/:id/revoke` | same | `MASTER_USER_MANAGEMENT` | `REVOKE_OTHER_USER_SESSIONS` | **YES** — fresh JWT MFA **or** step-up grant; StepUp also accepts fresh JWT |
| Revoke all sessions | POST `.../sessions/revoke-all` | same | same | same | **YES** |
| MFA reset | POST `.../mfa/reset` | same | `MASTER_USER_MANAGEMENT` | `MFA_RESET_OTHER_USER` | **YES** |
| Grant master billing | POST `.../master-billing/grant` | same | `MASTER_USER_MANAGEMENT` | **none** (intentional) | **YES** via MasterAdminMfaGuard only — repository test asserts no duplicate StepUp scope |
| Revoke master billing | POST `.../master-billing/revoke` | same | same | none | same |
| Legacy create user | POST `admin/users` | MASTER_ADMIN | `MASTER_USER_MANAGEMENT` | no | **YES** on mutation |
| Global delete user | DELETE `admin/users/:id` | MASTER_ADMIN | `MASTER_USER_MANAGEMENT` | `PRIVACY_DATA_DELETION` | **YES** |

## Billing vs session step-up (F-007 reassessment)

When `mfaStepUpEnforced` is true:

- Session revoke requires **either** fresh MFA in JWT **or** valid grant for `REVOKE_OTHER_USER_SESSIONS` (StepUpGuard).
- Billing grant requires **either** fresh MFA in JWT **or** grant validated for `MASTER_USER_MANAGEMENT` (MasterAdminMfaGuard only).

**Verdict:** Not an unauthorized bypass — **different action scopes**, both require fresh MFA or matching step-up grant. **USR-P0-F-007** reclassified to **NOT_APPLICABLE** (design documented in billing HTTP spec).

## USR-P0-F-005

Delegated billing **additional** MFA gate (`IAM_MFA_MASTER_BILLING_DELEGATE`) remains **POLICY_DECISION_REQUIRED**, default off.