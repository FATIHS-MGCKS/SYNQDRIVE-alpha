# FEUX final UI/UX baseline — consolidated (code-verified)

**Date:** 2026-11-23  
**Main SHA (baseline pass):** `ff8871c6d959f521a6d3dc1775e6c2fae9af3f39`  
**Owner decision:** P9/P9C production-authenticated UI audit **RETIRED** (runtime removed; evidence preserved).  
**Verification default:** `CODE_VERIFIED` unless noted.

## Scope

| Authority | Surfaces | Matrix |
|-----------|----------|--------|
| MAUX | Master Admin (`/master`) | [`MASTER_SCREEN_MATRIX.md`](../products/master-admin/inventories/MASTER_SCREEN_MATRIX.md) |
| RENTUX | Rental (`/rental`) | [`RENTAL_SCREEN_MATRIX.md`](../products/rental/inventories/RENTAL_SCREEN_MATRIX.md) |
| OPUX | Operator (`/operator`) | [`OPERATOR_SCREEN_MATRIX.md`](../products/operator/inventories/OPERATOR_SCREEN_MATRIX.md) |
| FEUX | Tokens, shadcn/ui, patterns, theme | [`SHARED_COMPONENTS.md`](../inventories/SHARED_COMPONENTS.md) |

**Historical audits (preserved):** P7 Gate A (`#2492`), P8 functional matrix (`#2493`), P9 design (**retired**, `#2495`).

## Cross-cutting assessment (FEUX)

| Area | Implementation | Strengths | Weaknesses | Priority |
|------|----------------|-----------|------------|----------|
| Theme tokens | `frontend/src/styles/theme.css`, Tailwind v4 via `vite.config.ts` | Central CSS variables, dark/light via `AppThemeContext` | Master/Rental/Operator do not share one shell component; token drift risk across products | P1 |
| Components | `frontend/src/components/ui/` (~42 primitives) + `patterns/` | shadcn consistency, shared empty/error/skeleton patterns | Operator uses subset; some Rental-only wrappers (`rental/components/ui/Icon`) | P2 |
| Navigation model | Master/Rental: query `?view=`; Operator: path + bottom tabs | Deep-linkable rental/master views; operator mobile-first | Inconsistent paradigms (query vs path) — shell contract documented (UX-002) | P2 |
| i18n | Platform `frontend/src/i18n/*` | Nine-locale registry | Rental island `rental/i18n` transitional; hardcoded strings still in inventory debt | P2 |
| Responsiveness | Rental desktop-first; Operator `sm` breakpoints | Operator touch targets, bottom nav | Master wide hubs on narrow viewports under-tested in authority | P2 |
| Accessibility | axe in some e2e | Patterns include semantic chips/headers | Not uniformly audited per screen | P3 |

## Master Admin (MAUX) — sample screen records

| Screen | Source | Assessment | Strengths | Weaknesses | Priority | Verification |
|--------|--------|------------|-----------|------------|----------|--------------|
| Dashboard | `MasterDashboardView.tsx` | Dense ops KPI shell | Clear hub entry, uses patterns | Visual hierarchy varies vs Figma on sub-widgets | P2 | CODE_VERIFIED |
| Organizations list/detail | `OrganizationsView.tsx`, `OrganizationDetailView.tsx` | Primary tenant admin surface | 8-tab detail, URL `orgTab` | Long forms; tab overflow on smaller widths | P1 | CODE_VERIFIED |
| Security & access | `security-access/SecurityAccessHub.tsx` | IAM focal point | Sectioned hub, URL helpers | MFA/IAM complexity; loading states uneven | P1 | CODE_VERIFIED |
| Connected vehicles | `connected-vehicles/ConnectedVehiclesHub.tsx` | High-value ops | DIMO drawer patterns (P6D4 tests) | Drawer density; permission copy i18n | P2 | CODE_VERIFIED |
| Billing | `billing/BillingControlCenter.tsx` | Delegate + Stripe surfaces | Sectioned billing URL state | Master billing permission edge cases documented in V2A | P1 | CODE_VERIFIED |
| Product management | `ProductManagementView.tsx` | Compliant | In-view `PageContainer variant="standard"` | Prior matrix wrongly flagged GAP (UX-001 corrected) | — | CODE_VERIFIED |
| Platform ops / integrations | `PlatformOpsHub`, `PlatformIntegrationsHub` | Engineering consoles | Consistent wide layout | Heavy tables; filter UX not standardized | P2 | CODE_VERIFIED |
| Intelligence / battery / tire hubs | `master/intelligence/*`, `battery-v2-*`, `TireCalibrationCenterView` | Power-user tools | Isolated engineering UIs | Different header patterns than core hubs | P3 | CODE_VERIFIED |

**Counts:** 25 primary `?view=` hubs in matrix (see MASTER_SCREEN_MATRIX).

