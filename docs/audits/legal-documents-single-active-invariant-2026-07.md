# Legal Documents — Single-ACTIVE Invariant (Prompt 3/32)

**Migration:** `20260722110000_legal_document_single_active_invariant`  
**Index:** `organization_legal_documents_single_active_key`

---

## Index definition

```sql
CREATE UNIQUE INDEX "organization_legal_documents_single_active_key"
  ON "organization_legal_documents" ("organization_id", "document_type", "language")
  WHERE "status" = 'ACTIVE';
```

At most **one** row per `(organization_id, document_type, language)` may have `status = 'ACTIVE'`.

---

## Pre-index duplicate check

Before creating the index, the migration inspects all rows with `status = 'ACTIVE'` grouped by `(organization_id, document_type, language)`. Any group with `COUNT(*) > 1` is repaired.

---

## Bereinigungsstrategie (deterministisch)

**Gewinner** (bleibt `ACTIVE`):

```sql
ORDER BY active_from DESC NULLS LAST,
         updated_at DESC,
         created_at DESC,
         id DESC
```

**Verlierer:** `status` → `ARCHIVED` (kein `DELETE`, keine Storage-Löschung).

**Protokoll:** Jede archivierte Dublette erzeugt eine Zeile in `organization_legal_document_repair_log`:

| Spalte | Inhalt |
|--------|--------|
| `migration_id` | `20260722110000_legal_document_single_active_invariant` |
| `kept_document_id` | Gewinner-ID |
| `archived_document_id` | Archivierte Dublette |
| `reason` | `duplicate_active_archived_for_single_active_invariant` |
| `kept_active_from` / `archived_active_from` | Zeitstempel zum Audit |

Re-Run-Sicherheit: INSERT nur wenn `(migration_id, archived_document_id)` noch nicht protokolliert; UPDATE nur Zeilen die noch `ACTIVE` sind.

---

## Aktivierungslogik (Service)

| Verhalten | Implementierung |
|-----------|-------------------|
| Transaktional | `prisma.$transaction` |
| Idempotent (gleiche Version) | Bereits `ACTIVE` und kein anderer ACTIVE → Rückgabe ohne `activeFrom`-Änderung |
| Wechsel | Andere ACTIVE → `ARCHIVED`, dann Ziel → `ACTIVE` |
| Konflikt | Prisma `P2002` auf Index → HTTP **409** `LEGAL_DOCUMENT_ACTIVE_CONFLICT` |
| Archiviert aktivieren | HTTP **400** `LEGAL_DOCUMENT_NOT_ACTIVATABLE` |

Strukturierte 409-Antwort:

```json
{
  "message": "Another legal document version is already active for this organization, document type, and language",
  "code": "LEGAL_DOCUMENT_ACTIVE_CONFLICT",
  "organizationId": "...",
  "documentType": "TERMS_AND_CONDITIONS",
  "language": "de"
}
```

---

## Tests

- `legal-documents-activation.integration.spec.ts` — parallele Aktivierungen (Harness mit DB-Invariante)
- `documents.service.spec.ts` — Unit-Tests für activate/idempotent

---

## Verbleibende Aufgaben

- Prompt 4+: `privacyDocumentId` Service-Wiring, Bundle-Status, Backfill
- Optional: `VALIDATE CONSTRAINT` auf ältere FK-Migrationen nach Datenbereinigung
