# Booking Document Lifecycle

A central **document engine** for SynqDrive. Business modules (bookings, invoices,
handover protocols) own the *data*; the `documents` module owns *rendering, PDF
generation, private storage, metadata, versioning, download and bundle
orchestration*. PDF generation is **not** scattered across bookings/invoices/
handover — those modules only fire small triggers into this engine.

> **Legal disclaimer.** SynqDrive generates neutral, configurable document
> templates (invoice / deposit receipt / rental contract / handover protocol /
> final invoice). It does **not** provide legal advice and does **not** ship
> legally-binding contract text. AGB (Terms & Conditions) and Widerrufsbelehrung
> (withdrawal information) are **uploaded and versioned by the rental company**.
> Every template must be reviewed and configured by the rental company / its
> legal counsel before use.

## Product flow

| Stage | Documents |
| --- | --- |
| **Booking confirmed** | Booking invoice (Rechnung), Deposit receipt (Kautionsbeleg), Rental contract (Mietvertrag), AGB*, Widerrufsbelehrung* |
| **Pickup** | Pickup handover protocol (Übergabeprotokoll Abholung) |
| **Return** | Return handover protocol (Übergabeprotokoll Rückgabe), Final invoice (Schlussrechnung / Endabrechnung) |

\* AGB + Widerrufsbelehrung are **not generated** — the active uploaded version is
snapshotted into the booking bundle. If no active version exists, the bundle
degrades to **PARTIAL** with a clear warning (it never crashes the booking flow).

## Generated vs. uploaded documents

| Document type | Origin | Source |
| --- | --- | --- |
| `BOOKING_INVOICE` | `GENERATED` | reuses the existing `OrgInvoice (OUTGOING_BOOKING)`; PDF rendered from invoice data |
| `DEPOSIT_RECEIPT` | `GENERATED` | `BookingDeposit` (security deposit — **not** a taxable revenue invoice) |
| `RENTAL_CONTRACT` | `GENERATED` | `RentalContract` snapshot (parties, vehicle, period, price, deposit, attached legal versions) |
| `HANDOVER_PICKUP` | `GENERATED` | existing `BookingHandoverProtocol (PICKUP)` |
| `HANDOVER_RETURN` | `GENERATED` | existing `BookingHandoverProtocol (RETURN)` |
| `FINAL_INVOICE` | `GENERATED` | new `OrgInvoice (OUTGOING_FINAL)` + deposit accounting + mileage |
| `TERMS_AND_CONDITIONS` | `STATIC_LEGAL` | uploaded `OrganizationLegalDocument` (active version) |
| `WITHDRAWAL_INFORMATION` | `STATIC_LEGAL` | uploaded `OrganizationLegalDocument` (active version) |

A `STATIC_LEGAL` row in `GeneratedDocument` is a *reference snapshot*: it points at
the immutable uploaded object key + version label, so the booking always serves
the legal version that was active when the bundle was built (never re-rendered).

## Module layout

```
backend/src/modules/documents/
  documents.module.ts                # wires services + binds storage/renderer ports
  documents.controller.ts            # booking documents + download/metadata/void
  legal-documents.controller.ts      # Administration legal-document upload/versioning
  documents.constants.ts             # document types, origins, statuses, number prefixes, titles
  document-numbering.service.ts      # per-org/type/year sequential numbers (RE-/SR-/KA-/MV-/UP-/RP-)
  generated-documents.service.ts     # store PDF + metadata, org-scoped get/list/void/download
  legal-documents.service.ts         # upload/list/activate/archive/getActiveByType (single-active)
  booking-document-bundle.service.ts # orchestration + idempotency + bundle status
  document-renderer.service.ts       # DocumentRenderer impl (pdfkit, no headless browser)
  renderers/render-model.ts          # renderer-agnostic RenderableDocument model + DI token
  templates/                         # booking-invoice / deposit-receipt / rental-contract /
                                     #   pickup-handover / return-handover / final-invoice
  storage/
    document-storage.interface.ts    # DocumentStoragePort + DOCUMENTS_STORAGE token
    local-document-storage.service.ts# local-disk impl (S3-ready behind the port)
```