## Rental (RENTUX) — sample screen records

| Screen | Source | Assessment | Strengths | Weaknesses | Priority | Verification |
|--------|--------|------------|-----------|------------|----------|--------------|
| Dashboard | `DashboardView.tsx` | Main landing | KPI cards, quick links | Competes visually with sidebar density | P2 | CODE_VERIFIED |
| Fleet + vehicle detail | `FleetHubView.tsx`, `vehicle-detail/*` | Core product anchor | Rich tabs (health, trips, damages) | Tab proliferation; mobile sidebar hidden | P1 | CODE_VERIFIED |
| Bookings / planner | `BookingsView.tsx`, `NewBookingView.tsx` | Revenue path | Planner integration | Error/empty on partial API failure varies | P1 | CODE_VERIFIED |
| Customers / finance | `CustomersView.tsx`, `FinanceView.tsx` | CRM + money | Unified finance navigation | Three finance modes in one view — cognitive load | P2 | CODE_VERIFIED |
| Communication / AI | `CommunicationCenterView.tsx`, `AIAssistantView.tsx` | Omnichannel | Legacy route consolidation | Legacy ids (`whatsapp-business`) still in types | P2 | CODE_VERIFIED |
| Settings / help | `SettingsView.tsx`, `HelpCenterView.tsx` | Org admin | MFA components shared | Settings depth vs operator simplicity gap | P3 | CODE_VERIFIED |

**Counts:** 30+ primary views (+ 8 vehicle detail tabs) per RENTAL_SCREEN_MATRIX and `rental/App.tsx` routing.

## Operator (OPUX) — sample screen records

| Screen | Source | Assessment | Strengths | Weaknesses | Priority | Verification |
|--------|--------|------------|-----------|------------|----------|--------------|
| Today | `OperatorTodayView.tsx` | Shift home | Task/booking summaries | Loading skeleton coverage partial | P1 | CODE_VERIFIED |
| Vehicles | `OperatorVehiclesView.tsx` | Field fleet list | Card layout, search | Detail handoff via shell context — deep link clarity | P1 | CODE_VERIFIED |
| Tasks | `OperatorTasksView.tsx` | Work queue | Touch-friendly lists | Filter persistence across tabs | P2 | CODE_VERIFIED |
| Scan | `OperatorScanView.tsx` | QR/barcode | Mobile intent | Camera permission UX edge cases | P2 | CODE_VERIFIED |
| More | `OperatorMoreView.tsx` | Settings overflow | Simple escape hatch | Secondary items buried | P3 | CODE_VERIFIED |
| Shell | `OperatorShell.tsx` | Bottom nav | Fixed nav, safe areas | Single route wrapper — limited deep linking vs rental | P2 | CODE_VERIFIED |

**Counts:** 5 tabs + booking/vehicle deep links (`OperatorApp.tsx`).

## High-priority findings (actionable, not implemented)

1. **Shell contract governance** — follow [`governance/SHELL_LAYOUT_CONTRACT.md`](../governance/SHELL_LAYOUT_CONTRACT.md) for cross-product edits (UX-002).
2. **Navigation consistency** — document when to use `?view=` vs path routes; reduce legacy view ids in rental types.
3. **Empty/loading/error** — standardize on `patterns/EmptyState`, `ErrorState`, `Skeleton*` across top 10 revenue screens (bookings, fleet, vehicle detail, operator today).
4. **Responsive pass** — Master wide hubs + Rental sidebar collapse at tablet breakpoints (P8 noted production authenticated gap remains for visual sign-off).
5. **i18n debt** — continue Integration 2 provider consolidation; no new hardcoded strings on touched screens.

## Production verification status

| Product | Authenticated production UI | Notes |
|---------|----------------------------|-------|
| Master | `PRODUCTION_NOT_VERIFIED` | P8 BLOCKED (MFA + role); baseline is code-only |
| Rental | `PRODUCTION_NOT_VERIFIED` | P8 partial matrix |
| Operator | `PRODUCTION_NOT_VERIFIED` | P8 partial matrix |

## P9 retirement note

Runtime P9 audit removed 2026-11-23. See [`P9_RETIRED_BY_OWNER_2026-11-23.md`](./P9_RETIRED_BY_OWNER_2026-11-23.md). Improvement work should **not** reintroduce audit-specific IAM; use normal roles and permissions.

## Related artifacts

- Improvement backlog: [`UI_UX_IMPROVEMENT_BACKLOG_2026-11-23.md`](./UI_UX_IMPROVEMENT_BACKLOG_2026-11-23.md)
- P8 evidence: [`AUTHENTICATED_UI_EVIDENCE_MATRIX_2026-11-22.md`](./AUTHENTICATED_UI_EVIDENCE_MATRIX_2026-11-22.md)