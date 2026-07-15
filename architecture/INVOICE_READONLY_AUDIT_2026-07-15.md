# Rechnungsmodul — Read-only Abschlussaudit (2026-07-15)

**Scope:** Rechnungsübersicht, Rechnungsdetail (Frontend), Backend-Verdrahtung (Invoices, Documents, OutboundEmail, Payments, Booking-Lifecycle).  
**Modus:** Read-only — keine Code-, Migrations- oder Teständerungen.

---

## Verifikationsläufe (lokal)

| Check | Ergebnis |
|-------|----------|
| `npx prisma validate` | ✅ gültig (1 Schema-Warnung `onDelete: SetNull` bei required FK) |
| Backend `npm run build` | ✅ |
| Backend `npm test -- --testPathPattern=invoices` | ✅ 9 Suites, **106** Tests |
| Frontend `npm run build` (inkl. `tsc -b`) | ✅ |
| Frontend `npm test -- src/rental/components/invoices` | ✅ 22 Suites, **109** Tests |
| ESLint (konfigurierter Scope) | ✅ 0 Errors (Backend 1 Warning außerhalb Invoice) |
| Playwright `invoices-flow` + `invoices-responsive` | ✅ **41** passed, 7 skipped |
| `audit-invoice-document-links.ts` (Dry-Run) | ⚠️ nicht ausführbar — keine DB (`localhost:5432`) |

**Hinweis:** Vollständiger Backend-`jest`-Lauf und produktionsnaher Document-Link-Audit erfordern laufende Postgres-Instanz mit Org-Daten.

---

## 1. BLOCKER

### B1 — Stille Rechnungserstellung bei Buchungsflows

`createBookingInvoice` wird in mehreren Pfaden mit `.catch(() => null)` verschluckt. Buchungen können existieren, ohne dass eine Rechnung angelegt wurde — ohne Fehler im UI/API-Response.

Betroffen u. a.:
- `backend/src/modules/bookings/bookings.service.ts` (Zeile ~278)
- `backend/src/modules/bookings/booking-wizard-draft.service.ts` (~312)
- `backend/src/modules/documents/booking-document-bundle.service.ts` (~471)

**Rollout-Risiko:** Fehlende Rechnungen, leere Dokument-Panels, blockierter Checkout/Zahlungsfluss.

### B2 — `OVERDUE` als persistierter Status fehlt

`OrgInvoiceStatus.OVERDUE` existiert; Kundeneligibility und Buchungs-Payment-Status fragen `status: 'OVERDUE'` ab. Es gibt **keinen produktiven Writer**, der Rechnungen auf `OVERDUE` setzt. Überfälligkeit wird nur **read-time** via `isInvoiceOverdue()` in der Listen-UI berechnet.

**Folge:** Inkonsistenz zwischen UI-Filter „überfällig“, Eligibility-Queries und tatsächlichem DB-Status; Notification `INVOICE_OVERDUE` ohne Producer.

### B3 — Produktions-Document-Link-Audit nicht verifiziert

`scripts/ops/audit-invoice-document-links.ts` ist implementiert (Dry-Run, Exit-Codes, `removalReadiness`), konnte in dieser Umgebung nicht gegen echte Daten laufen. **Vor Entfernung der Legacy-Fallbacks in `listForInvoice` zwingend pro Org ausführen.**

---

## 2. KRITISCH

### K1 — Eingangsrechnungs-Anhänge (`imageUrl`) potenziell öffentlich

Generierte PDFs: privater Document-Storage + authentifizierter Download. Legacy-Upload `POST …/invoices/upload` nutzt `StorageService.finalizeUpload` → bei S3 **public URL**.

### K2 — PDF-Generierungsfehler nur in-memory

`InvoiceDocumentsService` hält `failures` und `generating` in `Map` — **nicht persistiert**. Nach Prozess-Neustart verloren; DB-Filter `documentStatus=failed` kann Panel-Zustand `FAILED` nicht widerspiegeln.

### K3 — Schwache Referenzintegrität Invoice ↔ Document

- `OrgInvoice.generatedDocumentId` ohne Prisma-FK
- `GeneratedDocument.invoiceId` ohne Relation zu `OrgInvoice`
- `OutboundEmail.invoiceId` nur Index, kein FK

Orphan-Pointer möglich; Audit-Script deckt ab, automatische Reparatur fehlt.

### K4 — Frontend/Backend-Gate-Inkonsistenz E-Mail

| Ebene | `bookingId` für Senden |
|-------|------------------------|
| Backend `invoice-documents.capabilities.ts` | **nicht** erforderlich (nur PDF + Admin) |
| Backend `InvoiceDocumentEmailService` | **nicht** erforderlich |
| Frontend `invoiceDetail.mapper.ts` | **erforderlich** (`bookingId && hasGeneratedPdf`) |
| Frontend UI (wenn Panel geladen) | Panel-Capabilities **überschreiben** Mapper-Gates |

Praktisch: Nach Panel-Load kann Senden ohne Buchung möglich sein, während Mapper-Reason „E-Mail erfordert Buchung und generiertes PDF“ irreführend bleibt.

