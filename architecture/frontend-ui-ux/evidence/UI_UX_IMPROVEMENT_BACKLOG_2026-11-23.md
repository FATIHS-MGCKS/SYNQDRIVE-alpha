# UI/UX improvement backlog (prioritized, implementation deferred)

**Baseline:** [`FEUX_FINAL_UI_UX_BASELINE_2026-11-23.md`](./FEUX_FINAL_UI_UX_BASELINE_2026-11-23.md)  
**Policy:** No implementation in the retirement PR — planning artifact only.

| ID | Priority | Product | Item | Rationale | Evidence |
|----|----------|---------|------|-----------|----------|
| UX-001 | P1 | MAUX | ~~Add `PageContainer` to product-management hub~~ | **CLOSED — ALREADY_IMPLEMENTED** (`ProductManagementView` L98 `variant="standard"`; no App.tsx wrapper by design) | [`MASTER_SCREEN_MATRIX.md`](../products/master-admin/inventories/MASTER_SCREEN_MATRIX.md) · baseline corrected |
| UX-002 | P1 | FEUX | Document shell contract (Master vs Rental `AppShell` vs Operator shell) | **DONE** — authoritative contract | [`governance/SHELL_LAYOUT_CONTRACT.md`](../governance/SHELL_LAYOUT_CONTRACT.md) |
| UX-003 | P1 | RENTUX | Vehicle detail tab IA review | **DONE** — 9 tabs verified; active-tab scroll-into-view fix | [`UX003_VEHICLE_DETAIL_NAVIGATION_2026-11-23.md`](../products/rental/evidence/UX003_VEHICLE_DETAIL_NAVIGATION_2026-11-23.md) |
| UX-004 | P1 | RENTUX/OPUX | Standardize empty/loading on bookings + today | **DONE** — Rental planner uses shared `SkeletonRows`/`ErrorState`; empty dataset vs filter split; Operator Today verified compliant | [`UX004_BOOKINGS_OPERATOR_STATE_2026-11-23.md`](./UX004_BOOKINGS_OPERATOR_STATE_2026-11-23.md) |
| UX-005 | P1 | MAUX | Organizations detail responsive tab bar | **DONE** — 8 tabs; active-tab scroll-into-view on shared `MasterPageTabs` | [`UX005_ORGANIZATION_DETAIL_TABS_2026-11-23.md`](../products/master-admin/evidence/UX005_ORGANIZATION_DETAIL_TABS_2026-11-23.md) |
| UX-006 | P2 | FEUX | Consolidate navigation URL patterns guide | **DONE** — authoritative tri-product contract | [`NAVIGATION_URL_CONTRACT.md`](../governance/NAVIGATION_URL_CONTRACT.md) |
| UX-007 | P2 | RENTUX | Remove or alias legacy `whatsapp-business` view ids | Confusing type surface | rental/App.tsx types |
| UX-008 | P2 | OPUX | Deep-link documentation for vehicle/booking routes | Shell-only routing | OperatorApp.tsx |
| UX-009 | P2 | FEUX | i18n Integration 2 — touch high-traffic labels on UX-004 screens | Governance rule | i18n audit |
| UX-010 | P3 | MAUX | Align engineering hubs headers with PlatformOps pattern | Visual consistency | intelligence/* views |
| UX-011 | P3 | ALL | Accessibility sweep on dialogs/tables (axe + manual) | Partial e2e coverage | legal/operator a11y specs as models |