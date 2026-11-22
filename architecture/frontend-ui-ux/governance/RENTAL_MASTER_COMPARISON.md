# Rental ↔ Master — Comparison Matrix (evidence-based)

**Status:** PROPOSAL classifications only — **not implemented**, not binding.  
**SHA:** `413175e8c` (+ audit baseline `01bd08a4` for Master depth).  
**Owner rule:** Rental = reference; Master = independent control plane.

## Legend

| Classification | Meaning |
|----------------|---------|
| **ADOPT** | Use same pattern component/utility with minimal change |
| **ADAPT** | Translate intent to control-plane IA (different layout/labels) |
| **RETAIN_MASTER** | Keep Master-specific solution |
| **DO_NOT_COPY** | Inappropriate for Master context |

## Matrix

| Dimension | Rental (observed) | Master (observed) | Classification | Rationale |
|-----------|-------------------|-------------------|------------------|-----------|
| Page structure | View switch in `rental/App.tsx`; vehicle detail stack | `?view=` hubs + `PageContainer` | **RETAIN_MASTER** | Control plane needs stable hub URLs & guards |
| Sidebar | Fleet-centric sections, deep IA | Grouped admin IA (tenants, commerce, connectivity) | **DO_NOT_COPY** | Different mental model |
| TopBar | Breadcrumbs, org context | Welcome + theme + integrations icon | **ADAPT** | Master may add **contextual** breadcrumb on org detail only |
| Dashboard density | Large KPIs, insight tabs, drilldown drawers | `MasterDashboardView` widgets | **ADAPT** | Borrow KPI rhythm + `MetricCard` spacing, not fleet tiles |
| Tables & filters | `DataTable` + domain filter panels | Hubs + `MasterTableShell` | **ADOPT** | Same pattern library |
| Forms / wizards | Multi-step booking, rental rules drawers | Org create wizard, CV import wizards | **ADAPT** | Wizards OK; keep admin semantics |
| Dialogs | `AppDialog`, sheets for bookings | Hub drawers + MFA dialogs | **ADOPT** | Shared stack discipline |
| Cards / status | `StatusChip`, rental-health mappers | Hub chips + org attention cards | **ADOPT** | Same tone utils |
| Tabs | `chrome-tab-bar` across settings/fleet | `MasterPageHeader` tabs + legacy `sq-tab-bar` | **ADAPT** | Converge Master **to** chrome-tab-bar (MasterPageTabs) |
| Navigation patterns | Sidebar + view state | Sidebar + query params | **RETAIN_MASTER** | URL contract already remediated |
| Responsive | Desktop-first; vehicle detail mobile rules | Mobile sidebar drawer; hub wide layouts | **ADAPT** | Master mobile primary nav exists; test gaps open |
| i18n | `useLanguage()` | `tMasterNav` DE map + partial shards | **ADOPT** | Master should align with platform i18n (via i18n authority) |
| Map / liquid L3 | Trips map HUD | Rare (connected vehicles context) | **DO_NOT_COPY** | L3 restricted to map imagery |
| Information density | High (13px body option on rental shell) | 14px root; control-plane tables | **ADAPT** | Selective density increase on Master dashboards only |
| Right context panel | Removed in Rental | Orphan `RightSidebar.tsx` | **RETAIN_MASTER** | Framework doc says removed global mount — **delete or repurpose** (engineering decision) |

## Redesign sequencing (PROPOSED — governance only)

1. **ADOPT** pattern convergence (tabs, tables, dialogs) — low risk  
2. **ADAPT** dashboard KPI rhythm from Rental reference  
3. **ADOPT** i18n chrome migration (cross-authority with i18n)  
4. **RETAIN_MASTER** routing and sidebar IA  

No calendar estimates — dependency order only.