## Data model (Prisma)

New models: `GeneratedDocument`, `OrganizationLegalDocument`,
`BookingDocumentBundle`, `BookingDeposit`, `RentalContract`. The
`OrgInvoiceType` enum gained `OUTGOING_FINAL`. Relations to
booking/customer/vehicle/invoice/handover are kept as indexed scalar IDs (to
minimise migration friction); `organizationId` has an explicit relation with
`onDelete: Cascade` for strong tenant isolation. Migration:
`20260613200000_booking_document_lifecycle` (idempotent `CREATE TABLE IF NOT
EXISTS` + `ALTER TYPE ... ADD VALUE IF NOT EXISTS`).

Each `GeneratedDocument` stores a `snapshot` JSON of the data used to render the
PDF, plus `checksum` (sha256), `objectKey`, `templateKey`/`templateVersion`. The
download endpoint serves the **stored file** — old documents are never
re-rendered from current mutable data.

## Storage

Private, per-tenant, never served as a static/public directory.

```
DOCUMENT_STORAGE_PROVIDER=local
LOCAL_DOCUMENT_STORAGE_DIR=./storage/documents
DOCUMENT_PDF_RENDERER=html
DOCUMENT_GENERATION_ENABLED=true
DOCUMENT_LEGAL_UPLOAD_MAX_MB=25
```

Object keys are fully generated by the storage service (the untrusted original
filename only contributes a sanitised suffix, never a directory):

```
booking-scoped: organizations/{orgId}/bookings/{bookingId}/{documentType}/{yyyy}/{mm}/{uuid}-{safeName}
org-scoped:     organizations/{orgId}/legal/{documentType}/{yyyy}/{mm}/{uuid}-{safeName}
```

Path-traversal is rejected (`..`, NUL bytes, absolute / drive-letter keys; every
resolved path is asserted to stay inside the base dir). `storage/`, `uploads/`
and `.local-storage/` are git-ignored.

### Future S3 adapter (TODO)

Add `S3DocumentStorageService implements DocumentStoragePort` that PUTs/GETs by the
same object key and returns `null` from `getInternalPath`, then bind the
`DOCUMENTS_STORAGE` token by `documents.storageProvider`. No template, service or
controller changes are needed.

## PDF renderer

`DocumentRendererService` implements the `DocumentRenderer` port using
**pdfkit** — a pure-JS PDF library with **no headless browser / Chromium**
dependency. This was chosen over Puppeteer/Playwright to keep the
server-deployed SaaS lightweight (no browser binaries to install/patch). Templates
build a renderer-agnostic `RenderableDocument` (header, parties, meta, key/value
blocks, tables, totals, paragraphs, legal references, signatures, footer), so the
renderer can later be swapped for an HTML→PDF engine without touching templates.
The `DOCUMENT_PDF_RENDERER` env is reserved for that future selection.

## Administration → Legal Documents (AGB / Widerruf upload & versioning)

`Administration → Rechtliche Dokumente` (ORG_ADMIN / MASTER_ADMIN). Upload a PDF
with a version label, then **activate** it. Activating a version archives any
other `ACTIVE` version of the same `(type, language)` — enforced in a transaction
in `LegalDocumentsService.activate`, so there is always at most **one active**
AGB and one active Widerruf per language. Older versions can be downloaded and
are kept as history. The tab warns when either required legal document has no
active version.

Endpoints (org-scoped, authenticated):

```
GET    /organizations/:orgId/legal-documents
POST   /organizations/:orgId/legal-documents/upload          (multipart, PDF only)
POST   /organizations/:orgId/legal-documents/:id/activate
POST   /organizations/:orgId/legal-documents/:id/archive
GET    /organizations/:orgId/legal-documents/:id/download
```

## Booking bundle generation

