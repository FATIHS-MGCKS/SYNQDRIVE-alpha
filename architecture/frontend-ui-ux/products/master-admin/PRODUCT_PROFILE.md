# Product Profile — Master Admin (Control Plane)

**Domain:** Core platform administration  
**Route:** `/master`  
**Code root:** `frontend/src/master/`  
**Epistemic baseline:** CONFIRMED @ `413175e8c` (repository); UNKNOWN live UI

## UX intent

Enterprise **control plane**: tenant lifecycle, security, connectivity, billing, platform ops, engineering tools. **Not** fleet day-to-day operations (Rental).

## App shell contract (CONFIRMED)

| Piece | Implementation |
|-------|----------------|
| Shell | `MasterAdminShell` → `AppShell variant="master"` |
| Sidebar | `master/components/Sidebar.tsx` — grouped nav, badges, collapse persist |
| Top chrome | `MasterGlobalChrome` → `TopBar` (welcome, theme, integrations shortcut) |
| Main | `#master-main`; children wrapped in `PageContainer` **expected** |
| MFA | `MasterMfaGate`, shared `MfaStepUpDialog` |
| Toasts | `sonner` in shell overlays |

## Routing & URL (CONFIRMED)

- Single React Router route; views via `?view=<id>`.
- `pushMasterNavState` on navigate; `popstate` handled in `master/App.tsx`.
- Hub-specific params: `orgId`, `securityAccess`, `masterBilling*`, `cvSection`, intelligence context params, `platformOps` sections, etc.
- Legacy redirects in `master-nav-url.ts` (e.g. `users` → `security-access`).

## Navigation inventory (CONFIRMED)

From `MASTER_NAV_ITEMS` / groups in `master-nav.config.ts`:

| Group | Views |
|-------|-------|
| Overview | dashboard |
| Tenants | organizations, prospects, security-access |
| Fleet | vehicles, device-inventory, vehicle-logbook |
| Commerce | billing, product-management |
| Connectivity | platform-integrations, service-client-management, vsi-intelligence, apds-intelligence, high-mobility |
| Partners | parts-accessories, insurances, voice-assistant |
| Operations | platform-ops, support |
| Engineering | battery-v2-*, tire-v3-calibration-center, architektur, changes |

## Hub / screen matrix (top-level)

See [`../../inventories/MASTER_SCREEN_MATRIX.md`](../../inventories/MASTER_SCREEN_MATRIX.md).

## Page framework (governing contract)

**Source:** `docs/ui/master-admin-canonical-page-framework.md` (partially HISTORICAL) + code:

| Element | Canonical component | Adoption |
|---------|---------------------|----------|
| Header | `MasterPageHeader` | Hubs + many views |
| Tabs | `MasterPageTabs` / header-integrated tabs | Major hubs |
| Section | `MasterPageSection` | Organization detail, hubs |
| States | `MasterLoadingState`, `MasterErrorState` + patterns `EmptyState` | Hubs |
| Width | `PageContainer` `standard|wide|full` | **Gap:** product-management |

## Legacy / consistency gaps (CONFIRMED)

| Gap | Evidence |
|-----|----------|
| DE-only nav chrome | `master-nav-i18n.ts` |
| Hardcoded DE hub titles | e.g. `SecurityAccessHub`, `PlatformOpsHub` |
| `sq-tab-bar` / muted pills | `ArchitekturView`, `ChangesView`, `HighMobilityDataView`, … |
| Orphan `RightSidebar.tsx` | not imported in `App.tsx` |
| No global search / breadcrumbs | `TopBar` minimal |
| User CRUD toasts mixed EN/DE | `master/App.tsx` |

## Dependencies

- **Shared:** `components/ui`, `components/patterns`, `components/mfa`, `components/shell`
- **Not shared with Rental:** Master Sidebar/TopBar/shell framework components under `master/shell` and `master/components`

## Contracts for agents

- Do **not** import Rental sidebar into Master.
- Prefer `MasterPageHeader` + patterns over new local tab primitives.
- URL changes must update corresponding `*-url.ts` helpers and tests where present.