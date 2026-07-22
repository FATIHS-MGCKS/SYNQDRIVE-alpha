# Legal Documents — Professional Lifecycle (Prompt 4/32)

**Date:** 2026-07-22  
**Scope:** Datenmodell, Migration, zentraler Transition-Validator, Service-Refactor (keine umfassende UI)

## Zielstatusmodell

| Status | Bedeutung |
|--------|-----------|
| `DRAFT` | Hochgeladen, noch nicht eingereicht |
| `IN_REVIEW` | Zur fachlichen Prüfung eingereicht |
| `APPROVED` | Freigegeben, bereit zur Aktivierung |
| `SCHEDULED` | Freigegeben mit geplantem `validFrom` |
| `ACTIVE` | Verbindlich gültig (max. 1 pro org+type+language) |
| `SUPERSEDED` | Durch neuere ACTIVE-Version ersetzt |
| `REVOKED` | Rechtlich widerrufen / zurückgezogen |
| `ARCHIVED` | Endgültig archiviert (kein Resolver-Ergebnis) |

## Statusmatrix (erlaubte Übergänge)

| Von \\ Nach | IN_REVIEW | APPROVED | SCHEDULED | ACTIVE | SUPERSEDED | REVOKED | ARCHIVED |
|-------------|-----------|----------|-----------|--------|------------|---------|----------|
| DRAFT | ✓ | | | **✗** | | | ✓ |
| IN_REVIEW | | ✓ | | **✗** | | | ✓ |
| IN_REVIEW | ✓ (→ DRAFT) | | | | | | |
| APPROVED | | | ✓ | ✓ | | | ✓ |
| SCHEDULED | | ✓ (unschedule) | | ✓ | | | ✓ |
| ACTIVE | | | | | ✓ (system) | ✓ | **✗** |
| SUPERSEDED | | | | | | | ✓ |
| REVOKED | | | | | | | ✓ |
| ARCHIVED | — terminal — |

**Harte Regeln:**
- `DRAFT → ACTIVE` ist verboten (weder direkt noch implizit).
- `ACTIVE → ARCHIVED` ist verboten — Ersetzung über `SUPERSEDED`, Rückzug über `REVOKED`.
- `REVOKED` und `SUPERSEDED` bleiben fachlich getrennt.
- Statuswechsel nur über `LegalDocumentsService` (`transitionStatus` / dedizierte Methoden).

## Neue Modellfelder

- `validFrom`, `validUntil`
- `submittedForReviewAt`, `submittedForReviewByUserId`
- `approvedAt`, `approvedByUserId`
- `activatedAt` (Rename von `active_from`), `activatedByUserId`
- `revokedAt`, `revokedByUserId`
- `statusReason`, `changeSummary`, `legalOwnerName`
- `updatedAt` (bereits vorhanden)

## Migration `20260722120000_legal_document_lifecycle`

1. `active_from` → `activated_at` (Rename, keine Datenverluste)
2. Neue Lifecycle-Spalten (nullable, additive)
3. Legacy `ARCHIVED` mit `activated_at` → `SUPERSEDED` (waren aktive Versionen vor Ersetzung)
4. `valid_from` Backfill für `ACTIVE` und `SUPERSEDED` aus `activated_at`
5. Index `organization_legal_documents_org_type_lang_status_idx`

### Kompatibilität bestehender Daten

| Vorher | Nachher |
|--------|---------|
| `ACTIVE` | `ACTIVE` (+ `valid_from` = `activated_at`) |
| `DRAFT` | `DRAFT` |
| `ARCHIVED` ohne Aktivierung | `ARCHIVED` |
| `ARCHIVED` mit `activated_at` | `SUPERSEDED` |

Historische `BookingDocumentBundle`-Snapshots referenzieren `GeneratedDocument`-IDs — **ARCHIVED/SUPERSEDED am Org-Legal-Dokument ändert gebundene Snapshots nicht**.

Der partielle Unique-Index `organization_legal_documents_single_active_key` (Prompt 3) bleibt unverändert auf `status = 'ACTIVE'`.

## Service-API (Backend)

| Methode | Übergang |
|---------|----------|
| `submitForReview` | → `IN_REVIEW` |
| `approve` | → `APPROVED` |
| `schedule` | → `SCHEDULED` (+ `validFrom`) |
| `activate` | `APPROVED`/`SCHEDULED` → `ACTIVE`; ersetzt andere ACTIVE → `SUPERSEDED` |
| `revoke` | `ACTIVE` → `REVOKED` (mit `statusReason`) |
| `archive` | erlaubte Terminal-Übergänge → `ARCHIVED` |

`getActiveByType` filtert zusätzlich:
- `validFrom <= now` (oder null)
- `validUntil > now` (oder null)

HTTP-Fehlercode neu: `LEGAL_DOCUMENT_INVALID_STATUS_TRANSITION`.

## Geänderte Dateien

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260722120000_legal_document_lifecycle/migration.sql`
- `backend/src/modules/documents/documents.constants.ts`
- `backend/src/modules/documents/legal-document-lifecycle.transitions.ts`
- `backend/src/modules/documents/legal-document-lifecycle.transitions.spec.ts`
- `backend/src/modules/documents/legal-documents.errors.ts`
- `backend/src/modules/documents/legal-documents.service.ts`
- `backend/src/modules/documents/legal-documents-activation.integration.harness.ts`
- `backend/src/modules/documents/legal-documents-activation.integration.spec.ts`
- `backend/src/modules/documents/documents.service.spec.ts`

## Testergebnisse

```
npm test -- --testPathPattern="legal-document-lifecycle|legal-documents-activation|documents.service.spec"
Test Suites: 3 passed, 3 total
Tests:       55 passed, 55 total
```

## Bekannte Follow-ups (spätere Prompts)

- UI-Workflow für Review/Approve/Schedule
- Controller-Endpunkte für neue Service-Methoden
- Automatische Aktivierung geplanter `SCHEDULED`-Versionen (Worker/Cron)
- Frontend `LegalDocumentDto` Status-Union erweitern
