# Legal Documents — Lifecycle Dialogs (Prompt 25/32)

**Date:** 2026-07-22

## Dialog matrix

| Dialog | Trigger status | Permission | API |
|--------|----------------|------------|-----|
| Review anfordern | `DRAFT` | `legal-documents` write | `POST …/submit-for-review` |
| Änderungen anfordern | `IN_REVIEW` | `legal-documents` manage | `POST …/request-changes` |
| Freigeben | `IN_REVIEW` | `legal-documents` manage | `POST …/approve` |
| Aktivierung planen | `APPROVED` | `legal-documents` write | `POST …/schedule` |
| Sofort aktivieren | `APPROVED` / `SCHEDULED` (no active peer) | `legal-documents` manage | `POST …/activate` |
| Aktive Version ersetzen | `APPROVED` / `SCHEDULED` (active peer exists) | `legal-documents` manage | `POST …/activate` (supersedes) |
| Widerrufen | `ACTIVE` | `legal-documents` manage | `POST …/revoke` |
| Archivieren | `DRAFT`, `IN_REVIEW`, `APPROVED`, `SCHEDULED`, `SUPERSEDED`, `REVOKED` | `legal-documents` write | `POST …/archive` |

**Not available:** `ACTIVE → ARCHIVED` (must revoke or supersede first).

## Permissions

| Capability | Module / level |
|------------|----------------|
| Review einreichen, planen, archivieren | `legal-documents` write |
| Freigeben, aktivieren, ersetzen, widerrufen, Änderungen anfordern | `legal-documents` manage |

## Vier-Augen-Prinzip

- Org-Flag: `GET …/legal-documents/settings` → `{ fourEyesEnabled }`
- UI blockiert Freigabe/Aktivierung wenn aktueller User = Uploader (und bei Freigabe auch = Review-Einreicher)
- Server erzwingt via `LegalDocumentFourEyesService` → `403 LEGAL_DOCUMENT_FOUR_EYES_VIOLATION`

## Status transitions

```
DRAFT → IN_REVIEW (submit) → APPROVED (approve) → ACTIVE (activate)
                              ↘ SCHEDULED (schedule) → ACTIVE
IN_REVIEW → DRAFT (request changes)
ACTIVE → SUPERSEDED (system, on replacement) / REVOKED (revoke)
* → ARCHIVED (archive, except ACTIVE)
```

## Impact panel (each dialog)

Shows: neue Version, bisher aktive Version, Gültigkeit, Sprache, Jurisdiktion, Kanal, Kundensegment, Auswirkung auf bestehende/neue Buchungen.

Special copy:
- **Widerruf** vs **Ersetzung** klar getrennt
- **Archivierung** = keine Löschung, Snapshots bleiben

## Conflict handling

| HTTP | Code | UI behavior |
|------|------|-------------|
| 409 | `LEGAL_DOCUMENT_ACTIVE_CONFLICT` | Reload + erklärender Fehler |
| 409 | `LEGAL_DOCUMENT_SCOPE_CONFLICT` | Reload + Scope-Hinweis |
| 403 | `LEGAL_DOCUMENT_FOUR_EYES_VIOLATION` | Fehlermeldung, Aktion gesperrt |
| 422 | `LEGAL_DOCUMENT_INVALID_STATUS_TRANSITION` | Reload + Status-Hinweis |

No optimistic status updates — success only after server response + refresh.

## Audit visibility

After success, dialog shows latest audit event; tab toast includes event type; audit section refreshes on `refresh()`.

## Components

| File | Role |
|------|------|
| `lifecycle/LegalDocumentLifecycleActionDialog.tsx` | All lifecycle dialogs |
| `lifecycle/LegalDocumentLifecycleImpactPanel.tsx` | Shared impact summary |
| `legal-document-lifecycle.utils.ts` | Action matrix, validation, four-eyes |
| `LegalDocumentVersionHistorySection.tsx` | „Aktionen“ menu per row |

## Tests

```
legal-document-lifecycle.utils.test.ts — 5 passed
legal-document-lifecycle.components.test.tsx — 4 passed
npx tsc -b — exit 0
```

## Backend additions (Prompt 25)

- `POST …/request-changes` (`approve` permission)
- `GET …/legal-documents/settings`
- `POST …/activate` requires `statusReason` (min 10 chars)
- API mapper: `submittedForReviewBy`
