# ADR: Kanonisches Zielmodell Rechnung ↔ Generierte Dokumente

**Status:** Accepted (Analyse & Architekturentscheidung — keine Schema-/Datenänderung in diesem Schritt)  
**Datum:** 2026-07-15  
**Scope:** Operative Flottenrechnungen (`OrgInvoice`) und `GeneratedDocument` (PDF-Engine)  
**Ausgeschlossen:** SaaS-Abrechnung (`BillingInvoice` / Stripe) — separates Domänenmodell ohne `GeneratedDocument`-Verknüpfung  
**Bezug:** `INVOICE_DOCUMENT_LINK_LEGACY_AUDIT_2026-07-14.md`, `INVOICE_READONLY_AUDIT_2026-07-15.md`, Test-Baseline `docs/audits/invoice-function-test-safety-net.md`

---

## 1. Ist-Zustand (codebelegt)

### 1.1 Welche Modelle repräsentieren Rechnungen und generierte Dokumente?

| Modell | Tabelle | Rolle |
|--------|---------|-------|
| **`OrgInvoice`** | `org_invoices` | Operative Mandanten-Rechnung (Ausgang/Eingang): Positionen, Status, Zahlungen, Nummernkreis |
| **`GeneratedDocument`** | `generated_documents` | Zentrale PDF-Metadaten + privater Storage-Key; alle gerenderten Belege inkl. `BOOKING_INVOICE` |
| **`BookingDocumentBundle`** | `booking_document_bundles` | Buchungsbezogener Dokumenten-Lifecycle mit typisierten Aktiv-Zeigern pro Dokumentart |
| **`OutboundEmail`** / **`OutboundEmailAttachment`** | `outbound_emails`, … | Versandhistorie; Rechnungs-PDF-Anhang referenziert `generatedDocumentId` |
| **`BillingInvoice`** | `billing_invoices` | SynqDrive-SaaS-Abrechnung (Stripe); `invoicePdfUrl` — **kein** `GeneratedDocument` |

Prisma-Ausschnitt operative Relation:

```prisma
model OrgInvoice {
  generatedDocumentId  String?  @unique  // Aktiv-Zeiger (1:0..1)
  generatedDocument    GeneratedDocument? @relation("InvoiceActiveDocument", …)
  documents            GeneratedDocument[] @relation("InvoiceDocuments", …)
}

model GeneratedDocument {
  invoiceId  String?  // Kanonische FK Dokument → Rechnung
  invoiceRecord OrgInvoice? @relation("InvoiceDocuments", fields: [invoiceId], …)
  activeForInvoice OrgInvoice? @relation("InvoiceActiveDocument")  // Rückrelation Zeiger
}
```

Es gibt **kein** separates `DocumentLink`-Modell. Verknüpfungen sind skalare Spalten + Prisma-Relationen.

---

### 1.2 Welche Relation wird beim Generieren gesetzt?

Zwei Schreibpfade:

**A) Standalone-PDF** (`OUTGOING_MANUAL`, `OUTGOING_FINAL`, Buchungsrechnung ohne Bundle-Pfad)  
`InvoiceDocumentsService.generateStandaloneInvoicePdf` → `GeneratedDocumentsService.createFromPdf`:

- setzt **`GeneratedDocument.invoiceId`** beim `create`
- setzt danach **`OrgInvoice.generatedDocumentId`** via `linkInvoiceToDocument`

**B) Buchungs-Bundle-Pfad** (`OUTGOING_BOOKING` + `bookingId`)  
`InvoiceDocumentsService.runGeneration` delegiert an `BookingDocumentBundleService`; nach Bundle-Render:

- `renderAndStore` setzt **`GeneratedDocument.invoiceId`** (wenn `links.invoiceId` übergeben)
- `ensureBookingInvoice` setzt zusätzlich **`OrgInvoice.generatedDocumentId`** direkt per `prisma.orgInvoice.update`
- `InvoiceDocumentsService` ruft anschließend `linkInvoiceToDocument` (idempotent gleicher Wert)

