# Legal Documents — i18n & UX Copy (Prompt 28)

**Date:** 2026-07-22  
**Scope:** Administration → Customer legal texts (`legal-documents` tab)

## Summary

All user-visible strings for the legal documents administration surface are integrated into the rental i18n system (`de` + `en`). Hardcoded German UI copy was removed from components and lib helpers.

## New i18n key groups

| Prefix | Purpose |
|--------|---------|
| `legalDocuments.disclaimer` | Admin disclaimer (not legal advice) |
| `legalDocuments.page.*` | Page header, actions, errors |
| `legalDocuments.status.*` | Lifecycle statuses (8 canonical labels) |
| `legalDocuments.readiness.*` | Overview strip, category readiness, issues, next actions |
| `legalDocuments.categories.*` | Category cards |
| `legalDocuments.alerts.*` | Configuration alerts |
| `legalDocuments.type.*` | Document type titles & hints |
| `legalDocuments.variant.*` | Consumer information variants |
| `legalDocuments.wizard.*` | Upload wizard steps, fields, validation copy |
| `legalDocuments.validation.*` | Shared form validation messages |
| `legalDocuments.option.*` | Select options (language, jurisdiction, segment, channel, scope) |
| `legalDocuments.lifecycle.*` | Action dialogs, impact panel, events, conflicts |
| `legalDocuments.history.*` | Version history table, filters, pagination |
| `legalDocuments.detail.*` | Version detail drawer |
| `legalDocuments.audit.*` | Audit timeline section |
| `legalDocuments.scan.*` / `integrity.*` | Scan & integrity status labels |
| `legalDocuments.tooltip.*` | Checksum, integrity, snapshot, scan |
| `legalDocuments.toast.*` | Toasts |
| `legalDocuments.a11y.*` | Screen reader labels |
| `legalDocuments.error.*` | Generic errors |

**Source files:** `frontend/src/rental/i18n/translations/legal-documents.en.ts`, `legal-documents.de.ts` (spread into `en.ts` / `de.ts`).

**Helper:** `frontend/src/rental/lib/legal-documents-i18n.ts`

## Removed hardcodings

- `LEGAL_DOCUMENT_ADMIN_DISCLAIMER_DE`, `CONSUMER_INFORMATION_VARIANT_LABELS_DE`
- `STATUS_LABEL_DE`, `EVENT_LABEL_DE`, `SCAN_LABELS_DE`, `INTEGRITY_LABELS_DE`
- Inline German in all legal-documents components, wizard steps, lifecycle dialogs
- Hook fallbacks in `useLegalDocumentsOverview` / `useLegalDocumentVersionHistory` (`Laden fehlgeschlagen`, audit load)
- `LEGAL_LIFECYCLE_ACTION_CONFIG` / `LEGAL_LIFECYCLE_CONFLICT_MESSAGES` string values → translation keys
- `LEGAL_PDF_PREVIEW_TITLE` constant → `legalDocuments.a11y.pdfPreview`

## Important UX copy changes

| Topic | DE | EN |
|-------|----|----|
| Privacy policy hint | Nach Aktivierung bereitgestellt (kein Einwilligungs-Framing) | Made available when active |
| Withdrawal variant | „…falls anwendbar“ | „…where applicable“ |
| SCHEDULED status | Geplante Aktivierung | Scheduled activation |
| REVOKED status | Widerrufen (konsistent) | Revoked |
| Wizard review note | Erst nach Freigabe & Aktivierung — nicht beim Entwurf speichern | After approval & activation — not on draft save |
| AGB hint | Nach Aktivierung in Buchungsunterlagen (kein „automatisch angehängt“) | When active, included in booking documents |

## DE / EN completeness

- **268 keys** in `legalDocumentsEn`; mirrored in `legalDocumentsDe`
- Other locales (`fr`, `pl`, …) inherit English via `...en` spread until translated
- Parity enforced by `legal-documents.i18n.test.ts`

## Tests

```bash
cd frontend && npx tsc -b          # pass
cd frontend && npm test -- --run \
  src/rental/lib/legal-documents.i18n.test.ts \
  src/rental/lib/legal-document*.test.ts \
  src/rental/lib/legal-documents*.test.ts \
  src/rental/components/legal-documents
# 13 files, 60 tests — pass
```

## Surfaces covered

- Main tab, readiness strip, category cards, config alerts
- Upload wizard (4 steps)
- Lifecycle action dialogs & impact panel
- Version history (desktop + mobile)
- Detail drawer (metadata, timeline, usage, delivery status, PDF preview)
- Audit section
- Toasts, validation, conflict errors, a11y labels

Bundle/pickup-specific admin UI for legal documents was not present in the frontend; delivery/usage copy lives in the detail drawer usage section.
