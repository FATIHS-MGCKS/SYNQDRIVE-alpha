# Invoice Process Integration Test Matrix (V4.9.468)

## Approach

Follows SynqDrive integration convention (`pricing-test-store`, `document-extraction.pipeline.integration.spec.ts`):

- **Real service wiring** — `InvoicesService`, `BookingInvoiceLifecycleService`, `InvoiceDocumentsService`, `InvoiceDocumentEmailService`, `OutboundEmailService`, `GeneratedDocumentsService`, `InvoiceNumberService`
- **Relational in-memory store** — `invoices-test-store.ts` (transactions, nested creates, org scoping)
- **Mocked external I/O only** — email provider (`EmailProviderRegistry`), PDF renderer, document storage, `BookingDocumentBundleService`, `TasksService.upsertByDedup`
- **Deterministic** — fixed clock (`FIXED_NOW`), stable fixture IDs, no real emails

## Files

| File | Role |
|------|------|
| `__fixtures__/invoice-pipeline.fixtures.ts` | IDs + line-item fixture |
| `invoices-test-store.ts` | In-memory Prisma stand-in |
| `invoices-pipeline.harness.ts` | Service factory + `issueWithPdf` helper |
| `invoices.pipeline.integration.spec.ts` | 51 scenario tests |

## Scenario coverage (51 tests)

| # | Area | Scenario |
|---|------|----------|
| 1–8 | Erstellung | Manuell, Buchungsformular, Wizard, Eingang, ohne Buchung/Fahrzeug, Firma/Privat |
| 9–16 | Dokumente | Erste PDF, Versionen, aktiv, Fehler, Retry, Storage, Parallel, Legacy-Backfill |
| 17–26 | Versand | Ohne bookingId, Provider, Delivered, Failed, Bounce, Retry+Idempotency, extern Post/Mail, ohne Empfänger/PDF |
| 27–35 | Zahlungen | Teil/Voll, Bar/Karte/Überweisung/Stripe, Überzahlung, Duplikat, Task schließen |
| 36–40 | Status | Erlaubt/unerlaubt, überfällig, storniert, Teil→Voll |
| 41–47 | Sicherheit | Cross-tenant read/doc/customer/vehicle, Versand, manipulierte ID, Zahlung |
| 48–51 | Reconciliation | Ohne Dokument, Pointer-Lücke, hängender Versand, PAID+offene Task |

## Run

```bash
cd backend && npm test -- invoices.pipeline.integration.spec.ts
```

Full invoice module suite:

```bash
cd backend && npm test -- --testPathPattern=modules/invoices
```