**Fehlerpfad:** `recordInvoiceGenerationFailure` erzeugt ein `GeneratedDocument` mit `status = FAILED` und **`invoiceId` gesetzt**, ohne erfolgreichen Aktiv-Zeiger.

**Ist-Lücke:** Historisch und in Randfällen kann `invoiceId` auf dem Dokument gesetzt sein, während `generatedDocumentId` auf der Rechnung noch `null` bleibt (Legacy-Gap, Regressionstest `audit-04b`).

---

### 1.3 Welche Relation liest die Rechnungsdetailseite?

| Schicht | Quelle | Felder |
|---------|--------|--------|
| **Primär (Dokumente-Panel)** | `GET …/invoices/:id/documents` → `InvoiceDocumentsService.getPanel` | `activeDocument`, `versions[]`, `panelState`, Capabilities |
| **Hook** | `useInvoiceDocuments` | lädt Panel; kein direkter DB-Zugriff |
| **Sekundär (Gates)** | `buildInvoiceDetailDto` | `invoice.generatedDocumentId` **oder** `documentsPanel.activeDocument` für PDF/E-Mail-Gates |
| **Kern-Rechnung** | `GET …/invoices/:id` → `InvoicesService.findById` | liefert `generatedDocumentId`, aber **keine** aufgelösten Dokumentversionen |

Die Detail-UI behandelt das Panel als **fachliche Wahrheit für Versionen**; `generatedDocumentId` auf dem Invoice-DTO ist ein **Legacy-/Bootstrap-Gate**, solange das Panel noch nicht geladen ist.

---

### 1.4 BookingDocumentBundle-, DocumentLink- oder Pointer-Felder?

**`BookingDocumentBundle`** — typisierte Aktiv-Zeiger pro Buchung (nicht pro Rechnung):

| Dokumenttyp | Bundle-Spalte |
|-------------|---------------|
| `BOOKING_INVOICE` | `bookingInvoiceDocumentId` |
| `FINAL_INVOICE` | `finalInvoiceDocumentId` |
| `DEPOSIT_RECEIPT` | `depositReceiptDocumentId` |
| … | … |

`BUNDLE_FIELD` in `booking-document-bundle.service.ts` mappt `documentType` → Bundle-Spalte.

**`OrgInvoice.generatedDocumentId`** — Aktiv-Zeiger auf Rechnungsebene (global ein Dokument pro Rechnung).

**Kein `DocumentLink`** — nur skalare FKs auf `GeneratedDocument` (`invoiceId`, `bookingId`, `customerId`, …).

**`OutboundEmailAttachment.generatedDocumentId`** — Versionssnapshot zum Versandzeitpunkt.

---

### 1.5 Wie werden mehrere Dokumentversionen behandelt?

- Jede (Re-)Generierung erzeugt eine **neue `GeneratedDocument`-Zeile** mit gleichem `invoiceId` (Standalone) bzw. neuem Bundle-Dokument.
- **Regenerate:** vorheriges aktives Dokument wird per `voidDocument` auf `status = VOID` gesetzt (`voidedAt` gesetzt).
- **Versionsnummer:** nicht persistiert; `InvoiceDocumentsService.mapVersions` berechnet `version` aus absteigendem `createdAt` (1 = älteste sichtbare Version in der Liste).
- **Audit-Trail:** VOID-Zeilen bleiben in der DB; Panel filtert sie für „aktiv“, Timeline/Liste können sie einbeziehen.

---

### 1.6 Wie wird ein aktives Dokument bestimmt?

**Autoritative Laufzeitlogik** (`mapVersions` / `findLatestInvoiceDocument`):

