# Invoice Provenance Model (V4.9.432–433)

**Status:** Schema + read model + write paths implemented  
**Datum:** 2026-07-14

---

## Problem

`OrgInvoiceType` (outgoing/incoming product type) was used as a proxy for **Herkunft** (who triggered, which channel, which source object). That conflated billing semantics with creation provenance — e.g. `OUTGOING_FINAL` appeared as „Manuell“ in UI while being system-generated. Booking invoices from the wizard were labeled „Automatisch (Buchung)“ even when a user triggered creation.

## Model (orthogonal to `type`)

| Dimension | Field | Purpose |
|-----------|-------|---------|
| Channel | `creationChannel` | How creation was initiated (UI, wizard, API, import, extraction, automation, migration) |
| Source object | `sourceType` + `sourceId` | Fachliches Ursprungsobjekt (booking, document, damage, …) |
| Actor | `triggeredByType` + `createdByUserId` | Who/what triggered (user, system, automation, API client, migration) |
| Automation | `automationId` | Optional workflow/automation reference |
| Trace | `correlationId` | Optional request/correlation id |
| Time | `createdAt` | Existing invoice timestamp |

**Rule:** Technical generator (e.g. bundle pipeline) ≠ fachlicher Auslöser (user action). A system-generated invoice can still be user-triggered.

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
- Human-readable: `summary`, `channelLabel`, `sourceLabel`, `triggerLabel` on detail DTO
- Wizard + user: summary e.g. „Buchungsassistent · Buchung · Benutzer“ — **not** „Automatisch (Buchung)“
- `kind` / `label` retained for gradual UI migration (deprecated in DTO comments)
- `createdByUserDisplayName` resolved at read via org-scoped `OrganizationMembership` — **no PII snapshot column** on invoice
- Cross-org `createdByUserId` stripped in mapper when membership missing

## Write model (V4.9.433)

- `invoice-provenance-write.util.ts` — presets + `provenanceToPrismaFields()`
- `InvoicesService.create(orgId, data, context?)` merges provenance; `resolveOrgScopedUserId()` validates tenant membership
- `InvoicesService.createBookingInvoice(..., context?)` defaults to `provenanceForBookingWizardInvoice`

### Wired creation paths

| Path | Channel | Trigger | Source | Caller |
|------|---------|---------|--------|--------|
| New booking form | BOOKING_WIZARD | USER | BOOKING | `BookingsService.create` → `createBookingInvoice` + `userId` |
| Booking wizard confirm | BOOKING_WIZARD | USER | BOOKING | `BookingWizardDraftService` + `correlationId: draftId` |
| Manual invoice UI | MANUAL_UI | USER | MANUAL/BOOKING/OTHER | `InvoicesController.create` + `@CurrentUser` |
| Document extraction confirm | DOCUMENT_EXTRACTION | USER | DOCUMENT | `DocumentExtractionApplyService` |
| Bundle PDF fallback / final invoice | AUTOMATION | USER or SYSTEM | BOOKING | `BookingDocumentBundleService` + `automationId` |
| API (preset ready) | API | API_CLIENT | — | `provenanceForApiInvoice` (controller currently uses MANUAL_UI) |

### Reserved / not found

- **IMPORT** — no dedicated invoice import path in codebase
- **Workflow automation** — `provenanceForWorkflowAutomation` preset only; no invoice creator wired
- **Migration/backfill** — `provenanceForSystemMigration` preset for future scripts; no `orgInvoice.create` in backfill
- **Damage/service** — no separate `orgInvoice.create` beyond paths above
- **Seed** — no `OrgInvoice` rows in `prisma/seed.ts`

Background jobs pass `userId` / `correlationId` from the originating request when available; otherwise `triggeredByType: SYSTEM` with `correlationId` tied to booking/draft/extraction id.

## Tests

- `invoice-provenance.util.spec.ts` — read mapper + wizard summary
- `invoice-provenance-write.util.spec.ts` — preset shapes
- `invoices.service.provenance.spec.ts` — create + booking invoice persistence
- `invoice-wizard-flow.baseline.spec.ts` — wizard provenance args

## Files

| File | Role |
|------|------|
| `prisma/schema.prisma` | Enums + columns |
| `invoice-provenance.util.ts` | Read mapper + `InvoiceProvenanceWriteInput` |
| `invoice-provenance-write.util.ts` | Write presets |
| `invoices.service.ts` | Create paths merge provenance |
| `invoice-detail.mapper.ts` | Detail DTO provenance block |
| `invoice-detail-read.service.ts` | Org-safe actor resolution |