---

## 3. MITTEL

### M1 — `generatedDocumentId` nicht immer nach Bundle-PDF gesetzt

Bundle-Generierung kann PDF erzeugen, ohne `OrgInvoice.generatedDocumentId` zu setzen (`linkInvoiceToDocument` nur im Invoice-Documents-Pfad). Listenfilter `documentStatus=present` nutzt Pointer.

### M2 — Legacy-List-Endpoint mit N+1

`GET …/invoices` → `findByOrg` ruft `presentPayments` **pro Rechnung** auf. Neue UI nutzt `GET …/invoices/list` (`InvoiceListReadService`, gebatcht) — Legacy-Endpunkt bleibt für Dashboard/Insights.

### M3 — Fahrzeug-Anreicherung lädt gesamte Flotte

`useInvoiceRelationsEnrichment` → `api.vehicles.listByOrg` + `find(id)`. Skalierungs- und Latenzrisiko; Fahrzeug-Navigation in `App.tsx` scheitert, wenn Fahrzeug nicht in `fleetVehicles` Cache.

### M4 — Doppelte Primäraktionen im Detail

PDF erzeugen / E-Mail senden in `InvoiceDetailHeader` **und** `InvoiceDocuments` — funktional ok, erhöht E2E-/UX-Komplexität.

### M5 — `findById` ohne `orgId` intern möglich

`requireInvoice(id)` erlaubt org-loses `findUnique` — Controller übergibt immer `orgId`, interne Aufrufer müssten geprüft werden.

### M6 — `closeLinkedTasks` ohne `organizationId`

`OrgTask` wird nur per `invoiceId` geschlossen — geringes Cross-Tenant-Risiko (UUID-Kollision), inkonsistentes Muster.

### M7 — Buchungsrechnungs-Titel mit ID-Präfix

`createBookingInvoice` setzt `title: Buchungsrechnung #${booking.id.slice(0, 8)}` — technische ID-Fragmente in Nutzer-sichtbarem Titel.

### M8 — KI-Upload Fahrzeug-Picker Fallback

`InvoiceExtractionUpload.tsx`: `v.id.slice(0, 8)` wenn Make/Model/Kennzeichen fehlen.

---

## 4. KOSMETISCH

- `InvoicesView` als deprecated Wrapper; `FinanceView` importiert noch `InvoicesView`.
- Gemischtes Theme in Invoice-Modul (`invoiceTheme.ts` gray-Klassen vs. Design-Tokens).
- Detail-Layout `max-w-3xl` + Payment-Tabelle `min-w-[640px]` → horizontaler Scroll im engen Layout.
- Pagination nicht E2E-getestet (Mock immer `totalPages: 1`).
- ESLint deckt Invoice-Modul nicht vollständig ab (nur Document-Upload-Pfade).
- Prisma-Validate-Warnung zu `SetNull`/`required` (nicht invoice-spezifisch).

---

## 5. BESTANDEN

### Datenmodell
- Dual-Link-Architektur dokumentiert: `GeneratedDocument.invoiceId` + `OrgInvoice.generatedDocumentId`
- Versionierung via Void + Neuanlage; aktive Version aus sendable/non-void Docs
- `@@unique([organizationId, sequenceYear, sequenceNumber])` für Nummernkreis
- `OrgInvoicePayment.bookingPaymentRequestId @unique` für Stripe-Idempotenz
- Legacy-Felder markiert (`invoiceNumber`, `legacyInvoiceNumber`); Migrations-Backfill für outstanding/paid
- Audit-Script für Pointer-Mismatch, Orphans, Legacy-Booking-Fallback, Cross-Bundle-Mismatch

### Rechnungserstellung
- Manuelle API, Booking-Form/Wizard/Bundle, OCR (`INCOMING_UPLOADED` + `NEEDS_REVIEW`), Stripe-Checkout-Invoice
- Atomare Nummernvergabe bei `issue()`; Display `orgShort-year-seq`
- Steuer 0/7/19 %; `computeInvoiceTotals`; Booking-Fälligkeit +14 Tage
- Provenance-Mapper ohne „Verknüpft“ / „Automatisch (Buchung)“

### Dokumente
- Panel-States ACTIVE/EMPTY/GENERATING/FAILED; Capabilities mit `allowed` + `reason`
- Regenerate voidet alte Version; Retry für Generierung und E-Mail
- Privater PDF-Storage; Download org-scoped
- Reconciliation-Skripte: duplicates, fake-paid-card, cleanup-invalid

### Versand
- Dedizierter Invoice-Endpunkt `POST …/documents/send-email`
- `OutboundEmail.invoiceId` gesetzt; Event-Historie; Provider-Idempotency-Key
- Retry erzeugt neue Outbound-Zeile (Audit-Trail)
- `mark-sent` deprecated aber vorhanden für externen Versand

### Zahlungen
- Teil-/Vollzahlung; Überzahlung abgelehnt; Referenz-Duplikat-Schutz
- Stripe-Reconciliation mit `bookingPaymentRequestId`-Unique
- Task-Abschluss bei `outstanding === 0`
- `derivePaymentStatus` für PAID/PARTIALLY_PAID

