# Legal Documents — Append-only Lifecycle Events (Prompt 5/32)

**Date:** 2026-07-22  
**Scope:** `OrganizationLegalDocumentEvent`, Service-Integration, Read-API, Tests (keine UI)

## Eventtypen

| `eventType` | Auslöser | `previousStatus` → `newStatus` |
|-------------|----------|--------------------------------|
| `UPLOADED` | PDF-Upload | `null` → `DRAFT` |
| `SUBMITTED_FOR_REVIEW` | `submitForReview` | `DRAFT` → `IN_REVIEW` |
| `RETURNED_TO_DRAFT` | Review zurückgewiesen | `IN_REVIEW` → `DRAFT` |
| `APPROVED` | `approve` / Unschedule | `IN_REVIEW`/`SCHEDULED` → `APPROVED` |
| `SCHEDULED` | `schedule` | `APPROVED` → `SCHEDULED` |
| `ACTIVATED` | `activate` | `APPROVED`/`SCHEDULED` → `ACTIVE` |
| `SUPERSEDED` | Ersetzung bei neuer Aktivierung | `ACTIVE` → `SUPERSEDED` |
| `REVOKED` | `revoke` | `ACTIVE` → `REVOKED` |
| `ARCHIVED` | `archive` | beliebig erlaubt → `ARCHIVED` |

## Datenmodell `OrganizationLegalDocumentEvent`

Append-only — **keine** Update-/Delete-API.

Gespeicherte Felder: `id`, `organizationId`, `legalDocumentId`, `eventType`, `previousStatus`, `newStatus`, `actorUserId`, `actorDisplayName`, `reason`, `changeSummary`, `versionLabel`, `checksum`, `language`, `jurisdiction`, `validFrom`, `validUntil`, `correlationId`, `createdAt`.

**Nicht** gespeichert: PDF-Inhalt, `objectKey`, `fileName`, Volltext.

Migration: `20260722130000_legal_document_lifecycle_events`

## Transaktionsverhalten

- Jede Statusänderung in `LegalDocumentsService` ruft `LegalDocumentEventsService.appendInTransaction(tx, …)` **in derselben Prisma-Transaktion** auf.
- Schlägt das Event-Insert fehl, rollt die gesamte Transaktion zurück (Status bleibt unverändert).
- Upload erzeugt Dokument + `UPLOADED`-Event atomar.
- `activate` erzeugt pro ersetztem ACTIVE-Dokument ein zusätzliches `SUPERSEDED`-Event.
- Idempotente Re-Aktivierung (bereits ACTIVE, kein Peer) erzeugt **kein** weiteres Event.

## Sicherheitsmaßnahmen

| Maßnahme | Umsetzung |
|----------|-----------|
| Mandantenisolation | `OrgScopingGuard` + `organizationId` in allen Queries |
| Dokument-Zuordnung | `listForDocument` prüft `legalDocumentId` ∈ `orgId` |
| Keine Inhalte in Events | Nur Metadaten (`checksum`, `versionLabel`, Status) |
| Append-only | Nur `create` via Service-intern; keine Controller-Mutations |
| Actor-Snapshot | `actorDisplayName` zum Zeitpunkt des Events (nicht live User-Lookup) |
| Korrelation | `correlationId` aus `req.requestId` (Request-Logging-Interceptor) |

Der generische `AuditInterceptor` bleibt unverändert ergänzend bestehen.

## API-Endpunkte

| Methode | Pfad | Rolle | Beschreibung |
|---------|------|-------|--------------|
| `GET` | `/organizations/:orgId/legal-documents/events` | Org-Mitglied | Org-weites Event-Log (paginiert, optional `legalDocumentId`, `eventType`) |
| `GET` | `/organizations/:orgId/legal-documents/:id/events` | Org-Mitglied | Events eines Dokuments (chronologisch `createdAt asc`) |
| `POST` | `…/:id/submit-for-review` | ORG_ADMIN | Review anfordern |
| `POST` | `…/:id/approve` | ORG_ADMIN | Freigabe |
| `POST` | `…/:id/schedule` | ORG_ADMIN | Geplante Aktivierung (`validFrom`) |
| `POST` | `…/:id/activate` | ORG_ADMIN | Aktivierung |
| `POST` | `…/:id/revoke` | ORG_ADMIN | Widerruf (`statusReason` Pflicht) |
| `POST` | `…/:id/archive` | ORG_ADMIN | Archivierung |

Pagination: `page` (default 1), `limit` (default 20, max 100).

## Geänderte / neue Dateien

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260722130000_legal_document_lifecycle_events/migration.sql`
- `backend/src/modules/documents/legal-document-events.constants.ts`
- `backend/src/modules/documents/legal-document-events.service.ts`
- `backend/src/modules/documents/legal-documents.service.ts`
- `backend/src/modules/documents/legal-documents.controller.ts`
- `backend/src/modules/documents/documents.module.ts`
- Tests: `legal-document-events.*.spec.ts`, `legal-documents-lifecycle-events.integration.spec.ts`
- Harness-Rollback für atomare Transaktionstests

## Testergebnisse

```
npm test -- --testPathPattern="legal-document|documents.service.spec"
Test Suites: 7 passed, 7 total
Tests:       68 passed, 68 total
```

Abgedeckt: Upload, Review, Freigabe, Schedule, Aktivierung, Ersetzung (SUPERSEDED), Widerruf, Archivierung, Transaktions-Rollback bei Audit-Fehler, Tenant-Scoping der Event-Liste.

## Follow-ups (spätere Prompts)

- UI-Timeline für Event-Anzeige
- Optional: org-weites Event-Export / Filter nach Zeitraum
