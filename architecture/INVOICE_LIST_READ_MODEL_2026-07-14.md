# Invoice List Read Model (V4.9.465)

## Scope

Scalable backend read-model for the invoice overview (`GET /organizations/:orgId/invoices/list`). Replaces client-side assembly of customer, booking, vehicle, document, and send data across multiple frontend requests.

## Endpoint

`GET /organizations/:orgId/invoices/list`

Returns `PaginatedResult<InvoiceListItemDto>` with offset pagination (`page`, `limit` max 100).

Legacy `GET /organizations/:orgId/invoices` remains for detail-adjacent consumers (Financial Insights, dashboard, extraction queue).

## InvoiceListItemDto

| Field | Source |
|-------|--------|
| `invoiceNumber` | `displayInvoiceNumber()` — never raw UUID |
| `direction` | derived from `OrgInvoiceType` |
| `customerDisplayName` / `supplierDisplayName` | batch-loaded Customer / Vendor |
| `bookingNumber` | `BK-{id suffix}` |
| `vehicleDisplayName` / `licensePlate` | batch-loaded Vehicle |
| `totalGross` / `paidAmount` / `outstandingAmount` | cents on `OrgInvoice` |
| `documentStatus` / `activeDocumentId` | `GeneratedDocument` |
| `lastSendStatus` / `lastSentAt` | latest `OutboundEmail` per invoice |
| `isOverdue` | derived from due date + outstanding + status |
| `sourceType` / `creationChannel` | derived from type + extraction link |
| `openTaskCount` / `hasOpenTask` | batch-loaded `OrgTask` |

## Query capabilities

- **Pagination:** offset via shared `parsePagination` / `buildPaginatedResult`
- **Sort:** `invoiceDate` (default desc), `dueDate`, `totalGross`, `status`, `invoiceNumber`, `createdAt` — stable `id` tie-breaker
- **Search:** invoice number, title, vendor name, customer name/company, vendor, booking ref, plate, VIN, document number
- **Filters:** direction, status, type, due range, overdue, document present/missing/failed, send status, station (via booking pickup/return), invoice date range, includeVoid

## Performance

- Main list: 1× `findMany` + 1× `count`
- Enrichment: fixed batch queries (customers, vendors, vehicles, documents, emails, tasks) — **not N+1**
- Search pre-resolution: parallel scoped lookups + booking suffix SQL (`$queryRaw`)
- Indexes: `(organizationId, dueDate)`, `(organizationId, type, status)`, `(organizationId, invoiceId)` on `outbound_emails`

## Frontend migration

- `useInvoices` → `api.invoices.listItems` + `api.invoices.stats`
- Lookup data (customers/vehicles/vendors) lazy-loaded only for create/upload dialogs
- `invoiceListItem.mapper.ts` maps read-model rows to legacy `Invoice` list row shape

## Tests

- `invoice-list-query.util.spec.ts`
- `invoice-list-item.mapper.spec.ts`
- `invoice-list-read.service.spec.ts` (bounded query count)
- `invoiceListItem.mapper.test.ts` (frontend)

## Stats extension

`GET .../invoices/stats` now includes `statusCounts` via `groupBy` for filter dropdown counts without loading the full list.