1. Lade Kandidaten via `listForInvoice(orgId, invoiceId, bookingId, generatedDocumentId)`
2. Filtere `status !== VOID`
3. **Aktiv** = erstes Dokument mit sendable Status (`GENERATED` | `SENT`), sonst erstes mit active Status (`GENERATED` | `SENT` | `DRAFT`)
4. `isActive` Flag pro Version; `activeDocument` = Version mit `isActive === true`

**Denormalisierter Cache:** `OrgInvoice.generatedDocumentId` — wird bei erfolgreicher Generierung gesetzt; Listen-Read-Model (`InvoiceListReadService`) und Filter `documentStatus=MISSING` lesen primär diesen Zeiger.

**Bundle-Ebene:** `BookingDocumentBundle.bookingInvoiceDocumentId` zeigt auf das aktive Buchungsrechnungs-PDF **pro Buchung** (parallel zur Rechnungszeiger-Logik).

---

### 1.7 Gibt es Status für erzeugt, fehlgeschlagen, ersetzt oder storniert?

**`GeneratedDocument.status`** (String-Konstanten in `documents.constants.ts`):

| Status | Bedeutung |
|--------|-----------|
| `DRAFT` | Entwurf (selten bei PDF) |
| `GENERATED` | Erfolgreich erzeugt, versandfähig |
| `SENT` | Versendet (E-Mail) |
| `VOID` | Ersetzt / storniert (neue Version hat übernommen) |
| `FAILED` | Generierung fehlgeschlagen; `metadata.errorMessage` persistiert |

**`BookingDocumentBundle.status`:** `PENDING` | `PARTIAL` | `COMPLETE` | `FAILED` (+ `lastError`)

**`OrgInvoice.status`:** separates Rechnungs-Lebenszyklus-Enum (`DRAFT`, `ISSUED`, `PAID`, `VOID`, …) — **nicht** identisch mit Dokumentstatus.

Zusätzlich hält `InvoiceDocumentsService` **In-Memory** `failures` Map während laufender Generierung; nach Persistierung von `FAILED` übernimmt die DB.

---

### 1.8 Welche Fremdschlüssel und Indizes existieren?

**OrgInvoice**

- `generatedDocumentId` → `GeneratedDocument.id` (`onDelete: SetNull`, **`@unique`**)
- Indizes: `organizationId`, `bookingId`, `customerId`, `status`, `type`, Composite-Filter

**GeneratedDocument**

- `invoiceId` → `OrgInvoice.id` (`onDelete: SetNull`)
- `organizationId` → `Organization.id` (`onDelete: Cascade`)
- Indizes: `organizationId`, `invoiceId`, `bookingId`, `documentType`, `status`

**OutboundEmail**

- `invoiceId` → `OrgInvoice.id` (`onDelete: SetNull`)
- Index: `organizationId`, `invoiceId`

**BookingDocumentBundle**

- Keine Prisma-FK auf `GeneratedDocument` (bewusst scalar + Index); Integrität über Services + Audit-Skripte

**Organisationssicherheit:** Jeder Lese-/Schreibpfad filtert `organizationId` (z. B. `getById`, `requireInvoice`, `listForInvoice`).

**Fehlende Constraints (Ist):**

- Kein Unique-Index „höchstens ein aktives Dokument pro `(organizationId, invoiceId, documentType)`“
- Kein DB-Constraint, dass `generatedDocumentId.invoiceId === invoice.id`

---

### 1.9 Welche Pfade erzeugen PDFs, ohne die Rechnung vollständig zu aktualisieren?

| Pfad | Was wird aktualisiert | Was fehlt ggf. |
|------|----------------------|----------------|
| `BookingDocumentBundle.ensureBookingInvoice` | `GeneratedDocument` + `generatedDocumentId` | Kein Issue/Status-Wechsel der Rechnung |
| `InvoiceDocumentsService` Bundle-Zweig | `generatedDocumentId` via `linkInvoiceToDocument` | Wenn `findLatestInvoiceDocument` null → **kein** Zeiger |
| `recordInvoiceGenerationFailure` | neues `FAILED`-Dokument mit `invoiceId` | `generatedDocumentId` bleibt unverändert |
| `BookingsService.create` Bootstrap | optional gar keine Rechnung bei `.catch(() => null)` | Rechnung fehlt komplett |
| Historische Bundle-Generierung vor V4.9.470 | Dokument mit `bookingId`, evtl. ohne `invoiceId` | Dual-Link unvollständig |