`BookingDocumentBundleService.generateInitialBundle(orgId, bookingId)` runs at the
**CONFIRMED** stage (fire-and-forget from the bookings flow). It ensures the
booking invoice, deposit receipt and rental contract exist, then attaches the
active AGB + Widerruf. Bundle status:

- **COMPLETE** — all documents required for the current stage exist.
- **PARTIAL** — some exist (e.g. AGB/Widerruf missing in Administration).
- **PENDING** — nothing generated yet.
- **FAILED** — generation errored and produced nothing (error stored in `lastError`).

Required per stage: confirmed → invoice + deposit + contract + AGB + Widerruf;
after pickup → + pickup protocol; after return/completed → + return protocol +
final invoice.

Endpoints:

```
GET    /organizations/:orgId/bookings/:bookingId/documents
POST   /organizations/:orgId/bookings/:bookingId/documents/generate-initial-bundle
POST   /organizations/:orgId/bookings/:bookingId/documents/regenerate/:documentType
GET    /organizations/:orgId/documents/:documentId/metadata
POST   /organizations/:orgId/documents/:documentId/void
GET    /organizations/:orgId/documents/:documentId/download
```

## Pickup / return document generation

After the **existing** handover transaction succeeds, `BookingsHandoverService`
fires (and forgets):

- pickup → `generatePickupProtocolDocument(orgId, bookingId, protocolId)`
- return → `generateReturnProtocolDocument(...)` **and**
  `generateFinalInvoiceAndDocument(...)`

No existing handover or booking-completion behaviour is changed — the triggers run
after the success path and never block it.

## Final invoice & deposit handling

- **Final invoice** (`OUTGOING_FINAL`) references the original booking invoice and
  includes rental period, pickup/return odometer, included vs. driven km, extra km,
  deposit received, retained amount, refund amount and balance. Cost fields that
  are **not yet modelled** (fuel/charging, cleaning, damage, late-return,
  manual lines) default to zero with TODOs — **no invented charges**.
- **Deposit** is a separate `BookingDeposit` (security deposit, not rental
  revenue). Booking has no deposit field today, so it defaults to `0 / REQUESTED`
  with a TODO to wire the amount from the booking/tariff once modelled.

## Idempotency

- `generateInitialBundle` reuses existing non-void documents; it never duplicates.
- The booking invoice is **reused** if the bookings flow already created one.
- One `BookingDeposit` and one `RentalContract` per booking (`bookingId` unique).
- Regenerating a type creates a **new** `GeneratedDocument`, voids the previous one
  and repoints the bundle — legally relevant documents are never silently
  overwritten.
- Final invoice generation reuses the existing final invoice unless `force`.

## Frontend

- **Administration → Rechtliche Dokumente** (`LegalDocumentsTab`): upload, version,
  activate, archive, download AGB + Widerruf; missing-version warnings.
- **Booking detail → Dokumente** (`BookingDocumentsSection`): live bundle with
  grouped lifecycle rows (Bei Buchung / Bei Abholung / Bei Rückgabe), bundle status
  badge, per-row download + regenerate, and the missing-legal warning. Downloads go
  through authenticated blob fetches (`api.documents.open`) — no public URLs.

## Tests

`backend/src/modules/documents/documents.service.spec.ts` (24 tests, renderer +
storage mocked, no external services): storage path safety + roundtrip,
per-org/year numbering + collision guard, legal upload validation + single-active
activation, generated-document org scoping + checksum/storage, bundle tenant
isolation, missing-legal → PARTIAL + warning, COMPLETE/FAILED status, generation
disabled, and void/reuse idempotency.

## Remaining TODOs

- Wire the real deposit amount from booking/tariff once modelled.
- Add post-return charge sources (fuel/charging, cleaning, damage, late fee,
  manual lines) to the final invoice when those models exist.
- Make rental-contract clauses configurable per organization (currently neutral
  placeholder sections only).
- Add the S3 `DocumentStoragePort` implementation for production object storage.
