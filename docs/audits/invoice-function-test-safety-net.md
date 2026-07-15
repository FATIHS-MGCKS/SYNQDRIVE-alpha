# Test-Sicherheitsnetz: Rechnungsfunktion (OrgInvoice)

**Stand:** 2026-07-15  
**Bezug:** [invoice-function-current-state.md](./invoice-function-current-state.md) (Ist-Analyse)  
**Branch:** `cursor/invoice-test-safety-net-c2c2`  
**Modus:** Nur Tests + Dokumentation — keine Business-Logik- oder Schema-Änderungen.

---

## 1. Vorhandene Test-Infrastruktur (Ist)

| Bereich | Framework | Pfad / Konvention |
|---------|-----------|-------------------|
| Backend Unit/Integration | Jest (`npm test`) | `backend/src/**/*.spec.ts` |
| Backend E2E | Jest + `test/jest-e2e.json` | `backend/test/*.e2e-spec.ts` |
| Frontend Unit/Integration | Vitest (`npm test`) | `frontend/src/**/*.test.ts(x)` |
| Frontend E2E | Playwright | `frontend/e2e/invoices-flow.spec.ts`, `invoices-responsive.spec.ts` |
| Invoice Pipeline Harness | In-memory Prisma | `backend/src/modules/invoices/invoices-pipeline.harness.ts` |
| Invoice Test Store | Relational fixtures | `backend/src/modules/invoices/invoices-test-store.ts` |
| Fixtures | Deterministic IDs | `backend/src/modules/invoices/__fixtures__/invoice-pipeline.fixtures.ts` |
| Payment-Task Harness | Tasks + Invoice | `backend/src/modules/invoices/invoice-payment-task.harness.ts` |

**Hinweis:** Die Ist-Analyse beschrieb teils den älteren `InvoicesView`-Monolith. `main` enthält parallel eine refaktorierte Rechnungs-UI (`InvoicesPage`, `InvoiceDetail`, Mapper). Baseline-Tests decken **beide Schichten** ab: API-Ist + neue UI-Mapper.

---

## 2. Neue Testdateien (dieser Prompt)

| Datei | Typ | Audit-Punkte |
|-------|-----|--------------|
| `backend/src/modules/invoices/invoice-audit-baseline.integration.spec.ts` | Integration (Harness) | 01–05, 08–12, Mandantentrennung |
| `backend/src/modules/invoices/utils/invoice-booking-ref.util.spec.ts` | Unit | 08 (BK-Referenz) |
| `backend/src/modules/bookings/booking-invoice-bootstrap.behavior.spec.ts` | Characterization | 12 (stille `.catch`-Kette) |
| `frontend/src/rental/components/invoices/invoice-audit-baseline.regression.test.ts` | Vitest | 04, 06–07, 09–10 |

---

## 3. Bestehende relevante Tests (nicht dupliziert)

| Datei | Abdeckung |
|-------|-----------|
| `invoices.pipeline.integration.spec.ts` | Vollmatrix Erstellung, PDF, Versand, Zahlung, Security (51 Fälle) |
| `booking-invoice-lifecycle.service.spec.ts` | Wizard-Sync, markPaid vs paymentIntent |
| `invoice-payment-task.integration.spec.ts` | Aufgaben, Dedup, AUTO_RESOLVED |
| `invoice-list-read.service.spec.ts` | Listen-Anreicherung (Kunde, BK, Fahrzeug) |
| `invoice-payments.presentation.spec.ts` | CARD → „Karte“ (Backend-Presentation) |
| `invoiceRelations.mapper.test.ts` | Relations + Provenance (Soll-UI) |
| `invoiceDetail.mapper.test.ts` | E-Mail ohne bookingId, PDF-Gates |
| `invoicePayments.mapper.test.ts` | i18n Zahlungsarten |
| `useInvoiceDocuments.integration.test.ts` | Invoice-Dokument-API ohne bookingId |
| `documents.service.spec.ts` | Bundle-Tenant, PARTIAL/COMPLETE |
| `booking-payment-invoice.validation.spec.ts` | Connect ↔ Invoice |
| `frontend/e2e/invoices-flow.spec.ts` | E2E Smoke (Playwright) |

---

## 4. Mapping Audit-Punkte → Tests

