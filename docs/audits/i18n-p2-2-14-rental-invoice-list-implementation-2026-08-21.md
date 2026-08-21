# P2.2.14 — Rental Invoice List + Filters localization — Implementation audit

**Date:** 2026-08-21  
**Program baseline SHA:** `2538942add64df3aec20bccb29f58d7a138db0bd` (post–P2.2.13 / PR #1102)  
**Implementation branch:** `cursor/p2214-rental-invoice-list-i18n-3c10`  
**Pre-flight audit:** PR #1104 (audit-only — not used as implementation base)

## Provenance

Independent P2.2.14 pre-flight verdict **A — GO**. Implementation branched directly from verified program tip `2538942a`. P2.2.7B–P2.2.13 frozen boundaries preserved. Invoice Detail, Vendors, Insurance, Tenant Billing explicitly deferred.

## Scope table (frozen P214 boundary)

| File | Scanner (pre) | Hidden literals (pre) | Needs localization | Reason |
|------|---------------|----------------------|-------------------|--------|
| `InvoicesPage.tsx` | 2 | ~5 | yes | List chrome, create/AI actions, loading toast |
| `InvoiceList.tsx` | 1 | ~4 | yes | Empty/error/retry states |
| `InvoiceListTable.tsx` | 0 | ~12 | yes | Column headers, status/document/send labels |
| `InvoiceListMobileCards.tsx` | 1 | ~8 | yes | Mobile labels, status badges |
| `InvoiceListPagination.tsx` | 0 | ~4 | yes | Pagination chrome |
| `InvoiceFilters.tsx` | 13 | ~15 | yes | Filter UI, chips, aria labels |
| `InvoiceKpiGrid.tsx` | 0 | ~8 | yes | KPI labels/helpers (blind spot) |
| `InvoiceKpiCard.tsx` | 0 | 0 | no | Presentational only |
| `hooks/useInvoices.ts` | 0 | ~2 | yes | Load error toast |
| `invoiceListLabels.ts` | 0 | ~18 | yes | Document/send status maps |
| `invoiceConstants.ts` | 0 | ~45 | yes | Filter/sort/direction machine constants + labels → adapter |
| `invoice-list-i18n.ts` | n/a (new) | n/a | yes | Presentation adapter + locale formatters |

**Split:** Detail-only maps moved to `invoice-detail.constants.ts` (out of P214 boundary).

## Key audit

| Classification | Count | Detail |
|----------------|-------|--------|
| New `invoices.list.*` module keys | **125** | `invoices.list.{en,de}.ts` |
| Reused existing keys at call sites | **~4** | `nav.customerInvoices`, legacy `invoices.*` patterns via new module |
| Net canonical delta | **+125** | 7417 → **7542** |
| EN/DE parity | **100%** | 7542 / 7542 |

## Scanner accounting

**Command:** `node scripts/i18n-hardcoded-scan.mjs`

| Metric | Pre-P2.2.14 (`2538942a`) | After implementation | Delta |
|--------|--------------------------|----------------------|-------|
| Global findings | 1832 | **1817** | −15 |
| Rental | 565 | **550** | −15 |
| Finance/Billing (rental module) | 142 | **125** | −17 |
| P214 enforce-clean (12 paths) | 17 | **0** | clean |
| P213 enforce-clean | 0 | 0 | preserved |
| P212 enforce-clean | 0 | 0 | preserved |
| Canonical EN keys | 7417 | **7542** | +125 |
| Canonical DE keys | 7417 | **7542** | +125 |

**Inventory drift note:** Global enforce-clean summary reports 2 findings on pre-existing P2.2.3 paths (`VehiclePickerStep.tsx` shared strings) — unrelated to P214.

## Machine-semantic verification (Category E = 0)

Preserved unchanged:

- Invoice status enums (`DRAFT`, `ISSUED`, `PAID`, `OVERDUE`, …)
- Filter machine values (`all`, `outgoing`, `incoming`, document/send filter tokens)
- Sort keys (`invoiceDate`, `dueDate`, `totalGross`, `status`, `createdAt`) and sort order (`asc`/`desc`)
- `buildInvoiceListApiParams` / URL sync query keys
- Amount cents, currency codes, invoice/booking/customer IDs
- `invoiceUtils.ts` STATUS_MAP (detail scope — untouched)

## Shim accounting

| Metric | Before | After |
|--------|--------|-------|
| Shim total | 29 | 29 |
| Production compat | 18 | 18 |
| New compat consumers | 0 | 0 |

## Tests

- `rental-invoice-list-localization.test.tsx` — 17 tests (EN/DE render, machine semantics, P214 enforce-clean, blind-spot guards)
- Updated: `InvoiceList.test.tsx`, `InvoiceFilters.test.tsx`, `InvoiceListMobileCards.test.tsx`, `invoiceListState.test.ts`, `invoiceListLabels.test.ts`
- `hardcoded-copy-guard.test.ts` — P214 boundary + blind-spot guards

## Validation

| Check | Result |
|-------|--------|
| `npm run i18n:check` | PASS (7542/7542 parity) |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| P214 localization tests | PASS (17/17) |

## Verdict

**A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT P2.2.14 RE-AUDIT**