---

### 1.10 Legacy-Felder — noch nicht entfernen

| Feld / Pfad | Grund |
|-------------|-------|
| `OrgInvoice.generatedDocumentId` | Listenfilter, Read-Model, schneller Aktiv-Zeiger, FK seit V4.9.470 |
| `GeneratedDocument.bookingId` + `listForInvoice` Booking-OR | Legacy-Dokumente ohne `invoiceId` |
| `listForInvoice(…, legacyDocumentId)` | Pointer-Fallback wenn `invoiceId` fehlt |
| `BookingDocumentBundle.*DocumentId` | Buchungs-Dokument-Lifecycle, getrennte Produktfläche |
| `OrgInvoice.invoiceNumber` / `legacyInvoiceNumber` | Dashboard/Legacy-API |
| `OrgInvoice.imageUrl` | Eingangs-Anhang (kein `GeneratedDocument`) |
| Frontend-Gate `invoice.generatedDocumentId` | Solange Panel asynchron lädt |
| Ops-Skripte `audit-*` / `backfill-*` | Datenbereinigung vor Fallback-Entfernung |

---

## 2. Problem

1. **Zwei Wahrheiten:** `GeneratedDocument.invoiceId` (kanonisch laut Code-Kommentar) vs. `OrgInvoice.generatedDocumentId` (Unique-Aktiv-Zeiger) können auseinanderlaufen.
2. **Drei Ebenen:** Rechnung (`OrgInvoice`), Dokument (`GeneratedDocument`), Buchung (`BookingDocumentBundle`) — jeweils eigene Pointer.
3. **Legacy-Fallbacks** in `listForInvoice` maskieren Inkonsistenzen und erschweren strikte Integrität.
4. **Aktivität** wird zur Laufzeit aus Status + Sortierung abgeleitet, ist aber nicht als DB-Constraint ausgedrückt.
5. **Kein explizites Versionsfeld** — Nachvollziehbarkeit hängt an `createdAt`, `voidedAt`, `generatedByUserId`, `metadata`/`snapshot`.

Ohne kanonisches Zielmodell drohen: falsche E-Mail-Anhänge, leere Detail-Panels trotz vorhandenem PDF, Cross-Tenant-Risiken bei manuellen Datenfixes, vorzeitiges Entfernen von Fallbacks.

---

## 3. Zielmodell

| Regel | Spezifikation |
|-------|---------------|
| **Kanonische Relation** | `GeneratedDocument.invoiceId` ist die fachliche Zuordnung Dokument → Rechnung |
| **Versionierung** | Beliebig viele `GeneratedDocument`-Zeilen pro `invoiceId` und `documentType`; jede Version auditierbar (`createdAt`, `generatedByUserId`, `status`, `voidedAt`, `snapshot`) |
| **Aktive Version** | Höchstens eine nicht-`VOID`-Version pro `(organizationId, invoiceId, documentType)` mit sendable/active Status |
| **Aktiv-Zeiger** | `OrgInvoice.generatedDocumentId` = denormalisierter Cache der aktiven Version; **darf nicht** alleinige Wahrheit sein |
| **Aktiv-Ermittlung** | Primär: Query über `invoiceId` + Status-Regeln; Zeiger muss konsistent sein oder reparierbar |
| **Fehler** | `FAILED`-Zeilen persistent; Panel zeigt `FAILED` ohne aktives PDF |
| **Mandantentrennung** | Alle Queries `organizationId`-scoped; `invoiceId` und `generatedDocumentId` müssen zur gleichen Org gehören |
| **Buchungs-Bundle** | Parallel-Pointer auf Bundle-Ebene bleiben; müssen mit `invoiceId`-verknüpften Dokumenten konsistent sein |
| **Versand** | `OutboundEmail.invoiceId` + Attachment-`generatedDocumentId` referenzieren eine konkrete Version |

