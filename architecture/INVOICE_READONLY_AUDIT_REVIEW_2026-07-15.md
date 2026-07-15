# Rechnungsmodul — Re-Audit nach V4.9.470 (2026-07-15)

**Basis:** `architecture/INVOICE_READONLY_AUDIT_2026-07-15.md`  
**Release:** V4.9.470 — alle Blocker, Kritisch, Mittel und relevante Kosmetik-Fixes

---

## Verifikationsläufe

| Check | Ergebnis |
|-------|----------|
| `npx prisma validate` | ✅ gültig |
| Backend `npm run build` | ✅ |
| Backend `npm test -- --testPathPattern=invoices` | ✅ 10 Suites, **108** Tests |
| Frontend `npm run build` | ✅ |
| Frontend `npm test -- src/rental/components/invoices` | ✅ 22 Suites, **111** Tests |
| Playwright `invoices-flow` + `invoices-responsive` | ✅ **41** passed, 7 skipped |
| `audit-invoice-document-links.ts` (Prod-DB) | weiterhin Ops-Pflicht pro Org |

---

## Befund-Status

### BLOCKER

| ID | Status | Umsetzung |
|----|--------|-----------|
| B1 | ✅ Behoben | `bootstrapBookingInvoice` loggt + rethrow; Bookings loggt Fehler; Wizard awaited; Bundle nutzt bootstrap ohne Silent-Catch |
| B2 | ✅ Behoben | `InvoiceOverdueSchedulerService` (@Cron täglich) setzt `OVERDUE`; Reconcile zu `PAID` |
| B3 | ⚠️ Ops | Audit-Script unverändert; neu `backfill-invoice-document-links.ts` für Reparatur; Auto-Link nach Bundle-PDF |

### KRITISCH

| ID | Status | Umsetzung |
|----|--------|-----------|
| K1 | ✅ Behoben | Upload → privater `DOCUMENTS_STORAGE`; `GET …/invoices/:id/attachment`; Frontend `openInvoiceAttachment` |
| K2 | ✅ Behoben | `recordInvoiceGenerationFailure` → `GeneratedDocument` FAILED; Panel liest persistierten Fehler |
| K3 | ✅ Behoben | Migration FK: `generatedDocumentId`, `GeneratedDocument.invoiceId`, `OutboundEmail.invoiceId` |
| K4 | ✅ Behoben | `invoiceDetail.mapper` — E-Mail nur PDF + Admin, kein `bookingId`-Zwang |

### MITTEL

| ID | Status | Umsetzung |
|----|--------|-----------|
| M1 | ✅ Behoben | Bundle `ensureBookingInvoice` setzt `OrgInvoice.generatedDocumentId` |
| M2 | ✅ Behoben | `findByOrg` batcht Payment-User-Lookup (kein N+1) |
| M3 | ✅ Behoben | `useInvoiceRelationsEnrichment` → `vehicles.getByOrg` |
| M4 | ✅ Behoben | PDF erzeugen / E-Mail nur noch in `InvoiceDocuments`; Header nur PDF ansehen + Mehr-Menü |
| M5 | ✅ Behoben | `requireInvoice` / `findById` erfordern `orgId` |
| M6 | ✅ Behoben | `closeLinkedTasks(orgId, invoiceId)` org-scoped |
| M7 | ✅ Behoben | Buchungsrechnungs-Titel via `invoiceBookingRef` |
| M8 | ✅ Behoben | `InvoiceExtractionUpload` ohne ID-Präfix-Fallback |

### KOSMETISCH

| ID | Status |
|----|--------|
| FinanceView → `InvoicesPage` direkt | ✅ |
| Theme/Pagination-E2E | unverändert dokumentiert (nicht blockierend) |

---

## Verbleibende Ops-Schritte (nicht Code)

1. Pro Produktions-Org: `audit-invoice-document-links.ts --org=<uuid>` (Exit 0).
2. Bei Warnungen: `backfill-invoice-document-links.ts --org=<uuid> --apply`.
3. Legacy public `imageUrl`-Werte: Re-Upload oder manuelle Migration.
4. `listForInvoice` Booking-Fallbacks erst nach grünem Audit entfernen.

---

## Rollout-Empfehlung

**Go** für Rechnungs-UI V4.9.470 nach Staging-Smoke (Liste → Detail → PDF → E-Mail → Zahlung) und Ops Document-Link-Audit.
