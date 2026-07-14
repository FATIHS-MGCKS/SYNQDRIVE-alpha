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
| `invoice-detail-relations.util.ts` | Customer/booking/vehicle summary mapping + fallbacks |
| `invoice-detail.mapper.ts` | Pure mapping + display values |
| `invoice-detail-actions.util.ts` | `canEdit` / `canIssue` / `canSend` / capabilities |
| `invoice-detail-read.service.ts` | Org-scoped load + mapper |
| `invoices.controller.ts` | Route registered before `GET :id` |

## Query pattern

1. `orgInvoice.findFirst` + tasks, payments, vendor  
2. `Promise.all`: customer, vehicle, booking, outbound emails (invoiceId OR bookingId), activity log, `InvoiceDocumentsReadService`

All relation loads filter `organizationId` — cross-tenant IDs never resolve foreign rows.

Internal document errors are never included (`includeInternalErrors: false`).

## Relation summaries (fachliche Auflösung)

### Customer (`InvoiceCustomerSummaryDto`)

- `displayName` — person name or company (CORPORATE prefers `company`)
- `customerNumber` — synthetic `K-{shortId}` until a dedicated column exists
- `firstName`, `lastName`, `companyName`, `email`, `phone`, `status`
- `availability`: `AVAILABLE` | `ARCHIVED` | `DELETED` | `MISSING`
- `navigation`: `{ entityId, routeKey: 'customer-detail', label }` (null when deleted)

### Booking (`InvoiceBookingSummaryDto`)

- `bookingNumber` — `BK-{idSuffix}`; `reference` — public booking ref via `bookingRef()`
- `startDate`, `endDate`, `status`, `pickupStation`, `returnStation`
- `bookingCustomerId` — used for divergence check
- `availability` + `unavailableLabel` when row missing

### Vehicle (`InvoiceVehicleSummaryDto`)

- `displayName` — central `vehicleDisplayName()` from rental-rules mapper
- Fallback: license plate → make/model → snapshot from `extractedData` → `"Fahrzeugdaten nicht verfügbar"`
- `vin` only when `includeVin: true` (query/body flag; default false)
- `OUT_OF_SERVICE` → `ARCHIVED`

### Invoice customer vs booking customer

**They can diverge.** `OrgInvoice.customerId` is the billing customer on the invoice; `Booking.customerId` is the rental contract holder. Corporate billing, manual invoice edits, or post-booking customer changes can cause mismatch.

`relations.customerDiverges` + German message; **invoice customer is leading** for the invoice document.

### Historical snapshots

`parseInvoiceRelationSnapshots(inv.extractedData)` reads `customerName`, `companyName`, `vehicleDisplayName`, `licensePlate`, `vehicleMake`, `vehicleModel` when live rows are deleted — preferred for historical invoices when extraction stored labels.

### Display rules

- Never use raw UUID as primary display text (`assertNoUuidPrimaryDisplay` in tests)
- Deleted/archived relations expose clear labels, not IDs
- No org-foreign relation resolution

## Frontend

`api.invoices.getDetail` → `normalizeInvoiceDetailFromApi` flattens nested DTO for `InvoicesView` while preserving `customer`, `booking`, `vehicle`, `relations` summaries.

## Not in scope

- Removing legacy `GET :id` response
- Full detail page redesign (PDF open, payment method i18n)