### Frontend
- Vollständige modulare Detail-Hierarchie (Header, Relations, LineItems, Payments, Documents, Secondary/Timeline, Notes)
- Listen-Read-Model mit URL-Sync, Debounce, Mobile Cards + Desktop-Tabelle
- Kein `SupportContextButton` im Rechnungsdetail
- Keine sichtbaren UUIDs in Relations; Payment-Methoden lokalisiert
- E2E: 24 Flows + 6 Viewports; Anti-Pattern-Guards
- Unit/Integration: 109 Frontend- + 106 Backend-Invoice-Tests

---

## 6. Offene Migrationsschritte

1. **Document-Link-Backfill:** `GeneratedDocument.invoiceId` für alle aktiven Pointer setzen; Audit pro Org bis `removalReadiness.backfillComplete`.
2. **Legacy-Fallback-Entfernung:** `listForInvoice` Booking-OR erst nach grünem Audit + Staging.
3. **FK optional:** `generatedDocumentId` → `generated_documents.id` (mit ON DELETE SET NULL).
4. **OVERDUE-Job:** Persistenter Status oder Eligibility auf computed `isInvoiceOverdue` umstellen (einheitliches Modell).
5. **Deprecated Endpoints:** `GET …/invoices` (legacy), `mark-sent`, `pay`, `upload` — Verbraucher inventarisieren und abschalten.
6. **`invoiceNumber` Spalte:** Langfristig entfernen nach vollständiger Display-Sequence-Nutzung.

---

## 7. Produktions-Rollout-Empfehlung

**Bedingt go** für Rechnungs-UI V4.9.466–469, **nach** Pre-Flight:

1. Pro Produktions-Org: `audit-invoice-document-links.ts` (Dry-Run, Exit 0).
2. Stichprobe: Buchungen ohne `OUTGOING_BOOKING`-Rechnung (`audit-duplicate-booking-invoices.ts`).
3. `audit-fake-paid-card-invoices.ts` falls CARD-Checkout-Historie relevant.
4. Smoke: Liste → Detail → PDF → E-Mail → Zahlung auf Staging mit echten Rollen (`ORG_ADMIN` für E-Mail).
5. Feature-Flag/Rollout: zuerst interne Orgs, dann Tenant-Wellen.

**Nicht blockierend für UI-Rollout, aber parallel planen:** OVERDUE-Persistenz, silent `createBookingInvoice` Fehlerbehandlung, public `imageUrl` Review.

---

## 8. Rollback-Risiken

| Risiko | Auswirkung | Mitigation |
|--------|------------|------------|
| UI-Rollback auf alte Monolith-Invoices | Verlust neuer Filter/Detail-DTOs | Git-Revert Frontend-Bundle; Backend-APIs abwärtskompatibel |
| Document-Link-Audit übersprungen | Nach Fallback-Removal fehlende PDFs in UI | Audit zwingend vor Schema/Code-Cleanup |
| In-memory PDF-Fehler nach Deploy/Restart | „Leeres“ Panel trotz Fehler | Retry-Button; ggf. erneut generieren |
| Panel-Gate-Override | Unerwartetes E-Mail-Senden ohne Buchung | Capabilities in Backend bereits offen — Rollback ändert Verhalten |
| Legacy `GET /invoices` noch von Dashboard genutzt | N+1 unter Last | List-Read-Model bereits Standard für Rental-UI |

---

## Explizite Anti-Pattern-Suche (Invoice-Scope)

| Pattern | Befund |
|---------|--------|
| Sichtbare UUIDs (Frontend Detail) | ✅ nicht in Relations; interne ID nur Copy-Button |
| `slice(0, 8)` | ⚠️ Backend Booking-Titel, KI-Upload Vehicle-Picker |
| „Verknüpft“ ohne Kontext | ✅ entfernt (nur `aria-label` Aufgaben) |
| CARD/BANK_TRANSFER Rohtext | ✅ lokalisiert in Payments |
| „Automatisch (Buchung)“ | ✅ nicht in Provenance |
| `catch(() => null)` | ⚠️ Booking-Flows, `InvoiceDetail` Customer-Prefetch |
| Unsichere Storage-URLs | ⚠️ `imageUrl` public model |
| N+1 | ⚠️ legacy `findByOrg`; ✅ `InvoiceListReadService` |
| Cross-Tenant | ✅ Controller org-scoped; ⚠️ `closeLinkedTasks`, optional `findById` |
| Tote Legacy-Endpunkte | ⚠️ `mark-sent`, `pay`, legacy list, upload |
| Ungenutzte Komponenten | `InvoicesView` deprecated, noch referenziert |
| Fehlende Tests | Page-Shells, Dialoge, Pagination, KPI-Chips |
| TODOs / console.log | ✅ keins in `invoices/**` (Backend) |
| `any` kritisch | ✅ nur Test-Store; `StorageService` S3 client |

---

*Audit durchgeführt ohne Änderungen an Produktivcode, Migrationen oder Tests.*