---

## 4. Gewählte Variante

### **Variante A (+ algorithmische Aktivität aus C)**

**Entscheidung:**

1. **`OrgInvoice.generatedDocumentId` bleibt vorerst** und wird konzeptionell als **`activeGeneratedDocumentId`** (denormalisierter Cache) behandelt — **kein Schema-Rename in Phase 1**.
2. **`GeneratedDocument.invoiceId` ist die kanonische Relation** für alle neuen Writes und für authoritative Reads (Panel, Timeline, Audit).
3. **Aktive Version wird algorithmisch ermittelt** (Variante C): Status-Präzedenz + `createdAt` innerhalb `(invoiceId, documentType)`; der Zeiger muss dem Ergebnis entsprechen.
4. **Kein neues DB-Feld** (Variante B abgelehnt für Phase 1): Das bestehende Dual-Link-Modell reicht nach Backfill + Constraint-Disziplin.

**Write-Contract (Soll ab Phase 2):**

```
createFromPdf / renderAndStore:
  → GeneratedDocument.invoiceId = orgInvoice.id  (immer)

nach erfolgreicher Generierung:
  → activeId = pickActive(invoiceId, documentType)
  → OrgInvoice.generatedDocumentId = activeId    (Cache)

bei Regenerate:
  → alte Version status = VOID
  → neue Version invoiceId gesetzt
  → Cache aktualisieren
```

**Read-Contract:**

```
Panel / Timeline / E-Mail:
  1. docs = WHERE organizationId AND invoiceId = :id ORDER BY createdAt DESC
  2. active = pickActive(docs, documentType)
  3. assert(active.id === invoice.generatedDocumentId OR repair/log)
  4. legacy OR nur wenn audit flaggt fehlende invoiceId
```

---

## 5. Verworfene Varianten

| Variante | Beschreibung | Ablehnungsgrund |
|----------|--------------|-----------------|
| **B — Neues Feld `activeGeneratedDocumentId`** | Explizite Umbenennung + zweites Feld | Kein zusätzlicher Nutzen gegenüber dokumentiertem Semantik-Shift von `generatedDocumentId`; Prisma-Migration + Dual-Read ohne fachlichen Gewinn in Phase 1 |
| **C allein — Nur Status/Version, kein Zeiger** | Aktiv ausschließlich zur Laufzeit | Listen-Read-Model, `documentStatus`-Filter und bestehende APIs hängen am Zeiger; Performance + Breaking Change |
| **Nur Bundle-Pointer** | Wahrheit in `BookingDocumentBundle` | gilt nicht für `OUTGOING_MANUAL` ohne Buchung; vermischt Buchungs- mit Rechnungsdomäne |
| **DocumentLink-Tabelle** | Generische M:N-Link-Entität | Over-Engineering; bestehende `invoiceId`-FK deckt 1:N-Versionen ab |
| **Sofortiges Entfernen von `generatedDocumentId`** | Single source = `invoiceId` only | Bricht Listenfilter, Legacy-Daten, Frontend-Gates |

---

## 6. Migrationsstrategie (ohne Ausführung in diesem Prompt)

**Phase 0 — Analyse (dieser ADR)**  
Ist dokumentiert; keine Datenänderung.

**Phase 1 — Readiness (Ops, pro Org)**

1. `audit-invoice-document-links.ts --org=<uuid>` (read-only)
2. Exit 0 oder bereinigte `critical`-Findings
3. Optional: `backfill-invoice-document-links.ts --org=<uuid> --apply` (setzt fehlende `invoiceId` + Zeiger)

**Phase 2 — Write-Disziplin (Code)**

