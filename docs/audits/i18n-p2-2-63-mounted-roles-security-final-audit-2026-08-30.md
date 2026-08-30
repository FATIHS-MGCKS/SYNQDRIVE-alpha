# P2.2.63 — Mounted Roles Access & Security Audit — Final Independent Audit

**Date:** 2026-08-30  
**Mode:** STRICT READ-ONLY MERGE CERTIFICATION  
**Implementation PR:** #1431  
**Preflight PR:** #1426 (do not merge)  
**Audited HEAD:** `74a6d9a0cfcf33975606373b56129ad93351d5d3`  
**Baseline:** `4b89ad8015fdb4183b8d130eea02cb4fb8f07a58`

---

## 1. Topology

| Check | Independent result |
|-------|-------------------|
| PR #1431 state | OPEN, Draft, unmerged, MERGEABLE |
| Base SHA | `4b89ad8015fdb4183b8d130eea02cb4fb8f07a58` ✅ |
| HEAD SHA | `74a6d9a0cfcf33975606373b56129ad93351d5d3` ✅ |
| Commit count | **1** ✅ |
| #1426 audit ancestry | **NO** (`30fb88773` not ancestor) ✅ |

---

## 2. Changed paths (13 files)

| File | Class |
|------|-------|
| `RolesAccessTab.tsx` | **A** active production presentation |
| `SecurityAuditTab.tsx` | **A** active production presentation |
| `rental-organization-users-roles-i18n.ts` | **C** presentation adapter |
| `rental.iamMember.en.ts` | **B** dictionary |
| `rental.iamMember.de.ts` | **B** dictionary |
| `rental-mounted-roles-security-localization.test.tsx` | **D** tests |
| `i18n-hardcoded-scan.mjs` | **E** scanner/governance |
| `hardcoded-copy-guard.test.ts` | **E** scanner/governance |
| `hardcoded-copy-inventory.json` | **E** scanner/governance |
| `i18n-p2-2-63-mounted-roles-security-implementation-2026-08-30.md` | **F** implementation docs |
| `I18N_RENTAL_IAM_ROLES_SECURITY_P2_2_63_2026-08-30.md` | **G** architecture docs |
| `ChangesView.tsx` | **G** architecture changelog UI |
| `ArchitekturView.tsx` | **G** architecture changelog UI |

**H/I/J/K/L production changes:** **0**  
(`RolesTab.tsx`, P262 frozen paths, Data Analyse, DIMO/Trip, unrelated = zero diff)

---

## 3. Implementation delta verdict

Production diff limited to:
- `RolesAccessTab` host copy → `t()` keys
- `SecurityAuditTab` empty + `resolveAuditEventTitle`
- Adapter: `resolveAuditEventTitle` + `legal-documents-audit` module mapping

No product wiring, no CRUD exposure, no permission/role semantic changes.

---

## 4. Seven-key inventory

| Key | EN | DE | Callsite | Mounted? | Reuse? | Host-owned? | Machine-derived? | Unused? | Orphan? |
|-----|----|----|----------|----------|--------|-------------|------------------|---------|---------|
| `iam.roles.empty.title` | No roles | Keine Rollen | `RolesAccessTab` EmptyState | ✅ | New | ✅ | ❌ | ❌ | ❌ |
| `iam.roles.selectPrompt` | Select a role | Rolle auswählen | `RolesAccessTab` detail placeholder | ✅ | New | ✅ | ❌ | ❌ | ❌ |
| `iam.roles.meta.pinned` | pinned | angeheftet | `RolesAccessTab` list meta | ✅ | New | ✅ | ❌ | ❌ | ❌ |
| `iam.roles.meta.followsLatest` | follows latest | folgt aktueller Version | `RolesAccessTab` list meta | ✅ | New | ✅ | ❌ | ❌ | ❌ |
| `iam.roles.impact.scope` | Scope: {value} | Geltungsbereich: {value} | `RolesAccessTab` impact; `{value}` raw | ✅ | Partial (`iam.roles.impact` exists) | ✅ | ❌ (value raw) | ❌ | ❌ |
| `iam.security.empty.title` | No security data | Keine Sicherheitsdaten | `SecurityAuditTab` EmptyState | ✅ | New | ✅ | ❌ | ❌ | ❌ |
| `iam.permission.module.legal-documents-audit` | Legal text audit | Rechtstext-Audit | Adapter `resolvePermissionModuleLabel` | ✅ (matrix child) | P262 pattern extension | ✅ | Machine key only | ❌ | ❌ |

**Baseline EN/DE:** 9654 / 9654  
**Final EN/DE:** **9661 / 9661** (independently verified via `npm run i18n:check`)  
**Net P263:** **7**

### Key verdict: **A — 7 KEYS JUSTIFIED**

---

## 5. Production mount

```
SettingsView (activeTab === 'users')
  └── UsersRolesTab
        ├── team → TeamTab [P262 frozen]
        ├── roles → RolesAccessTab [P263]
        └── security → SecurityAuditTab [P263]
```

Reachable via `SettingsView.tsx:80-83` → `UsersRolesTab` export chain.

---

## 6. Dead RolesTab evidence

- `RolesTab.tsx` has **zero diff** in #1431
- Grep: no production import of `users-roles/RolesTab` (only dead file + master `SecurityRolesTab` unrelated)
- Custom-role CRUD (`api.organizationRoles.create/update/delete`) not wired to IAM shell

**Status:** DEAD/UNWIRED — correctly excluded

---

## 7. Dead CRUD debt

| Bucket | Count | Classification |
|--------|------:|----------------|
| users-roles scanner (dead files) | **45** | DEAD/UNWIRED PRODUCT-WIRING DEBT |
| Mounted P263 enforce-clean | **0** | Active debt cleared |

