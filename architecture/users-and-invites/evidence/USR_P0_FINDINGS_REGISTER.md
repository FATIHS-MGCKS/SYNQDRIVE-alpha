# USR_P0 — Findings register

Classification legend: `CONFIRMED_DEFECT` | `CONFIRMED_SECURITY_GAP` | `MISSING_CAPABILITY` | `POLICY_DECISION_REQUIRED` | `SUSPECTED_UNVERIFIED` | `NOT_APPLICABLE`

---

## USR-P0-F-001

| Field | Value |
|-------|-------|
| **SEVERITY** | P2 |
| **TITLE** | Master `App.tsx` retains dead platform user CRUD state and API calls |
| **CLASS** | CONFIRMED_DEFECT |
| **AFFECTED_MODULE** | Master Admin shell, Users & Invites |
| **SOURCE** | `frontend/src/master/App.tsx` (~143–415): `users` state, `api.users.listAll()`, `handleAddUser` / `handleUpdateUser` / `handleDeleteUser` — handlers not passed to rendered children (`SecurityAccessHub` is canonical) |
| **EXPECTED** | Single MA user governance path without duplicate fetch/mutation dead code |
| **ACTUAL** | Extra listAll on org bootstrap; unreachable CRUD handlers |
| **EVIDENCE** | Code inspection; `SecurityAccessHub` uses `useSecurityUsers` → `/admin/security/users` |
| **IMPACT** | Wasted API traffic; maintainer confusion; false impression of dual CRUD surfaces |
| **ROOT_CAUSE** | Incomplete removal after Security & Access migration |
| **RECOMMENDED_FIX** | Remove dead state/handlers or wire explicitly (prefer removal) |
| **REGRESSION_TEST** | Optional MA shell test: no `listAll` on mount when `view=security-access` |
| **COMPLIANCE** | None direct |
| **OWNER_DECISION** | NO |

---

## USR-P0-F-002

| Field | Value |
|-------|-------|
| **SEVERITY** | P2 |
| **TITLE** | Security & Access UI uses hardcoded German user-facing strings |
| **CLASS** | CONFIRMED_DEFECT (i18n governance) |
| **AFFECTED_MODULE** | Master Admin UI, Internationalization |
| **SOURCE** | e.g. `frontend/src/master/security-access/useSecurityAccess.ts:31,71`; `SecurityUsersTab.tsx`, `UserDetailDrawer.tsx` (multiple DE strings) |
| **EXPECTED** | 9-locale keys per `.cursor/rules/i18n.mdc` |
| **ACTUAL** | Hardcoded DE error labels and tab copy |
| **EVIDENCE** | Grep + file read |
| **IMPACT** | Non-DE locales see German; i18n CI debt |
| **RECOMMENDED_FIX** | Add semantic keys to platform dictionaries (all 9 locales) |
| **REGRESSION_TEST** | `npm run i18n:check` after key migration |
| **COMPLIANCE** | GDPR Art. 12 accessibility of information (engineering target) — partial gap |
| **OWNER_DECISION** | NO |

---

## USR-P0-F-003

| Field | Value |
|-------|-------|
| **SEVERITY** | P3 |
| **TITLE** | `security-governance-session-audit.http-security.spec.ts` test module incomplete |
| **CLASS** | CONFIRMED_DEFECT (test harness) |
| **AFFECTED_MODULE** | Platform Admin / security governance |
| **SOURCE** | `backend/src/modules/platform-admin/security-governance-session-audit.http-security.spec.ts` — Nest DI missing `SecurityGovernancePlatformPermissionAuditService` |
| **EXPECTED** | HTTP security suite passes in CI |
| **ACTUAL** | 5/5 tests fail at module compile (USR_P0 run) |
| **EVIDENCE** | Jest output 2026-11-25 |
| **IMPACT** | Regression signal loss for session revocation audit wiring |
| **RECOMMENDED_FIX** | Register mock provider in test module (mirror `security-governance-platform-permission.http-security.spec.ts`) |
| **REGRESSION_TEST** | Suite green |
| **COMPLIANCE** | ISO 27001 engineering — detective control test gap |
| **OWNER_DECISION** | NO |

---

## USR-P0-F-004

| Field | Value |
|-------|-------|
| **SEVERITY** | P2 |
| **TITLE** | No Master Admin “create platform user” on `/admin/security` |
| **CLASS** | MISSING_CAPABILITY |
| **AFFECTED_MODULE** | Users & Invites |
| **SOURCE** | `security-governance.controller.ts` — no POST create; creation paths: org onboarding `initialAdmin`, org IAM invites, legacy `admin/users` |
| **EXPECTED** | Product-defined: MA may only govern existing users centrally |
| **ACTUAL** | MA hub is read + privileged ops (sessions, MFA, billing delegate) — not full CRUD |
| **IMPACT** | Operators use org-scoped flows; document as intentional unless product requires central create |
| **RECOMMENDED_FIX** | Document SOP; or add governed create with audit if required |
| **OWNER_DECISION** | **YES** — product scope for central user creation |

---

## USR-P0-F-005

| Field | Value |
|-------|-------|
| **SEVERITY** | N/A |
| **TITLE** | Delegated Master Billing MFA gate default OFF |
| **CLASS** | POLICY_DECISION_REQUIRED |
| **SOURCE** | `IAM_MFA_MASTER_BILLING_DELEGATE` / P3B evidence |
| **EXPECTED** | Owner arms when ready |
| **ACTUAL** | Grant/revoke APIs exist; MFA enforcement env default false |
| **OWNER_DECISION** | **YES** |

---

## USR-P0-F-006

| Field | Value |
|-------|-------|
| **SEVERITY** | P2 |
| **TITLE** | Production deployment of P3B–P6B2 IAM guarantees not verified |
| **CLASS** | SUSPECTED_UNVERIFIED |
| **SOURCE** | PRs #2468, #2469, #2474, #2481 merged on main — no prod access in USR_P0 |
| **EXPECTED** | DEPLOYED / PRODUCTION_VERIFIED attestation |
| **ACTUAL** | MERGED only |
| **RECOMMENDED_FIX** | Execute [USR_P0_PRODUCTION_AUDIT_SPEC.md](USR_P0_PRODUCTION_AUDIT_SPEC.md) when authorized |
| **OWNER_DECISION** | YES (authorize prod read-only) |

---

## USR-P0-F-007

| Field | Value |
|-------|-------|
| **SEVERITY** | P3 |
| **TITLE** | Master Billing grant path missing `StepUpGuard` on revoke/grant vs session revoke |
| **CLASS** | SUSPECTED_UNVERIFIED (needs threat-model confirmation) |
| **SOURCE** | `security-governance.controller.ts:139–178` — `@RequireMasterAdminMfa` only, no `@RequireStepUp` unlike session revoke |
| **EXPECTED** | Consistent step-up for all privileged mutations |
| **ACTUAL** | MFA guard + mandatory audit; step-up decorator absent on billing paths |
| **IMPACT** | May be intentional if `MASTER_USER_MANAGEMENT` MFA satisfies policy |
| **OWNER_DECISION** | YES — align step-up matrix |