- Alle PDF-Pfade setzen **beide** Links atomar (bereits Ziel in V4.9.470; Bundle-Pfad verifizieren)
- Nach Write: Konsistenz-Assert in Dev/Test
- `listForInvoice`-Legacy-OR schrittweise hinter Feature-Flag / Audit-Gate

**Phase 3 — Fallback-Entfernung**

- Booking-OR in `listForInvoice` entfernen, wenn `LEGACY_BOOKING_DOC_FALLBACK = 0`
- `legacyDocumentId`-Parameter deprecaten und entfernen

**Phase 4 — Optional Schema-Härtung**

- Check-Constraint oder Application-Enforcer: `generatedDocumentId` zeigt auf Doc mit passender `invoiceId` + Org
- Optional Partial Unique Index: ein aktives Doc pro `(organization_id, invoice_id, document_type)` where `status NOT IN ('VOID','FAILED')` — **erst nach Backfill**
- Optional Rename `generatedDocumentId` → `active_generated_document_id` (reine Klarstellung)

**Kein Backfill in diesem Prompt.**

---

## 7. Rückwärtskompatibilität

| Consumer | Kompatibilität |
|----------|----------------|
| `GET /invoices/list` | Weiterhin `activeDocumentId` ≈ `generatedDocumentId` |
| `GET /invoices/:id` | Feld `generatedDocumentId` bleibt im DTO |
| Detail-Panel | Unverändert; wird kanonische Versionsquelle |
| `InvoicesView` Legacy (falls geroutet) | Gates auf `generatedDocumentId` bis vollständige Migration |
| Bundle-API / Buchungs-E-Mail | Unabhängiger Flow bleibt |
| Audit-/Backfill-Skripte | Weiter nutzbar |

Breaking Changes **erst** nach Phase 3 mit Audit-Nachweis.

---

## 8. Benötigte Indizes und Constraints

**Bereits vorhanden (beibehalten):**

- `GeneratedDocument(organizationId)`, `(invoiceId)`, `(bookingId)`, `(documentType)`, `(status)`
- `OrgInvoice(generatedDocumentId)` UNIQUE
- `OutboundEmail(organizationId, invoiceId)`

**Empfohlen (Phase 4, optional):**

```sql
-- Application-level zuerst; DB-Constraint nach Backfill
-- Partial unique: max one active invoice doc per type
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  generated_documents_one_active_per_invoice_type
  ON generated_documents (organization_id, invoice_id, document_type)
  WHERE status NOT IN ('VOID', 'FAILED') AND invoice_id IS NOT NULL;
```

**Application-Enforcer (Phase 2):**

- `linkInvoiceToDocument` prüft `doc.organizationId === invoice.organizationId`
- `linkInvoiceToDocument` prüft `doc.invoiceId === invoice.id` (oder setzt `invoiceId` vorher)
- Verbot, `generatedDocumentId` auf Dokument einer anderen Rechnung zu setzen

---

## 9. Risiken

| Risiko | Mitigation |
|--------|------------|
| Zeiger/invoiceId-Drift in Prod | Audit vor Fallback-Entfernung; Backfill nur mit Dry-Run |
| Bundle- vs. Invoice-Pointer widersprüchlich | Audit `BUNDLE_BOOKING_MISMATCH`; Bundle-Write setzt beide |
| `@unique` auf `generatedDocumentId` | Ein Dokument kann nur **eine** Rechnung als „aktiv“ haben — korrekt für 1:1-Aktiv; verhindert versehentliche Doppelverwendung |
| Mehrere Dokumenttypen pro Rechnung | Selten (`OUTGOING_FINAL` eigene Rechnung); Aktiv-Algorithmus **pro documentType** |
| Cross-Tenant-Link | Strikte `organizationId`-Filter; Audit `crossTenantRisk` |
| Vorzeitiges Entfernen von Fallbacks | Sieben Gates aus Legacy-Audit |

---

## 10. Abnahmekriterien

**Phase 1 (Ops-Readiness)**

