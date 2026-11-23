# UI/UX improvement backlog (prioritized, implementation deferred)

**Baseline:** [`FEUX_FINAL_UI_UX_BASELINE_2026-11-23.md`](./FEUX_FINAL_UI_UX_BASELINE_2026-11-23.md)  
**Campaign closure:** UX-001–UX-011 merged on `main` @ `698db6c0b1d4cfef4c8ea42febe0cfdcd4ee7f85` — see [`UX001_011_CAMPAIGN_MERGE_REGISTER_2026-11-23.md`](./UX001_011_CAMPAIGN_MERGE_REGISTER_2026-11-23.md).
**Policy:** Original backlog was planning-only; implementation completed via PRs #2501–#2512 (not a deploy or production certification claim).

| ID | Priority | Product | Item | Rationale | Evidence |
|----|----------|---------|------|-----------|----------|
| UX-001 | P1 | MAUX | ~~Add `PageContainer` to product-management hub~~ | **CLOSED — ALREADY_IMPLEMENTED** (`ProductManagementView` L98 `variant="standard"`; no App.tsx wrapper by design) | [`MASTER_SCREEN_MATRIX.md`](../products/master-admin/inventories/MASTER_SCREEN_MATRIX.md) · baseline corrected |
| UX-002 | P1 | FEUX | Document shell contract (Master vs Rental `AppShell` vs Operator shell) | **DONE** — authoritative contract | [`governance/SHELL_LAYOUT_CONTRACT.md`](../governance/SHELL_LAYOUT_CONTRACT.md) |
| UX-003 | P1 | RENTUX | Vehicle detail tab IA review | **DONE** — 9 tabs verified; active-tab scroll-into-view fix | [`UX003_VEHICLE_DETAIL_NAVIGATION_2026-11-23.md`](../products/rental/evidence/UX003_VEHICLE_DETAIL_NAVIGATION_2026-11-23.md) |
| UX-004 | P1 | RENTUX/OPUX | Standardize empty/loading on bookings + today | **DONE** — Rental planner uses shared `SkeletonRows`/`ErrorState`; empty dataset vs filter split; Operator Today verified compliant | [`UX004_BOOKINGS_OPERATOR_STATE_2026-11-23.md`](./UX004_BOOKINGS_OPERATOR_STATE_2026-11-23.md) |
| UX-005 | P1 | MAUX | Organizations detail responsive tab bar | **DONE** — 8 tabs; active-tab scroll-into-view on shared `MasterPageTabs` | [`UX005_ORGANIZATION_DETAIL_TABS_2026-11-23.md`](../products/master-admin/evidence/UX005_ORGANIZATION_DETAIL_TABS_2026-11-23.md) |
| UX-006 | P2 | FEUX | Consolidate navigation URL patterns guide | **DONE** — authoritative tri-product contract | [`NAVIGATION_URL_CONTRACT.md`](../governance/NAVIGATION_URL_CONTRACT.md) |
| UX-007 | P2 | RENTUX | Remove or alias legacy `whatsapp-business` view ids | **DONE** — removed from `RentalCurrentView`; URL compat preserved | [`UX007_LEGACY_COMMUNICATION_VIEWS_2026-11-23.md`](../products/rental/evidence/UX007_LEGACY_COMMUNICATION_VIEWS_2026-11-23.md) |
| UX-008 | P2 | OPUX | Deep-link documentation for vehicle/booking routes | **DONE** — `/operator/scan` route + focus hygiene; route matching tests | [`UX008_OPERATOR_DEEPLINK_2026-11-23.md`](../products/operator/evidence/UX008_OPERATOR_DEEPLINK_2026-11-23.md) |
| UX-009 | P2 | FEUX | i18n Integration 2 — touch high-traffic labels on UX-004 screens | **DONE** — `bookings.planner.loadError`; Operator Today `operator.today.*` + `formattingLocale` | [`UX009_HIGH_TRAFFIC_I18N_2026-11-23.md`](./UX009_HIGH_TRAFFIC_I18N_2026-11-23.md) |
| UX-010 | P3 | MAUX | ~~Align engineering hubs headers with PlatformOps pattern~~ | **DONE** — `variant="context"` on five engineering hubs; tire tabs integrated in header | [`UX010_ENGINEERING_HUB_HEADER_2026-11-23.md`](../products/master-admin/evidence/UX010_ENGINEERING_HUB_HEADER_2026-11-23.md) |
| UX-011 | P3 | ALL | ~~Accessibility sweep on dialogs/tables (axe + manual)~~ | **DONE** — bounded MAUX/OPUX/FEUX fixes + `cross-product-a11y-ux011` | [`UX011_CROSS_PRODUCT_ACCESSIBILITY_2026-11-23.md`](./UX011_CROSS_PRODUCT_ACCESSIBILITY_2026-11-23.md) |