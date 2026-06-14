# Changes & Architektur — Booking Document Lifecycle (2026-06-13)

> In-repo record for the SynqDrive Booking Document Lifecycle feature. Full feature
> docs: [`docs/booking-document-lifecycle.md`](../docs/booking-document-lifecycle.md).

## Changes

- Added a central **`documents` module** (`backend/src/modules/documents/`) that
  owns rendering, PDF generation, private storage, document metadata, versioning,
  download and per-booking bundle orchestration. PDF generation is **not**
  duplicated in bookings/invoices/handover — those modules only fire triggers.
- New services: `GeneratedDocumentsService`, `LegalDocumentsService`,
  `BookingDocumentBundleService`, `DocumentNumberingService`,
  `DocumentRendererService`, `LocalDocumentStorageService`. Ports:
  `DocumentStoragePort` (`DOCUMENTS_STORAGE`) and `DocumentRenderer`
  (`DOCUMENT_RENDERER`), both DI-bound and swappable (S3 / HTML→PDF later).
- 6 PDF templates (booking invoice, deposit receipt, rental contract, pickup +
  return handover protocol, final invoice) built on a renderer-agnostic
  `RenderableDocument` model. Renderer uses **pdfkit** (pure-JS, no headless
  browser) — added `pdfkit` + `@types/pdfkit`.
- Controllers: `documents.controller.ts` (booking documents, generate-initial-
  bundle, regenerate, metadata, void, authenticated download) and
  `legal-documents.controller.ts` (Administration upload/list/activate/archive/
  download). All org-scoped via `OrgScopingGuard` + `RolesGuard`; downloads stream
  the stored file via `StreamableFile` (no public URLs).
- Prisma: new models `GeneratedDocument`, `OrganizationLegalDocument`,
  `BookingDocumentBundle`, `BookingDeposit`, `RentalContract`; `OrgInvoiceType`
  gained `OUTGOING_FINAL`. Relations kept as indexed scalar IDs except
  `organizationId` (explicit relation, `onDelete: Cascade`). Migration
  `20260613200000_booking_document_lifecycle` (idempotent).
- Config: `documents.config.ts` (`registerAs('documents', …)`) + `.env.example`
  (`DOCUMENT_STORAGE_PROVIDER`, `LOCAL_DOCUMENT_STORAGE_DIR`, `DOCUMENT_PDF_RENDERER`,
  `DOCUMENT_GENERATION_ENABLED`, `DOCUMENT_LEGAL_UPLOAD_MAX_MB`). `.gitignore`
  already excludes `storage/`, `uploads/`, `.local-storage/`.
- Frontend: `lib/api.ts` gained `documents` + `legalDocuments` namespaces and
  authenticated blob download helpers (`fetchBlob`, `openAuthedDocument`); new
  `LegalDocumentsTab` (Administration → Rechtliche Dokumente, ORG_ADMIN gated,
  wired into `SettingsView` / `Sidebar` / `TopBar` + 8 i18n locales) and
  `BookingDocumentsSection` (booking detail → Dokumente — live bundle, status
  badge, download + regenerate, missing-legal warning). The old hardcoded
  Documents block in `BookingsView` (fake filenames, dead buttons) was replaced.
- Tests: `documents.service.spec.ts` (24 tests; renderer + storage mocked).

## Architektur (signal/data-flow deltas)

- **New document engine**: business modules provide data; `documents` renders →
  stores bytes via `DocumentStoragePort` (local-disk impl, S3-ready) under a
  fully-generated, path-traversal-safe object key → records `GeneratedDocument`
  metadata with a render-time `snapshot` JSON + sha256 checksum. Downloads serve
  the stored file (never re-rendered from mutable data).
- **Booking confirmed → bundle**: `BookingsService` fires (fire-and-forget)
  `generateInitialBundle` after its invoice promise resolves, so the existing
  `OrgInvoice (OUTGOING_BOOKING)` is **reused** (no duplicate booking invoice).
  Bundle status is PENDING/PARTIAL/COMPLETE/FAILED; missing active AGB/Widerruf →
  PARTIAL with a warning, never a crash.
- **Pickup/return → documents**: `BookingsHandoverService` fires protocol
  generation after the existing handover transaction succeeds; return additionally
  generates the final invoice (`OUTGOING_FINAL`) + PDF. No change to existing
  handover or booking-completion logic.
- **Legal versioning**: `LegalDocumentsService.activate` archives the previous
  ACTIVE `(org, type, language)` in a transaction → exactly one active AGB/Widerruf;
  active versions are snapshotted into the bundle as `STATIC_LEGAL` references to
  the immutable uploaded object.
- **No changes** to DIMO, telemetry, trips, health, vehicle latest states, AI
  upload, or invoice/handover CRUD. Circular deps (`bookings ↔ documents`) handled
  with `forwardRef`.

## Notes

- Renderer choice (pdfkit, no Chromium) keeps deployment light; the renderer port +
  `RenderableDocument` model allow a later HTML→PDF swap without template changes.
- Deposit amount, post-return charges and per-org contract clauses are
  TODO-marked (zero/neutral defaults) — no invented charges or legal text.
