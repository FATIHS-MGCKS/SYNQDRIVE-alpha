# P2.2.63 — Mounted Roles Access & Security Audit Implementation

**Date:** 2026-08-30  
**Baseline:** `4b89ad8015fdb4183b8d130eea02cb4fb8f07a58`  
**Branch:** `cursor/p2263-mounted-roles-security-i18n-3c10`  
**Preflight:** PR #1426 — verdict B (GO, BUT SPLIT)

## Scope delivered

### Included

| Surface | Changes |
|---------|---------|
| `RolesAccessTab.tsx` | `iam.roles.empty.title`, `selectPrompt`, `meta.pinned`, `meta.followsLatest`, `impact.scope` |
| `SecurityAuditTab.tsx` | `iam.security.empty.title`; audit feed via `resolveAuditEventTitle` |
| Adapter | `resolveAuditEventTitle`; `legal-documents-audit` module key |
| Enforce-clean | 2 paths — 0 findings |

### Excluded (deferred)

- Dead `RolesTab.tsx` custom-role CRUD — **PRODUCT WIRING REQUIRED**
- 45 scanner findings in unwired legacy IAM files unchanged

## Key accounting

| Metric | Baseline | Final |
|--------|----------|-------|
| EN | 9654 | **9661** |
| DE | 9654 | **9661** |
| Parity | 100% | 100% |
| Orphans | 0 | 0 |
| P263 new keys | — | **7** |
| Reused P262/canonical | — | `iam.audit.*`, `iam.permission.level.*`, `nav.*`, shell `iam.roles.*` |

## Scanner delta

| Scanner | Before | After | Delta |
|---------|--------|-------|-------|
| Global | 1263 | **1260** | −3 |
| Rental | 166 | **163** | −3 |
| Finance/Billing | 25 | 25 | 0 |

Active mounted P263 debt: **0**  
Dead/unwired CRUD debt: **45** (unchanged, deferred)

## Validation evidence

| Check | Result |
|-------|--------|
| `npm run i18n:check` | PASS |
| `npm run check:surface` | PASS |
| `tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| P263 tests (6) | PASS |
| P262 regression (13) | PASS |
| P261 regression (13) | PASS |
| Hardcoded guard (138) | PASS |

## Same-mount / refetch

- `UsersRolesTab` persistent root; roles tab + security tab locale switch
- `apiCounters` unchanged on DE→EN→DE
- `mountCount = 1`

## Semantics preserved

- Custom role name/description RAW (byte-identical DE/EN)
- Unknown audit → raw description fallback
- Unknown permission module → machine string fallback
- Permission evaluation / payloads / role IDs unchanged

## Files changed

**Production:** `RolesAccessTab.tsx`, `SecurityAuditTab.tsx`, `rental-organization-users-roles-i18n.ts`, `rental.iamMember.{en,de}.ts`  
**Governance:** `i18n-hardcoded-scan.mjs`, `hardcoded-copy-guard.test.ts`, `hardcoded-copy-inventory.json`  
**Tests:** `rental-mounted-roles-security-localization.test.tsx`  
**Docs:** `architecture/I18N_RENTAL_IAM_ROLES_SECURITY_P2_2_63_2026-08-30.md`, ChangesView, ArchitekturView
