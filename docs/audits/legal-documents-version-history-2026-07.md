# Legal Documents — Version History & Detail View (Prompt 26/32)

**Date:** 2026-07-22

## Scope

Responsive **Versionshistorie je Rechtstexttyp** (Desktop-Tabelle, Mobile-Karten), serverseitige Filter/Pagination/Sortierung, Detail-Drawer mit Metadaten, Lifecycle-Timeline, Audit-Events, sicherer PDF-Vorschau und Verwendungsübersicht.

## Data flow

```
LegalDocumentsTab
  ├─ useLegalDocumentsOverview (readiness strip, category cards — flat list)
  └─ LegalDocumentVersionHistoriesPanel
        └─ LegalDocumentTypeVersionHistory × documentType
              └─ useLegalDocumentVersionHistory
                    └─ GET /organizations/:orgId/legal-documents?documentType&page&limit&filters&sort

LegalDocumentVersionDetailDrawer (on row click)
  ├─ GET …/legal-documents/:id           (full metadata)
  ├─ GET …/legal-documents/:id/events    (audit, if legal-documents-audit read)
  ├─ GET …/legal-documents/:id/usage     (if legal-documents read)
  └─ GET …/legal-documents/:id/download  (blob → object URL → iframe, no public URL)
```

## API usage

| Endpoint | Purpose |
|----------|---------|
| `GET …/legal-documents` | Paginated list per `documentType` with `language`, `status`, `jurisdiction`, `from`, `to`, `sort`, `order` |
| `GET …/legal-documents/:id` | Detail metadata for drawer |
| `GET …/legal-documents/:id/events` | Per-document audit trail |
| `GET …/legal-documents/:id/usage` | Snapshot/booking/contract/delivery counts + paginated references |
| `GET …/legal-documents/:id/download` | Authorized PDF stream for preview/download |

## Performance decisions

- **Server pagination** (`limit=15`) — large histories do not load client-side.
- **Per-type queries** — three parallel lightweight lists instead of one unfiltered mega-list.
- **Usage endpoint** — `Promise.all` for counts + single batched `rentalContract.findMany` for contract numbers (no N+1).
- **PDF preview** — authenticated blob fetch + `URL.createObjectURL`; revoked on drawer close.
- **Overview hook unchanged** — readiness strip still uses flat `list()`; version history is independently paginated.

## Permissions

| UI area | Permission |
|---------|------------|
| Version history list | `legal-documents` read |
| Lifecycle actions | `legal-documents` write / manage (unchanged from Prompt 25) |
| Audit events in drawer | `legal-documents-audit` read |
| Usage section in drawer | `legal-documents` read (server: `legal_documents.view`) |
| PDF preview / download | `legal-documents` read (auth cookie / bearer) |

No tenant-cross references: all queries scoped by `organizationId`.

## UI notes

- Technical IDs not shown as primary labels; bookings truncated (`Buchung abc12345`).
- Checksum shortened + copy button (non-dominant).
- Empty states: per-type “no versions” vs “no filter matches”.
- Mobile: `md:hidden` cards; desktop: `hidden md:block` table.

## Components

| File | Role |
|------|------|
| `LegalDocumentVersionHistoriesPanel.tsx` | One section per `LEGAL_DOCUMENT_TYPE_CONFIGS` |
| `LegalDocumentTypeVersionHistory.tsx` | Filters, table, mobile cards, pagination |
| `LegalDocumentVersionDetailDrawer.tsx` | Metadata, timeline, audit, usage, PDF iframe |
| `useLegalDocumentVersionHistory.ts` | Paginated hook |
| `legal-document-version-history.*` | Types, mappers, query builder |
| `legal-document-usage.service.ts` | Backend usage aggregation |

## Tests

### Frontend

```
legal-document-version-history.utils.test.ts
legal-document-version-history.components.test.tsx
```

Covers: filter query building, pagination markup, sort headers, mobile/desktop layout, empty states, checksum shortening.

### Backend

```
legal-document-usage.service.spec.ts
legal-documents.controller.spec.ts (usage delegation)
```

Covers: tenant not-found, batched contract lookup, usage endpoint wiring.

### Run

```bash
cd frontend && npm test -- legal-document-version-history
cd backend && npm test -- legal-document-usage.service.spec legal-documents.controller.spec
```

## Test results (2026-07-22)

```
frontend: legal-document-version-history.utils.test.ts — 4 passed
frontend: legal-document-version-history.components.test.tsx — 5 passed
backend: legal-document-usage.service.spec.ts — 2 passed
```
