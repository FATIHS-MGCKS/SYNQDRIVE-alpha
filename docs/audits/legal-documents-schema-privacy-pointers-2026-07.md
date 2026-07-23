# Legal Documents — Schema Privacy Pointers (Prompt 2/32)

**Datum:** 2026-07-22  
**Migration:** `20260722100000_legal_document_privacy_pointers`  
**Baseline:** [`legal-documents-remediation-baseline-2026-07.md`](./legal-documents-remediation-baseline-2026-07.md)

---

## Ziel

Alle drei unterstützten Rechtstexttypen (`TERMS_AND_CONDITIONS`, `WITHDRAWAL_INFORMATION`, `PRIVACY_POLICY`) sollen in **Buchungs-** und **Vertragsartefakten** konsistent per Pointer auf `GeneratedDocument` (STATIC_LEGAL-Snapshots) referenzierbar sein.

---

## Geänderte Modelle

### `BookingDocumentBundle` (`booking_document_bundles`)

| Feld | Typ | Neu? | Relation |
|------|-----|------|----------|
| `termsDocumentId` | `String?` | Nein | `termsDocument` → `GeneratedDocument` (`BookingBundleTermsDocument`) |
| `withdrawalDocumentId` | `String?` | Nein | `withdrawalDocument` → `GeneratedDocument` (`BookingBundleWithdrawalDocument`) |
| `privacyDocumentId` | `String?` | **Ja** | `privacyDocument` → `GeneratedDocument` (`BookingBundlePrivacyDocument`) |

Neue Indizes: `termsDocumentId`, `withdrawalDocumentId`, `privacyDocumentId`.

### `RentalContract` (`rental_contracts`)

| Feld | Typ | Neu? | Relation |
|------|-----|------|----------|
| `termsDocumentId` | `String?` | Nein | `termsDocument` → `GeneratedDocument` (`RentalContractTermsDocument`) |
| `withdrawalDocumentId` | `String?` | Nein | `withdrawalDocument` → `GeneratedDocument` (`RentalContractWithdrawalDocument`) |
| `privacyDocumentId` | `String?` | **Ja** | `privacyDocument` → `GeneratedDocument` (`RentalContractPrivacyDocument`) |

Neue Indizes: `termsDocumentId`, `withdrawalDocumentId`, `privacyDocumentId`.

### `GeneratedDocument` (`generated_documents`)

Neue Rückrelationen (Arrays, da Pointer nicht `@unique`):

- `bookingBundlesAsTermsDocument`
- `bookingBundlesAsWithdrawalDocument`
- `bookingBundlesAsPrivacyDocument`
- `rentalContractsAsTermsDocument`
- `rentalContractsAsWithdrawalDocument`
- `rentalContractsAsPrivacyDocument`

### `OrganizationLegalDocument`

Nur Kommentar ergänzt: `PRIVACY_POLICY` als gültiger `documentType`.

---

## Fachliche Prüfung AGB / Widerruf

| Aspekt | Bewertung |
|--------|-----------|
| Feldnamen `termsDocumentId` / `withdrawalDocumentId` | Korrekt — entsprechen `TERMS_AND_CONDITIONS` / `WITHDRAWAL_INFORMATION` |
| Kanonischer Code-Typ Widerruf | `WITHDRAWAL_INFORMATION` (Legacy-Alias `REVOCATION_POLICY` nur in API-Warnings) |
| Org-Quelle | `OrganizationLegalDocument` — getrennt von Bundle-Pointern |
| Bundle-Pointer | Verweisen auf `GeneratedDocument` (STATIC_LEGAL), nicht direkt auf Org-Upload |
| Vorher | Scalar IDs ohne Prisma-Relation / DB-FK |
| Jetzt | Explizite Relation + FK `ON DELETE SET NULL` |

**Unverändert in diesem Prompt:** `BookingDocumentBundleService.setBundlePointer` / `BUNDLE_FIELD` — Service-Logik folgt in späteren Prompts.

---

## Migrationsstrategie

1. **Additive Spalten** — `privacy_document_id` nullable auf Bundle + RentalContract.
2. **Indizes** — Lookup auf allen drei Legal-Pointer-Spalten (Bundle + Contract).
3. **Foreign Keys** — `generated_documents(id)` mit `ON DELETE SET NULL ON UPDATE CASCADE`.
4. **Bestehende terms/withdrawal Daten** — FKs als `NOT VALID` angelegt, damit historische Orphan-IDs den Deploy nicht blockieren. Validierung optional nach Backfill/Repair.
5. **Neue privacy Spalte** — initial immer `NULL`; FK ohne `NOT VALID` (sicher).
6. **Kein Backfill** — keine Annahme über bestehende `generated_documents` Privacy-Rows.

---

## Verbleibende Backfill-Aufgaben (Prompt 3+)

1. **Bundle privacy pointer** — `generated_documents` mit `document_type = PRIVACY_POLICY` und `booking_id` → `booking_document_bundles.privacy_document_id` (neueste non-VOID Row).
2. **Rental contract privacy pointer** — analog aus Contract-Generierungszeitpunkt oder Bundle-Sync.
3. **FK VALIDATE** — nach Orphan-Bereinigung:
   ```sql
   ALTER TABLE booking_document_bundles VALIDATE CONSTRAINT booking_document_bundles_terms_document_id_fkey;
   -- … weitere NOT VALID constraints
   ```
4. **Service-Layer** — `BUNDLE_FIELD[PRIVACY_POLICY]`, `attachLegalDocuments`, `ensureRentalContract`, Bundle-Status, Tasks, Notifications.
5. **Readiness-Logik** — Frontend/Backend Privacy-Pflicht angleichen.

---

## Ausgeführte Prüfungen

| Prüfung | Befehl | Ergebnis |
|---------|--------|----------|
| Prisma format | `npx prisma format` | OK (schema formatted) |
| Prisma validate | `npm run prisma:validate` | OK (schema valid; SetNull warning auf required `GeneratedDocument.id` — erwartet, Pointer-Felder sind optional) |
| Migration SQL Syntax | Manuelle Review; idempotente `IF NOT EXISTS` / `DO $$`; PostgreSQL `NOT VALID` für Legacy-FKs | OK (kein lokaler Postgres für `migrate deploy`) |
| Prisma Client generate | `npm run prisma:generate` | OK (Prisma Client v5.22.0) |
| Backend Typecheck | `npm run build` (`nest build`) | OK |

---

## Rollback

```sql
ALTER TABLE booking_document_bundles DROP CONSTRAINT IF EXISTS booking_document_bundles_privacy_document_id_fkey;
ALTER TABLE rental_contracts DROP CONSTRAINT IF EXISTS rental_contracts_privacy_document_id_fkey;
-- … weitere FK drops optional
ALTER TABLE booking_document_bundles DROP COLUMN IF EXISTS privacy_document_id;
ALTER TABLE rental_contracts DROP COLUMN IF EXISTS privacy_document_id;
```

Prisma-Schema auf vorherigen Stand zurücksetzen und `prisma generate` erneut ausführen.
