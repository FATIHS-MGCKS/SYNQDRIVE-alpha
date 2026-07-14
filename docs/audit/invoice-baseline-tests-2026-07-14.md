# Invoice Baseline Tests — Safety Net (2026-07-14)

Companion to [`invoice-function-ist-analyse-2026-07-14.md`](./invoice-function-ist-analyse-2026-07-14.md).

**Scope:** Automated regression locks for the **current** invoice behavior (including known defects). No business-logic or schema changes in this pass.

---

## 1. Test infrastructure (Ist)

| Layer | Framework | DB | Pattern |
|-------|-----------|-----|---------|
| Backend unit | Jest 29 + ts-jest | Mocked `PrismaService` | Co-located `*.spec.ts` |
| Backend E2E | Jest + supertest | Mocked services | `backend/test/*.e2e-spec.ts` (1 file) |
| Frontend unit | Vitest 3, `environment: node` | N/A | `src/**/*.test.ts` only |
| Frontend E2E | Playwright | `page.route` mocks | No invoice flows yet |

**Existing invoice-related tests (unchanged):**

- `backend/src/modules/invoices/booking-invoice-lifecycle.service.spec.ts`
- `backend/src/modules/documents/documents.service.spec.ts` (bundle, `BOOKING_INVOICE`)
- `backend/src/modules/outbound-email/booking-document-email.service.spec.ts`
- `frontend/src/rental/lib/invoiceClassification.test.ts`

---

## 2. New test files

### Backend