- [ ] `audit-invoice-document-links.ts` für alle Prod-Orgs: `critical = 0`
- [ ] `removalReadiness.backfillComplete === true` (Skript-Report)
- [ ] Regressionstests `audit-04a`, `audit-04b`, Pipeline `09`, `49` grün

**Phase 2 (Write-Contract)**

- [ ] Jeder erfolgreiche PDF-Write erzeugt `GeneratedDocument` mit `invoiceId`
- [ ] Jeder erfolgreiche PDF-Write aktualisiert `generatedDocumentId` konsistent
- [ ] `FAILED`-Generierung persistiert ohne falschen Aktiv-Zeiger

**Phase 3 (Read-Contract)**

- [ ] Panel/Timeline/E-Mail funktionieren mit **deaktiviertem** `listForInvoice` Booking-OR in Staging
- [ ] Listenfilter `documentStatus=MISSING` korreliert mit Panel `EMPTY`

**Phase 4 (Optional Härtung)**

- [ ] Partial-Unique-Index deployed ohne Insert-Konflikte
- [ ] Dokumentation + Architektur-Eintrag aktualisiert

---

## 11. Antwort auf die Entscheidungsfrage

| Option | Entscheidung |
|--------|--------------|
| **A** — `generatedDocumentId` als `activeGeneratedDocumentId` weiternutzen | **Ja** — Phase 1–3; semantische Umbenennung optional Phase 4 |
| **B** — Neues explizites Feld | **Nein** — nicht nötig |
| **C** — Aktive Version aus Status/Version | **Ja, kombiniert mit A** — algorithmische Wahrheit; Zeiger als Cache |

**Kanonische Formel:**

> **Wahrheit = Menge der `GeneratedDocument`-Zeilen mit `invoiceId` + `organizationId`; aktiv = Status-Regel pro `documentType`; `OrgInvoice.generatedDocumentId` = materialisierter Cache.**

---

## 12. Referenzen (Code)

| Thema | Pfad |
|-------|------|
| Panel + Generierung | `backend/src/modules/invoices/invoice-documents.service.ts` |
| Dokument-Persistenz | `backend/src/modules/documents/generated-documents.service.ts` |
| Bundle-Render | `backend/src/modules/documents/booking-document-bundle.service.ts` |
| Status-Konstanten | `backend/src/modules/documents/documents.constants.ts` |
| Detail-UI | `frontend/src/rental/components/invoices/hooks/useInvoiceDocuments.ts` |
| Audit (read-only) | `backend/scripts/ops/audit-invoice-document-links.ts` |
| Backfill (optional) | `backend/scripts/ops/backfill-invoice-document-links.ts` |
| Schema | `backend/prisma/schema.prisma` (`OrgInvoice`, `GeneratedDocument`, `BookingDocumentBundle`) |
| Schema-Migration (Phase 1) | `backend/prisma/migrations/20260715190000_generated_document_versioning_generation_state/` |

---

## 13. Schema-Umsetzung Phase 1 (2026-07-15)

Additive Migration `20260715190000_generated_document_versioning_generation_state` — **kein Backfill**, Legacy `generatedDocumentId` unverändert.

Neue `GeneratedDocument`-Spalten: `version_number`, `generation_status`, `generation_error_code`, `last_error_message`, `generation_attempt_count` (default 0), `last_generation_attempt_at`, `next_retry_at`, `triggered_by_user_id`, `triggered_by_source`.

Constraints (nur für `version_number IS NOT NULL`): Unique `(org, invoice, document_type, version_number)`; partial unique ein aktives Doc pro `(org, invoice, document_type)` wenn `status NOT IN (VOID, FAILED)`.

Trigger: `generated_documents_invoice_org_check` — `invoice_id` muss `org_invoices.organization_id` matchen.

**Nächster Schritt (Phase 2):** Services befüllen Version/Generation-Felder; Backfill-Skript für `version_number` auf historischen Zeilen.
