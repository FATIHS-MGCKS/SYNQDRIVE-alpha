# Shared Components — Dependency Inventory

**SHA:** `413175e8c`

## `frontend/src/components/ui/` (shadcn + SynqDrive)

~45 primitives: `button`, `dialog`, `sheet`, `drawer`, `table`, `tabs`, `input`, `select`, …

**Consumers:** Master hubs (heavy), Rental (heavy), Operator (selective).

## `frontend/src/components/patterns/`

| Export | Role |
|--------|------|
| `StatusChip`, `HealthStatusChip` | Semantic tones |
| `PageHeader`, `SectionHeader` | Legacy/alternate headers |
| `DataCard`, `MetricCard` | KPI/summary surfaces |
| `DataTable` | Tabular data |
| `EmptyState`, `ErrorState`, `Skeleton*` | States |
| `AppDialog`, `FormDialog`, `ConfirmDialog` | Modal stack |
| `DetailDrawer` | Side detail |
| `chrome-tab-bar` utilities | Tab strip styling |
| `surface.ts` | L0/L1 class resolution |
| `AppShell` re-export | Layout |

## `frontend/src/components/shell/`

| File | Master | Rental |
|------|--------|--------|
| `app-shell.tsx` | yes | yes |
| `nav-utils.ts` | via Sidebar patterns | rental sidebar |
| `nav-primitives.tsx` | yes | partial |

## `frontend/src/components/surface/`

Liquid glass lens (feature-flagged) — **primarily Rental map/trips**, not Master ops.

## `frontend/src/components/mfa/`

Shared MFA step-up — Master (confirmed), Rental settings (confirmed).

## Ownership impact matrix

| Path | Owner authority | Global impact |
|------|-----------------|---------------|
| `styles/theme.css` | **Frontend UI/UX** (this) | **All products** |
| `components/ui/*` | **Frontend UI/UX** | High |
| `components/patterns/*` | **Frontend UI/UX** | High |
| `master/shell/*` | Master product profile | Master only |
| `rental/components/Sidebar.tsx` | Rental product profile | Rental only |
| `operator/components/*` | Operator product profile | Operator only |

## Duplicate UI domains (not shared code)

| Domain | Master | Rental |
|--------|--------|--------|
| Voice admin UI | `VoiceAssistantAdminView` | `voice-assistant/*` |
| Parts/Insurances | Admin views | Tenant views |
| Support | `SupportView` + ops | `SupportView`, help center |