| File | Purpose |
|------|---------|
| `backend/src/modules/invoices/__fixtures__/invoice-baseline.fixtures.ts` | Realistic org/customer/booking/invoice/document IDs and row builders |
| `backend/src/modules/invoices/invoices.service.baseline.spec.ts` | Detail DTO shape, tenant isolation, `createBookingInvoice`, `markPaid`→`BANK_TRANSFER`, task UUID titles |
| `backend/src/modules/invoices/invoice-document-link.baseline.spec.ts` | `GeneratedDocument.invoiceId` vs `OrgInvoice.generatedDocumentId` divergence, tenant doc access |
| `backend/src/modules/invoices/invoice-wizard-flow.baseline.spec.ts` | Wizard `refreshDraftBundle` / `confirmDraft`, silent `.catch` regression locks |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/src/rental/components/invoices/invoice-baseline.fixtures.ts` | Invoice DTO fixtures + extracted UI guard helpers |
| `frontend/src/rental/components/invoices/invoiceUtils.test.ts` | `displayNumber`, `canIssue`, `formatAmount`, CARD raw enum baseline |
| `frontend/src/rental/components/invoices/invoice-detail-ui.baseline.test.ts` | `InvoicesView` source regression locks + `canEmailInvoiceDocument` behavior |
| `frontend/src/rental/components/invoices/invoice-provenance.baseline.test.ts` | Type-based Herkunft mapping (`OUTGOING_FINAL` → „Manuell“) |

### Extended

| File | Change |
|------|--------|
| `backend/src/modules/invoices/booking-invoice-lifecycle.service.spec.ts` | Asserts `recordPayment` uses `method: 'CARD'` for checkout card |

---

## 3. Mapping: audit findings → tests

| # | Finding | Test coverage | Status |
|---|---------|---------------|--------|
| 1 | Wizard/booking path creates invoice | `invoice-wizard-flow.baseline.spec.ts` → `refreshDraftBundle` | ✅ Green |
| 2 | Booking invoice created | `invoices.service.baseline.spec.ts` → idempotency + title | ✅ Green |
| 3 | `BOOKING_INVOICE` PDF / document | `invoice-document-link.baseline.spec.ts` → `createFromPdf` | ✅ Green |
| 4 | `invoiceId` vs `generatedDocumentId` drift | `invoice-document-link.baseline.spec.ts` divergence + no persist lock | ✅ Green |
| 5 | Detail API: IDs only, no resolution | `invoices.service.baseline.spec.ts` → no `customerName` | ✅ Green |
| 6 | UI „Verknüpft“ / UUID | `invoice-detail-ui.baseline.test.ts` source locks | ✅ Green |
| 7 | Herkunft from `type` only | `invoice-provenance.baseline.test.ts` | ✅ Green |
| 8 | Task title UUID fragment | `invoices.service.baseline.spec.ts` → `issue()` task title | ✅ Green |
| 9 | Email requires `bookingId` + `generatedDocumentId` | `invoice-detail-ui.baseline.test.ts` → `canEmailInvoiceDocument` | ✅ Green |
| 10 | `CARD` shown as raw enum | `invoiceUtils.test.ts` + lifecycle spec | ✅ Green |
| 11 | `markPaid` → `BANK_TRANSFER` | `invoices.service.baseline.spec.ts` | ✅ Green |
| 12 | Silent sync errors | `invoice-wizard-flow.baseline.spec.ts` source + behavioral confirm | ✅ Green |
| — | Mandantentrennung Detail | `invoices.service.baseline.spec.ts` cross-org `findById` | ✅ Green |
| — | Mandantentrennung Dokument | `invoice-document-link.baseline.spec.ts` `getById` | ✅ Green |

---

## 4. Test run results (2026-07-14)

### Backend

```bash
cd backend && npm test -- --testPathPattern="invoices/.*baseline|booking-invoice-lifecycle"
```

| Suite | Passed | Skipped |
|-------|--------|---------|
| `invoices.service.baseline.spec.ts` | 6 | 1 |
| `invoice-document-link.baseline.spec.ts` | 5 | 1 |
| `invoice-wizard-flow.baseline.spec.ts` | 6 | 1 |
| `booking-invoice-lifecycle.service.spec.ts` | 2 | 0 |
| **Total** | **20** | **3** |

```bash
cd backend && npx tsc --noEmit          # ✅ pass
cd backend && npx eslint "src/modules/invoices/**/*.ts"  # ✅ pass
```

### Frontend

```bash
cd frontend && npm test -- --run src/rental/lib/invoiceClassification.test.ts src/rental/components/invoices/
```

| Suite | Passed | Skipped |
|-------|--------|---------|
| `invoiceUtils.test.ts` | 9 | 0 |
| `invoice-detail-ui.baseline.test.ts` | 14 | 3 |
| `invoice-provenance.baseline.test.ts` | 5 | 1 |
| `invoiceClassification.test.ts` | 4 | 0 |
| **Total** | **32** | **4** |

```bash
cd frontend && npx tsc -b --noEmit    # ✅ pass
cd frontend && npx eslint "src/rental/components/invoices/**/*.ts"  # ✅ pass
```

Project `npm run lint` scripts target document-extraction paths only; invoice files were linted via explicit paths above.

---

## 5. Skipped tests = future Sollzustand

These **must stay skipped** until the corresponding implementation phase lands; then flip to active and remove opposing regression locks.

| Location | Describe block | Enable after |
|----------|----------------|--------------|
| `invoices.service.baseline.spec.ts` | `target state — invoice detail enrichment (P1)` | Detail DTO joins customer/vehicle |
| `invoice-document-link.baseline.spec.ts` | `target state — generatedDocumentId sync (P0)` | `OrgInvoice.generatedDocumentId` written on PDF create |
| `invoice-wizard-flow.baseline.spec.ts` | `target state — sync error handling (P3)` | Invoice sync errors propagate |
| `invoice-detail-ui.baseline.test.ts` | `target state (P0–P2)` | PDF open, entity labels, payment i18n |
| `invoice-provenance.baseline.test.ts` | `target state (P1)` | True provenance for `OUTGOING_FINAL` |

When fixing a defect:

1. Implement feature.
2. Enable matching `describe.skip` tests.
3. Remove or invert the **regression lock** tests that assert the old broken behavior (e.g. source fragments containing `Verknüpft`).

---

## 6. Known current errors (documented, not fixed)

| Defect | Locked by |
|--------|-----------|
| `OrgInvoice.generatedDocumentId` never set | divergence test + no-persist source lock |
| Detail shows IDs not names | API shape test + UI source locks |
| `OUTGOING_FINAL` Herkunft „Manuell“ | provenance baseline |
| Email gated on `generatedDocumentId` | `canEmailInvoiceDocument` tests |
| `markPaid` always `BANK_TRANSFER` | service baseline |
| Wizard/booking `.catch(() => null)` | source locks in wizard-flow spec |
| No `api.documents.open` in invoice detail | UI source lock |

---

## 7. Not covered (intentional gaps)

- Full HTTP E2E for `/organizations/:orgId/invoices/*` (no test harness yet)
- Real Postgres integration (no shared test DB)
- `PermissionsGuard` on invoice routes (security gap from audit — add when enforced)
- Playwright invoice send flow
- `OUTGOING_MANUAL` invoice email without `bookingId`

---

## 8. Changes / Architektur

**Not updated** — test-only pass, no product architecture change.
