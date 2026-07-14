# Invoice Provenance Model (V4.9.432)

**Status:** Schema + read model implemented; write paths follow in next phase  
**Datum:** 2026-07-14

---

## Problem

`OrgInvoiceType` (outgoing/incoming product type) was used as a proxy for **Herkunft** (who triggered, which channel, which source object). That conflates billing semantics with creation provenance — e.g. `OUTGOING_FINAL` appeared as „Manuell“ in UI while being system-generated.

## Model (orthogonal to `type`)

| Dimension | Field | Purpose |
|-----------|-------|---------|
| Channel | `creationChannel` | How creation was initiated (UI, wizard, API, import, extraction, automation, migration) |
| Source object | `sourceType` + `sourceId` | Fachliches Ursprungsobjekt (booking, document, damage, …) |
| Actor | `triggeredByType` + `createdByUserId` | Who/what triggered (user, system, automation, API client, migration) |
| Automation | `automationId` | Optional workflow/automation reference |
| Trace | `correlationId` | Optional request/correlation id |
| Time | `createdAt` | Existing invoice timestamp |

### Enums (Prisma)

- `InvoiceCreationChannel`: MANUAL_UI, BOOKING_WIZARD, API, IMPORT, DOCUMENT_EXTRACTION, AUTOMATION, SYSTEM_MIGRATION
- `InvoiceSourceType`: BOOKING, DAMAGE, SERVICE, MANUAL, DOCUMENT, SUBSCRIPTION, OTHER
- `InvoiceTriggeredByType`: USER, SYSTEM, AUTOMATION, API_CLIENT, MIGRATION

## Schema

Additive columns on `org_invoices` (all nullable). Legacy rows keep `NULL` — **no backfill inventing actors or channels**.

Migration: `20260714210000_invoice_provenance`

## Read model

- `invoice-provenance.util.ts` — `mapInvoiceProvenance()`
- `classification`: `RECORDED` when channel + source + trigger are stored; else `LEGACY`
- Legacy rows: `creationChannel: LEGACY`, `triggeredByType: UNKNOWN`; `sourceType`/`sourceId` inferred only from **existing FKs** (`bookingId`, `documentExtractionId`, `vendorId`) — factual, not invented
- `kind` / `label` retained for gradual UI migration (deprecated in DTO comments)
- `createdByUserDisplayName` resolved at read via org-scoped `OrganizationMembership` — **no PII snapshot column** on invoice
- Cross-org `createdByUserId` stripped in mapper when membership missing

## Not in scope (this phase)

- Populating provenance on create paths (wizard, bundle, extraction, manual UI)
- Removing `OrgInvoiceType` or legacy `kind`/`label` from API

## Files

| File | Role |
|------|------|
| `prisma/schema.prisma` | Enums + columns |
| `invoice-provenance.util.ts` | Mapper + `InvoiceProvenanceWriteInput` for future writes |
| `invoice-detail.mapper.ts` | Detail DTO provenance block |
| `invoice-detail-read.service.ts` | Org-safe actor resolution |
