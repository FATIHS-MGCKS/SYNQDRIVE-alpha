# Invoice Detail Documents Panel (V4.9.460)

## Scope

Rechnungsdetail — Dokumentbereich auf Basis des kanonischen `GeneratedDocument`-Modells (über `invoiceId`, optional `bookingId`).

## Backend

### Endpoints (`InvoicesController`)

| Method | Route | Rolle |
|--------|-------|-------|
| GET | `/organizations/:orgId/invoices/:id/documents` | Panel + Capabilities + Versandhistorie |
| POST | `/organizations/:orgId/invoices/:id/documents/generate?regenerate=true` | PDF erzeugen / neue Version (ORG_ADMIN) |
| POST | `/organizations/:orgId/invoices/:id/documents/send-email` | Rechnungsmail (ORG_ADMIN) |
| POST | `/organizations/:orgId/invoices/:id/documents/delivery/:emailId/retry` | Fehlversand wiederholen |

### Services

- **`InvoiceDocumentsService`**: Panel-State (`ACTIVE` \| `EMPTY` \| `GENERATING` \| `FAILED`), Versionen via `GeneratedDocumentsService.listForInvoice`, In-Memory-Generierung (`generating` Map), Fehler-Map (`failures`), Capability-Berechnung (`invoice-documents.capabilities.ts`), deutsche Labels (`invoice-documents.labels.ts`).
- **`InvoiceDocumentEmailService`**: Versand über `OutboundEmailSourceType.INVOICE_SINGLE` — **nicht** `BookingDocumentEmailService`; `bookingId` keine Voraussetzung.
- **Generierung**: `OUTGOING_BOOKING` + `bookingId` → `BookingDocumentBundleService`; sonst Standalone-PDF via `buildBookingInvoiceDocument` + `generatedDocs.createFromPdf` mit `invoiceId`.

### Panel DTO

- `activeDocument`, `versions[]`, `capabilities` (preview/download/sendEmail/generate/regenerate/retry mit `allowed` + `reason`)
- `generation` (status, lastAttemptAt, errorMessage)
- `deliveryHistory` (OutboundEmail scoped by `invoiceId`)
- `hasIncomingAttachment` (`OrgInvoice.imageUrl`)

## Frontend

- **`useInvoiceDocuments`**: lädt Panel, pollt bei `GENERATING`, Aktionen delegiert an `invoiceDocuments.api.ts`.
- **`InvoiceDocuments`**: UI-Zustände A–E + Versandhistorie; keine Roh-Enums; signed URLs nur via `api.documents.open` bei Klick.
- **`SendInvoiceDialog`**: Invoice-Endpunkt (`sendDocumentEmail`), kein `SendDocumentsEmailModal` / keine `bookingId`-Pflicht.
- **`buildInvoiceDetailDto`**: Header-Gates aus `documentsPanel.capabilities` wenn Panel geladen.

## Tests

- `invoiceDocuments.mapper.test.ts`
- `InvoiceDocuments.test.tsx` (Zustände A–E)
- `useInvoiceDocuments.integration.test.ts` (API-Flow ohne bookingId)
