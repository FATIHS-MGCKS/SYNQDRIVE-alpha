# Invoice Frontend Module Split (V4.9.457)

## Purpose

Structural refactor of the monolithic `InvoicesView.tsx` (~1300 lines) into bounded components and hooks — **no visible UI/behavior change**. Prepares the invoice surface for upcoming design work.

## Entry point

| Export | Role |
|--------|------|
| `InvoicesPage` | Orchestrator: view routing (`list` / `create` / `upload` / `detail`), header actions |
| `InvoicesView` | Thin backward-compatible wrapper → `InvoicesPage` |

`FinanceView` continues to import `InvoicesView`.

## Component responsibilities

| Module | Responsibility |
|--------|----------------|
| `InvoicesPage` | Page shell, view state, wires hooks + subviews |
| `InvoiceKpiGrid` / `InvoiceKpiCard` | KPI strip + filter shortcuts |
| `InvoiceFilters` | Search, direction/status dropdowns, active-filter chips |
| `InvoiceList` | Table shell, loading/empty states |
| `InvoiceListRow` | Single table row |
| `InvoiceDetail` | Detail layout composition |
| `InvoiceDetailHeader` | Title, status, action buttons |
| `InvoiceTimeline` | Amounts + date milestones (formerly “Rechnungsdetails”) |
| `InvoiceRelations` | Customer/vendor/booking links + linked tasks |
| `InvoiceDocuments` | PDF/email document actions |
| `InvoicePayments` | Payment history table |
| `InvoiceLineItems` | Line items table |
| `InvoiceNotes` | Editable notes |
| `CreateInvoiceDialog` | Multi-step create flow |
| `RecordPaymentDialog` | Inline payment capture form |
| `SendInvoiceDialog` | Wraps `SendDocumentsEmailModal` |

## Hooks & shared modules

| Module | Responsibility |
|--------|----------------|
| `hooks/useInvoices` | List load, stats, lookup data, client-side filters |
| `hooks/useInvoiceDetail` | Fetch full invoice on row click |
| `hooks/useInvoiceActions` | Issue, sent, pay, record payment, notes, email |
| `invoiceTypes.ts` | DTO types (unchanged) |
| `invoiceFormatters.ts` | Re-exports `formatAmount`, `formatDate`, `displayNumber`, guards |
| `invoiceUtils.ts` | Canonical formatters + status map (source of truth) |
| `invoiceConstants.ts` | Type map, templates, filter options |
| `invoiceTheme.ts` | Dark/light class tokens |
| `invoiceList.util.ts` | Pure filter/count helpers (tested) |

## Preserved behavior

- Internal view routing (`list` / `create` / `upload` / `detail`) — no URL deep-link existed before
- Loading, error toasts, empty states
- ORG_ADMIN / MASTER_ADMIN email gate
- All API calls via existing `api.invoices.*` / `api.documents.*`
- No new global state libraries

## Tests

- `invoiceList.util.test.ts` — filter/count logic
- `invoiceClassification.test.ts` — unchanged