Not blocking.

---

## 8. Presentation audit

### RolesAccessTab
- All former hardcoded EN host copy localized (empty, select, pinned, follows latest, scope label)
- Raw preserved: `role.name`, `role.description`, `privilegedCapabilities[]`, `stationScopeImpact` value
- Permission matrix: `CollapsiblePermissions` unchanged (P262)

### SecurityAuditTab
- Empty state localized
- Audit titles: known action → localized; unknown → raw `description`
- Raw preserved: `displayName`, `email`, unknown audit text
- No filters/pagination on mounted surface

### resolveAuditEventTitle
1. Known `auditAction` → `resolveAuditActionLabel` → localized
2. Unknown → raw `description`
3. Fallback → machine action or `—`
No misleading known mapping.

---

## 9. Semantics freeze

| Domain | Result |
|--------|--------|
| Permission IDs / levels / evaluation | **Unchanged** (PermissionEditor zero diff) |
| Built-in roles ORG_ADMIN etc. | **Unchanged** |
| Custom role raw | **Preserved** (fixture tested) |
| Role/permission identity | **Unchanged** |
| Role hierarchy | **Unchanged** |
| Audit filter/sort/pagination | N/A (not mounted) |
| Date formatting | `formatDateTime(value, locale)` — P262 frozen helper |
| Error ownership | `useIamTeam` unchanged — raw Error.message precedence preserved |

---

## 10. Fetch dependency graph

| Component | Fetch | Dependencies |
|-----------|-------|--------------|
| `RolesAccessTab` | `api.iam.roleDetail` | `[orgId, selectedId]` only |
| `SecurityAuditTab` | none | — |
| `useIamTeam` (parent) | `teamKpis`, `teamList`, `rolesList`, `securityOverview` | `[orgId]` only (P262 frozen) |

**`t` / locale in fetch identity:** **NONE** — not blocking

---

## 11. Tests

| Suite | Result |
|-------|--------|
| P263 focused (6) | **PASS** |
| P262 regression (13) | **PASS** |
| P261 regression (13) | **PASS** |
| Hardcoded guard (138) | **PASS** |

### Same-mount grade: **STRONG**
- Production `UsersRolesTab` root, `mountCount=1`, `apiCounters` unchanged on DE→EN→DE
- Roles tab: selection + expanded permissions preserved on locale switch
- Security tab: audit raw + localized known action verified
- Note: role selection resets when leaving roles tab (tab unmount) — production behavior, not tested as defect

### Permission / audit parity: **PASS** (tested)

---

## 12. Adapter purity: **PURE**

`resolveAuditEventTitle` + module label mapping only. No payloads, evaluation, or API calls.

P262 overlap: existing resolvers unchanged semantically; only additive exports.

---

## 13. Enforce-clean

```
rental/components/users-roles/RolesAccessTab.tsx
rental/components/users-roles/SecurityAuditTab.tsx
```

Independent result: **0 findings**

Manual mounted-tree audit: **0 active host-owned presentation debt**

---

## 14. Scanner (independent)

| Scanner | Baseline | Final | Delta |
|---------|----------|-------|-------|
| Global | 1263 | **1260** | −3 |
| Rental | 166 | **163** | −3 |
| Finance/Billing | 25 | 25 | 0 |

**−3 explanation:** exact removal of 3 mounted findings (`No roles`, `Select a role`, `No security data`). No suppression.

---

## 15. Isolation

| Check | Result |
|-------|--------|
| Data Analyse | Zero diff ✅ |
| DIMO/Trip/backend | Zero diff ✅ |
| P262 production paths | Zero diff ✅ |
| Collision #1429 | DIMO only — no P263 paths ✅ |
| Collision #1430 | Scheduler only — no P263 paths ✅ |

---

## 16. Validation

| Check | Result |
|-------|--------|
| `npm run i18n:check` | PASS |
| `npm run check:surface` | PASS |
| `tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `git diff --check` | **FAIL** — trailing whitespace in implementation doc markdown only (non-production) |

---

## 17. Claim reconciliation

| Claim | #1431 | Independent | PASS/FAIL |
|-------|-------|-------------|-----------|
| 1 commit | ✅ | ✅ | PASS |
| 7 keys | ✅ | ✅ | PASS |
| 9661/9661 | ✅ | ✅ | PASS |
| parity 100% | ✅ | ✅ | PASS |
| orphans 0 | ✅ | ✅ | PASS |
| unused 0 | ✅ | ✅ | PASS |
| scanner 1260/163 | ✅ | ✅ | PASS |
| active debt 0 | ✅ | ✅ | PASS |
| dead CRUD 45 | ✅ | ✅ | PASS |
| zero locale refetch | ✅ | ✅ (tested) | PASS |
| permission parity | ✅ | ✅ | PASS |
| audit parity | ✅ | ✅ | PASS |
| raw ownership | ✅ | ✅ | PASS |
| adapter pure | ✅ | ✅ | PASS |
| frozen surfaces | ✅ | ✅ | PASS |
| validations | claimed all | diff-check doc whitespace | **PARTIAL** |

---

## Final verdict

**B — P2.2.63 CERTIFIED WITH NON-BLOCKING OBSERVATIONS — READY TO MERGE**

**Observation:** `git diff --check` reports trailing whitespace in implementation/architecture markdown files only. No production impact.

P2.2.63 Mounted Roles Access + Security Audit is independently certified.

PR #1431 may now be marked ready and merged.

Active mounted P263 presentation debt is zero.

Dead/unwired custom-role CRUD remains excluded until product wiring exists.

**DO NOT MERGE AUDIT PR #1426 OR THIS AUDIT PR.**
