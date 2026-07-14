# Invoice Detail Read Model (M1 Detail API)

**Status:** Implemented  
**Datum:** 2026-07-14  
**Endpoint:** `GET /api/v1/organizations/:orgId/invoices/:id/detail`  
**Legacy:** `GET .../invoices/:id` unchanged for backward compatibility

---

## Summary

Typed aggregate read model for the invoice detail page. One orchestrated load (invoice + parallel relation fetches, no N+1) returns invoice core, amounts, resolved customer/supplier/booking/vehicle summaries, line items, payments, document versions, outbound email history, tasks, provenance, activity timeline, and action capabilities with blocking reasons.

## Components

| File | Role |
|------|------|
| `invoice-detail.types.ts` | `InvoiceDetailDto` contract |
| `invoice-detail.mapper.ts` | Pure mapping + display values |
| `invoice-detail-actions.util.ts` | `canEdit` / `canIssue` / `canSend` / capabilities |
| `invoice-detail-read.service.ts` | Org-scoped load + mapper |
| `invoices.controller.ts` | Route registered before `GET :id` |

## Query pattern

1. `orgInvoice.findFirst` + tasks, payments, vendor  
2. `Promise.all`: customer, vehicle, booking, outbound emails (invoiceId OR bookingId), activity log, `InvoiceDocumentsReadService`

Internal document errors are never included (`includeInternalErrors: false`).

## Not in scope

- Frontend detail page redesign (optional `api.invoices.getDetail` typed only)
- Removing legacy `GET :id` response