| # | Thema | Status Tests | Datei(en) |
|---|-------|--------------|-----------|
| 1 | Buchung über Wizard/Formular | **Grün** | `invoice-audit-baseline` 01–03, `invoices.pipeline` 02–03 |
| 2 | Buchungsrechnung erzeugt | **Grün** | `invoice-audit-baseline` 01–02 |
| 3 | BOOKING_INVOICE PDF | **Grün** | `invoice-audit-baseline` 03b (Bundle-Simulation), `invoices.pipeline` 09 |
| 4 | Dokumentrelation divergiert | **Grün (Regression)** | `invoice-audit-baseline` 04a/04b, `invoices.pipeline` 49 |
| 5 | Detail-API ohne Auflösung | **Grün (Ist dokumentiert)** | `invoice-audit-baseline` 05 |
| 6 | UI „Verknüpft“ / UUID | **Grün (neue UI)** | `invoice-audit-baseline.regression` 06, `InvoiceRelations.test.tsx` |
| 7 | Herkunft nur aus Typ | **Grün (Anti-Pattern)** | `invoice-audit-baseline.regression` 07 |
| 8 | Aufgabe mit UUID-Fragment | **Grün** | `invoice-audit-baseline` 08, `invoice-payment-task` |
| 9 | Versand braucht bookingId | **Grün (neue UI)** / **TODO Legacy** | `invoiceDetail.mapper.test`, `invoice-audit-baseline` 09 |
| 10 | CARD als Enum | **Grün** | `invoice-audit-baseline` 10, `invoicePayments.mapper.test` |
| 11 | markPaid → BANK_TRANSFER | **Grün (Ist dokumentiert)** | `invoice-audit-baseline` 11 |
| 12 | Stille Sync-Fehler | **Grün (Characterization)** | `booking-invoice-bootstrap.behavior`, `invoice-audit-baseline` 12 |

---

## 5. Aktuelle Fehler / bekannte Ist-Zustände (keine Fixes in diesem Prompt)

| Thema | Ist (codebelegt) | Test-Verhalten |
|-------|------------------|----------------|
| `GET .../invoices/:id` liefert nur Roh-IDs | `InvoicesService.findById` | `audit-05` assertiert fehlende Display-Felder |
| `markPaid` ohne Methodenwahl | `InvoicesService.markPaid` → `BANK_TRANSFER` | `audit-11` |
| `BookingsService.create` verschluckt Bootstrap-Fehler | `.catch(() => null)` Zeile ~283 | `audit-12c/d` Characterization |
| Legacy `InvoicesView` E-Mail an `bookingId` | Alte UI (falls noch geroutet) | `it.todo` in Frontend-Baseline |
| Legacy gap `invoiceId` ohne `generatedDocumentId` | Migration/Backfill-Szenario | `audit-04b` — Panel findet Doc trotzdem |

---

## 6. Tests für zukünftigen Sollzustand

| Test | Aktivierung nach |
|------|------------------|
| `audit-09-future — Legacy InvoicesView…` (`it.todo`) | Entfernung/Routing alter `InvoicesView`-E-Mail-Logik |
| `invoices.pipeline` 09 (generatedDocumentId nach generate) | Bereits Soll für manuelle PDF — Bundle-Pfad analog absichern |
| Listen vs Detail-Parität | Wenn `findById` Display-Felder wie `InvoiceListReadService` liefert → `audit-05` anpassen |

**Nicht als `it.failing` markiert**, weil Jest/Vitest im Projekt `it.todo` für geplante Solltests nutzt; bewusst fehlschlagende Tests würden CI blockieren.

---

## 7. Ausführung (dieser Lauf — 2026-07-15)

```bash
cd backend && npx prisma generate
cd backend && npx tsc --noEmit                    # OK
cd backend && npm test -- --testPathPattern="invoice-audit-baseline|invoice-booking-ref|booking-invoice-bootstrap|modules/invoices|booking-invoice-lifecycle|booking-payment-invoice"
cd frontend && npx tsc -b --noEmit                # OK
cd frontend && npm test -- src/rental/components/invoices/
```

| Suite | Ergebnis |
|-------|----------|
| Backend Audit-Baseline (`invoice-audit-baseline`, `invoice-booking-ref`, `booking-invoice-bootstrap`) | **18/18 grün** |
| Backend Invoice-Gesamt (16 Suites) | **146/146 grün** |
| Frontend Invoice-Komponenten (23 Dateien) | **117 grün, 1 `it.todo`** |
| Backend `tsc --noEmit` | **grün** (nach `prisma generate`) |
| Frontend `tsc -b --noEmit` | **grün** |
| ESLint | **nicht auf Rechnungs-Pfade konfiguriert** (`backend/package.json` / `frontend/package.json` lint-Globs nur Document-Extraction) |

**Harness-Hinweis:** `BookingDocumentBundle` ist im Pipeline-Harness als leerer Mock verdrahtet. Die Audit-Tests `audit-03b` und `audit-04a` nutzen die Hilfsfunktion `wireBundleCreatesBookingInvoice()` in der Spec-Datei, um den Bundle-Pfad für `BOOKING_INVOICE` realistisch zu simulieren — ohne Produktivcode zu ändern.

---

## 8. Changes / Architektur

Nur Test- und Audit-Dokumentation — **Changes** und **Architektur** UI-Einträge nicht aktualisiert.
