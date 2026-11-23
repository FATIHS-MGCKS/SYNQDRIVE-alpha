# Decision Register — Master Admin UI/UX

| Decision ID | Title | STATUS | Evidence |
|-------------|-------|--------|----------|
| MAUX-DEC-INDEPENDENT-001 | Independently governed Master Admin UI/UX authority | VALIDATED | MAUX-EVID-AUDIT-001 |
| MAUX-DEC-CONTROL-PLANE-001 | Master retains independent control-plane IA | VALIDATED | MAUX-EVID-CODE-001 |
| MAUX-DEC-SIDEBAR-V1-001 | Owner-approved Sidebar V1 group tree (Rental visual order, Master IA) | VALIDATED | MAUX-EVID-SIDEBAR-V1-2026-11-23 |

---

## MAUX-DEC-INDEPENDENT-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (repository governance) |
| **BEFORE** | Master Admin UI knowledge lived only under shared FEUX bootstrap / `docs/ui` without dedicated registry row. |
| **WHY** | Master is a distinct control-plane product (`/master`) with hub-heavy IA; it requires own graph, manifest, and screen inventories per owner split. |
| **Considered alternatives** | (A) Single FEUX profile annex only — superseded (FEUX-DEC-INDEPENDENT-AUTHORITIES-002). (B) Backend admin module as UX owner — rejected: UX runtime is SPA. |
| **CHANGE** | Registry row **Master Admin UI/UX** at `architecture/frontend-ui-ux/products/master-admin/` with `AUDIT_IN_PROGRESS`. |
| **EXPECTED_EFFECT** | Master-specific hub/subnav contracts documented without overloading Rental/Operator authorities. |
| **VALIDATION** | `products/master-admin/scripts/validate-graph.sh`; registry validator; `MASTER_SCREEN_MATRIX.md` + `MASTER_HUB_SUBNAV.md`. |
| **OBSERVED_EFFECT** | **CONFIRMED** 24 `?view=` routes from `master-nav.config.ts` at code baseline `413175e8c`. Production Master UI **UNKNOWN**. |
| **NON_EFFECTS** | Does not migrate Master nav to platform i18n in this workstream. |
| **TRADEOFFS** | Duplicated foundation cross-links vs. clear product ownership. |
| **REMAINING_GAPS** | Gate A Production UI; not every hub sub-tab visually verified. |
| **EVIDENCE** | MAUX-EVID-AUDIT-001 |

---

## MAUX-DEC-CONTROL-PLANE-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (IA contract) |
| **BEFORE** | Implicit assumption that Rental sidebar patterns could drive Master layout. |
| **WHY** | Master Admin is platform governance (orgs, security, billing, integrations, ops) — not fleet/rental operations. |
| **Considered alternatives** | (A) Unify Master + Rental shell — rejected: distinct nav config and URL sync (`master-nav-url.ts`). (B) Remove Master from SPA — rejected: product requirement. |
| **CHANGE** | Document Master shell: `MasterPageHeader`, hub tabs via URL params (`securityAccess`, `platformOps`, `masterBilling`, …), `PageContainer` variants. |
| **EXPECTED_EFFECT** | UX changes default to MAUX authority; shared token edits still FEUX. |
| **VALIDATION** | Code paths in `frontend/src/master/App.tsx`, hub `*Hub.tsx`, utils/constants for sections (see hub subnav inventory). |
| **OBSERVED_EFFECT** | **CONFIRMED** URL-synced hub sections for security-access (7), platform-ops (7), platform-integrations (5), billing (6 top sections) at audit SHA. |
| **NON_EFFECTS** | Does not fix `product-management` missing `PageContainer` (documented GAP). |
| **TRADEOFFS** | URL-param-heavy IA vs. deep-link clarity. |
| **REMAINING_GAPS** | Full org-detail tab audit; voice-assistant section matrix **PARTIAL**. |
| **EVIDENCE** | MAUX-EVID-CODE-001 |

---

## MAUX-DEC-SIDEBAR-V1-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (repository + unit tests) |
| **BEFORE** | Flat multi-group sidebar with mobile primary duplicates; Support and Integrations mixed in body/footer; intelligence under connectivity group. |
| **WHY** | Owner-approved control-plane navigation aligned to Rental visual grouping without changing hub page implementations. |
| **Considered alternatives** | (A) Regenerate all hubs — rejected (out of scope). (B) New views for Partner group — rejected (navigation-only folder). |
| **CHANGE** | `MASTER_NAV_GROUPS` V1 tree; nested integrations parent; footer Support badge; billing-only isolation preserved; 9-locale `master.sidebar.v1.*` keys. |
| **EXPECTED_EFFECT** | 24 registered `?view=` routes unchanged; each reachable once via rail or footer. |
| **VALIDATION** | `master-nav-sidebar-v1.test.ts`; vitest regressions; `npm run build`; `npm run i18n:check`. |
| **OBSERVED_EFFECT** | **CONFIRMED** tests pass on implementation branch. Production UI **NOT_CLAIMED**. |
| **NON_EFFECTS** | No backend/IAM/route-guard changes; no hub interior redesign. |
| **TRADEOFFS** | `tMasterNav` DE fallback remains for keys not in platform dictionary. |
| **REMAINING_GAPS** | Playwright visual regression for sidebar **NOT_RUN** this PR. |
| **EVIDENCE** | MAUX-EVID-SIDEBAR-V1-2026-11-23 |