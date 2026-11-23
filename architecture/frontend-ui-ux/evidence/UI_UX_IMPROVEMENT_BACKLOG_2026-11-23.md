# UI/UX improvement backlog (prioritized, implementation deferred)

**Baseline:** [`FEUX_FINAL_UI_UX_BASELINE_2026-11-23.md`](./FEUX_FINAL_UI_UX_BASELINE_2026-11-23.md)  
**Policy:** No implementation in the retirement PR — planning artifact only.

| ID | Priority | Product | Item | Rationale | Evidence |
|----|----------|---------|------|-----------|----------|
| UX-001 | P1 | MAUX | ~~Add `PageContainer` to product-management hub~~ | **CLOSED — ALREADY_IMPLEMENTED** (`ProductManagementView` L98 `variant="standard"`; no App.tsx wrapper by design) | [`MASTER_SCREEN_MATRIX.md`](../products/master-admin/inventories/MASTER_SCREEN_MATRIX.md) · baseline corrected |
| UX-002 | P1 | FEUX | Document shell contract (Master vs Rental `AppShell` vs Operator shell) | **DONE** — authoritative contract | [`governance/SHELL_LAYOUT_CONTRACT.md`](../governance/SHELL_LAYOUT_CONTRACT.md) |
| UX-003 | P1 | RENTUX | Vehicle detail tab IA review | 8 tabs — prioritize mobile overflow | `vehicle-detail/*` |
| UX-004 | P1 | RENTUX/OPUX | Standardize empty/loading on bookings + today | Revenue-critical paths | BookingsView, OperatorTodayView |
| UX-005 | P1 | MAUX | Organizations detail responsive tab bar | Long horizontal tab lists | OrganizationDetailView |
| UX-006 | P2 | FEUX | Consolidate navigation URL patterns guide | Query `?view=` vs `/operator` paths | master-nav-url, rental App |
| UX-007 | P2 | RENTUX | Remove or alias legacy `whatsapp-business` view ids | Confusing type surface | rental/App.tsx types |
| UX-008 | P2 | OPUX | Deep-link documentation for vehicle/booking routes | Shell-only routing | OperatorApp.tsx |
| UX-009 | P2 | FEUX | i18n Integration 2 — touch high-traffic labels on UX-004 screens | Governance rule | i18n audit |
| UX-010 | P3 | MAUX | Align engineering hubs headers with PlatformOps pattern | Visual consistency | intelligence/* views |
| UX-011 | P3 | ALL | Accessibility sweep on dialogs/tables (axe + manual) | Partial e2e coverage | legal/operator a11y specs as models |