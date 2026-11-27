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
| **REMEDIATION_STATUS** | **REMEDIATED (USR-P1A)** — harness providers restored; 5/5 pass; real-guard suite added |
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
| **RECOMMENDED_FIX** | Implement central MA user management per **USR-OWN-01** (reuse existing services) |
| **OWNER_DECISION** | **OWNER_APPROVED** (2026-11-25) — **NOT IMPLEMENTED** |
| **POLICY_BIND** | USR-OWN-01 |

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
| **OWNER_DECISION** | **OWNER_APPROVED_POLICY_PENDING** — USR-OWN-03 adopted; **production flag arm NOT authorized**; enforcement **NOT IMPLEMENTED** |
| **POLICY_BIND** | USR-OWN-03 |

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
| **SEVERITY** | — |
| **TITLE** | Billing grant step-up parity |
| **CLASS** | **DESIGN_SPECIFIC** — not unconditional MFA guarantee |
| **SOURCE** | Billing uses `MasterAdminMfaGuard` only; enforcement requires feature flags + enrollment |
| **ACTUAL** | When flags off, guard no-ops; when on, action-scoped step-up differs from session revoke |

---

## USR-P0-R-001

| Field | Value |
|-------|-------|
| **SEVERITY** | P2 (historical) → **REMEDIATED in closeout** |
| **TITLE** | Production inventory SQL used wrong Prisma table/column names |
| **CLASS** | CONFIRMED_DEFECT → fixed |
| **SOURCE** | Prior `USR_P0_PRODUCTION_INVENTORY.sql` |
| **EVIDENCE** | Disposable PG test PASS (`USR_P0_INVENTORY_PG=1`) |

---

## USR-P0-R-002

| Field | Value |
|-------|-------|
| **SEVERITY** | P2 |
| **TITLE** | Session revocation audit silently dropped on persistence failure |
| **CLASS** | CONFIRMED_SECURITY_GAP (accountability) |
| **SOURCE** | `security-governance-session-audit.service.ts` |
| **DETAIL** | [USR_P0_AUDIT_DURABILITY.md](USR_P0_AUDIT_DURABILITY.md) |
| **REMEDIATION_STATUS** | **REMEDIATED (USR-P1A closeout)** — platform `master_admin_audit_outbox` + awaited `commitAuditIntent` + atomic ledger idempotency (PG01–PG13) |
| **EVIDENCE** | [USR_P1A_AUDIT_ACCOUNTABILITY_EVIDENCE.md](USR_P1A_AUDIT_ACCOUNTABILITY_EVIDENCE.md) |
| **RESIDUAL** | Revocation + audit intent are sequential transactions (not one DB txn); process crash between them is reduced but not mathematically zero |

---

## USR-P0-R-003

| Field | Value |
|-------|-------|
| **SEVERITY** | — |
| **TITLE** | Incomplete API inventory |
| **CLASS** | AUDIT_COVERAGE_GAP → **closed** |
| **EVIDENCE** | [USR_P0_COMPLETE_API_INVENTORY.md](USR_P0_COMPLETE_API_INVENTORY.md) |

---

## USR-P0-R-004

| Field | Value |
|-------|-------|
| **SEVERITY** | — |
| **TITLE** | Effective MFA matrix incomplete |
| **CLASS** | AUDIT_COVERAGE_GAP → **closed** |
| **EVIDENCE** | [USR_P0_EFFECTIVE_MFA_MATRIX.md](USR_P0_EFFECTIVE_MFA_MATRIX.md) |

---

## USR-P0-R-005

| Field | Value |
|-------|-------|
| **SEVERITY** | P3 |
| **TITLE** | Incorrect ISO 27001 control references in compliance matrix |
| **CLASS** | CONFIRMED_DEFECT (documentation) → **corrected** |
| **SOURCE** | Prior A.12 logging references |

---

## USR-P0-R-006

| Field | Value |
|-------|-------|
| **SEVERITY** | P2 |
| **TITLE** | Retention/deletion operational proof incomplete |
| **CLASS** | AUDIT_COVERAGE_GAP |
| **SOURCE** | `iam-data-retention` — enum ≠ scheduled erasure proof |
| **EVIDENCE** | [USR_P0_RETENTION_LIFECYCLE.md](USR_P0_RETENTION_LIFECYCLE.md) |

---

## USR-P0-R-007

| Field | Value |
|-------|-------|
| **SEVERITY** | — |
| **TITLE** | Module authority structure incomplete |
| **CLASS** | AUDIT_COVERAGE_GAP → **closed in closeout** (graph + mandatory files) |

---

## USR-P0-R-008

| Field | Value |
|-------|-------|
| **SEVERITY** | **P1** (privileged `/admin/*` stale `platformRole` / permissions) |
| **TITLE** | Access JWT may retain stale privileges until expiry |
| **CLASS** | CONFIRMED_SECURITY_GAP |
| **SOURCE** | `auth.guard.ts`; `ACCESS_TOKEN_RESIDUAL_LIFETIME_NOTE`; `platform-permission-jwt.integration.spec.ts` |
| **EVIDENCE** | [USR_P0_FINAL_EVIDENCE_SEAL.md](USR_P0_FINAL_EVIDENCE_SEAL.md) |
| **OWNER_DECISION** | **OWNER_APPROVED_REMEDIATION_REQUIRED** (USR-OWN-02) |
| **USR-P2_STATUS** | **REMEDIATED_REPO** — accepted product HEAD **`7da011d72c806d3bc17aa0c81fc1f5c397febf6f`** (PR **#2534**); mandatory CI **PASS** (USR-P2 `46006709524` / job `140535127725`, authority `46006706168`, Product Catalog `46006709629` **16/16**, VO-5B `46006709496` **20/20**). Authority workflow **#2541** merged @ `ffa732998`. **USR_P2_REPOSITORY_ACCEPTANCE=PASS**. **NOT DEPLOYED / NOT PRODUCTION_VERIFIED / NOT CERTIFIED** — **USR-P5** cutover gate applies |
| **POLICY_BIND** | USR-OWN-02 |

---

## USR-P0-R-009

| Field | Value |
|-------|-------|
| **CLASS** | AUDIT_COVERAGE_GAP → **closed** |
| **TITLE** | API inventory 78 vs 98 |
| **EVIDENCE** | **98** routes — [USR_P0_COMPLETE_API_INVENTORY.md](USR_P0_COMPLETE_API_INVENTORY.md) |

---

## USR-P0-R-010 / R-011

| Field | Value |
|-------|-------|
| **CLASS** | CONFIRMED_DEFECT (test) → **REMEDIATED in seal** |
| **TITLE** | Inventory SQL test transaction safety |
| **EVIDENCE** | `usr-p0-production-inventory-sql.postgres.integration.spec.ts` 2/2 PASS |

---

## USR-P0-R-012

| Field | Value |
|-------|-------|
| **CLASS** | AUDIT_COVERAGE_GAP → **documented** |
| **TITLE** | MFA orchestration flag-dependent |
| **EVIDENCE** | [USR_P0_FINAL_EVIDENCE_SEAL.md](USR_P0_FINAL_EVIDENCE_SEAL.md) § R012 |

---

## USR-P0-R-013

| Field | Value |
|-------|-------|
| **SEVERITY** | P2 |
| **CLASS** | CONFIRMED_DEFECT |
| **TITLE** | Legacy `admin/users` parallel mutation authority |
| **EVIDENCE** | [USR_P0_FINAL_EVIDENCE_SEAL.md](USR_P0_FINAL_EVIDENCE_SEAL.md) § R013 |