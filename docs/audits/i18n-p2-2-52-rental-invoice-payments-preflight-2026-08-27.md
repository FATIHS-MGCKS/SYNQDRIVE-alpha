# P2.2.52 — Rental Invoice Payments — Pre-Flight Audit

**Date:** 2026-08-27
**Mode:** STRICT READ-ONLY PRE-FLIGHT
**Authoritative baseline:** `f4ff2e8b22ede182a57433076a0e0c03f504dd78` (PR #1345 merge)
**Merged implementation HEAD (squashed content):** tree-equivalent to `517a9f41f`
**Campaign:** RENTAL
**Frozen:** P216–P251

---

## PART A — P251 post-merge baseline

### A.1 Merge provenance

| Check | Result |
|-------|--------|
| PR #1345 merged | **YES** (`mergedAt: 2026-08-27T17:16:26Z`) |
| PR #1345 closed | **YES** |
| Merge commit SHA | `f4ff2e8b22ede182a57433076a0e0c03f504dd78` |
| Merge strategy | **Squash merge** (single parent `fb03d921`; tree identical to `517a9f41f`) |
| Implementation commit count (PR branch) | 2 (`3b7628115` + `517a9f41f`) |
| Current `origin/main` | `b053bcc00` (#1344 dashboard/fleet fixtures atop #1339) |
| Campaign baseline branch | `p239-p238-merge-baseline-3c10` @ `f4ff2e8b2` |
| Topology | **PARALLEL CAMPAIGN** — P251 merge on campaign baseline, not on `main` |

### A.2 Baseline health (`f4ff2e8b2`)

| Metric | Value |
|--------|-------|
| EN keys | **8799** |
| DE keys | **8799** |
| Parity | **100%** |
| Orphans | **0** |
| P251 enforce-clean | **0** |
| P250–P216 enforce-clean | **0** |
| Global enforce-clean | **0** |
| i18n test files | **483** |
| `npm run i18n:check` | **PASS** |
| `npm run check:surface` | **PASS** |

### A.3 P251 freeze verified

Frozen paths unchanged at baseline:
- `InvoiceRelations.tsx`, `InvoiceRelationRow.tsx`, `invoiceRelations.mapper.ts` (relation builders), `rental-invoice-relations-i18n.ts`
- `buildInvoiceProvenance` — frozen for P249 Secondary

---

## PART B — Payments runtime / domain map

### B.1 Surface resolution verdict

**PAYMENTS TARGET CONFIRMED WITH BOUNDARY CORRECTION**

Repository truth: Invoice Payments is **already substantially i18n-wired** via 43 existing `invoicePayment.*` keys (EN+DE). P2.2.52 is a **production-hardening slice** (locale-threaded money/date formatting, enforce-clean, same-mount tests, bounded adapter), not greenfield string extraction.

### B.2 Complete runtime paths

```
InvoiceDetail
  → useInvoicePayments(orgId, invoice, onUpdate, detail.actions.record_payment)
  → InvoicePayments (section card, summary, list/table, record button)
      → buildPaymentSummary(invoice, t)
      → sortPaymentsNewestFirst(payments)
      → formatPaymentAmount / formatPaymentRowDate (mapper wrappers)
      → invoicePaymentMethodLabel / invoicePaymentStatusLabel / invoicePaymentRecordedByLabel
      → RecordPaymentDialog (controlled form state from hook)
      → InvoicePaymentDetailDialog (read-only detail)
  → recordInvoicePayment(orgId, invoiceId, payload) [API]
```

### B.3 Production files (exact)

| Path | Role |
|------|------|
| `InvoicePayments.tsx` | Payments section card, summary grid, mobile/desktop list, record CTA |
| `InvoicePaymentDetailDialog.tsx` | Payment detail modal |
| `RecordPaymentDialog.tsx` | Record-payment form dialog |
| `invoicePayments.mapper.ts` | Labels, summary, sort, validation, payload build, error parse, formatters |
| `hooks/useInvoicePayments.ts` | Dialog state, form state, submit mutation orchestration |
| `invoicePayments.api.ts` | `recordInvoicePayment` API call |
| `invoicePaymentTypes.ts` | Types + method codes |

**Out of P252 scope (frozen):** P251 Relations, P250 Header, P249 Secondary, Documents, Line Items, Create/Send, Tenant Billing.

### B.4 Payment domain inventory

| Field | Classification |
|-------|----------------|
| `payment.id` | RAW DOMAIN DATA |
| `invoice.id` (context) | RAW DOMAIN DATA |
| `amountCents` | RAW DOMAIN DATA / FINANCIAL |
| `currency` (invoice) | RAW DOMAIN DATA / MACHINE |
| `statusKind` (`recorded`, `provider_confirmed`) | MACHINE VALUE |
| `statusLabel` (API override) | DYNAMIC PROVIDER TEXT — preserve raw when present |
| `method` (`BANK_TRANSFER`, `CASH`, `CARD`, `STRIPE`, `DIRECT_DEBIT`, `OTHER`) | MACHINE VALUE |
| `paidAt`, `createdAt` | RAW DOMAIN DATA |
| `reference`, `note` | RAW DOMAIN DATA / user-entered |
| `createdByName` | DYNAMIC ENTITY DATA — preserve raw |
| `isProviderBacked` | MACHINE FLAG |
| `provider` / external IDs | **Not exposed in current UI** |
| Refund fields | **Not present in current Payments UI** |

### B.5 Payment status machine

| Machine ID | Source | Baseline label key | Tone | Icon |
|------------|--------|-------------------|------|------|
| `recorded` | `statusKind` default | `invoicePayment.status.recorded` | neutral | neutral dot |
| `provider_confirmed` | `statusKind` | `invoicePayment.status.provider_confirmed` | success | success dot |
| API `statusLabel` | backend | **raw passthrough** (preferred over kind) | inherited from kind | inherited |

**Strategy:** Reuse existing `invoicePayment.status.*` keys; map `statusKind` → TranslationKey in mapper; never derive mutation/refund eligibility from localized label.

### B.6 Payment method machine

| Code | Key | In `INVOICE_PAYMENT_METHOD_CODES` |
|------|-----|-----------------------------------|
| `BANK_TRANSFER` | `invoicePayment.method.BANK_TRANSFER` | YES |
| `CASH` | `invoicePayment.method.CASH` | YES |
| `CARD` | `invoicePayment.method.CARD` | YES |
| `STRIPE` | `invoicePayment.method.STRIPE` | YES |
| `DIRECT_DEBIT` | `invoicePayment.method.DIRECT_DEBIT` | NO (in METHOD_I18N only) |
| `OTHER` / unknown | `invoicePayment.method.OTHER` | fallback |

Record-payment select uses codes: `BANK_TRANSFER`, `CASH`, `CARD`, `STRIPE`, `OTHER`.

### B.7 Remaining visible / hidden debt (Payments)

| Debt | Location | Type |
|------|----------|------|
| `formatPaymentAmount` / `formatPaymentRowDate` / `buildPaymentSummary` omit locale | `invoicePayments.mapper.ts` | **FIXED-LOCALE** (defaults to `de` via `formatAmount`/`formatDate`) |
| `aria-label="Aktionen"` | `InvoicePayments.tsx:169` | **VISIBLE HARDCODED** |
| `BACKEND_ERROR_MAP` keyed on German backend strings | `invoicePayments.mapper.ts` | **MACHINE COUPLING** (pre-existing; do not worsen) |
| `invoicePayment.action.correct` / `void` keys exist | dictionary | **UNWIRED** (no UI actions — do not add in P252) |
| Scanner findings on Payments paths | inventory | **0** |

---

## PART C — Financial / payment / mutation freeze

### C.1 Money fields

| Field | Source | Unit | Calc owner | May localize display? |
|-------|--------|------|------------|----------------------|
| `payment.amountCents` | API | cents | none | YES (formatter only) |
| `invoice.paidCents` | invoice | cents | backend | YES |
| `invoice.outstandingCents` | invoice | cents | backend | YES |
| `invoice.totalCents` | invoice | cents | backend | NO (P252 scope) |
| Summary paid/outstanding | `buildPaymentSummary` | cents + formatted | reads invoice fields | YES (format only) |

**Aggregation formulas (frozen):**
- `paidCents` / `outstandingCents` — read from `invoice` object, not recomputed in Payments UI
- `parseAmountInputToCents` — `Math.round(value * 100)` (unchanged)
- `outstandingAmountInputValue` — `(cents/100).toFixed(2)` (unchanged)
- `sortPaymentsNewestFirst` — `new Date(b.paidAt) - new Date(a.paidAt)` (unchanged)

### C.2 Currency strategy

- Source: `invoice.currency || 'EUR'`
- Formatter: `formatInvoiceListAmount(locale, cents, currency)` via `formatAmount` when locale threaded
- **Currency code must never change with locale**

### C.3 Refund semantics

**Not implemented** in current Invoice Payments UI. Keys `invoicePayment.action.correct` / `void` exist in dictionary but have **no production call sites**. P252 must not introduce refund flows.

### C.4 Record-payment mutation contract

| Step | Owner | Contract |
|------|-------|----------|
| Open dialog | `useInvoicePayments.openRecordDialog` | Gate: `recordGate.allowed`; resets form |
| Default amount | `outstandingAmountInputValue(outstandingCents)` | Decimal string, not localized |
| Default method | `'BANK_TRANSFER'` | Machine code |
| Default date | `defaultPaymentDateValue()` | `YYYY-MM-DD` local calendar |
| Validation | `validateRecordPaymentForm` | Uses `t()` for messages; cents/method rules frozen |
| Payload | `buildRecordPaymentPayload` | `{ amountCents, method, paidAt?: ISO, reference?, note? }` |
| Endpoint | `api.invoices.recordPayment(orgId, invoiceId, payload)` | unchanged |
| Success | `onUpdate(updated)` + toast `invoicePayment.success.recorded` | unchanged |
| Error | `parseRecordPaymentError(message, t, currency)` | maps known German backend strings |

**Payload freeze fixtures:**
- `amountCents: 4200` from input `"42,00"`
- `method: "CARD"` (machine code, not label)
- `paidAt: "2026-07-10T12:00:00.000Z"` from date `2026-07-10`
- `reference: "PAY-X7-00421"` raw
- `note: "Sondertext X7"` raw

### C.5 Permission / visibility matrix

| Control | Predicate source | Frozen |
|---------|------------------|--------|
| Record button | `detail.actions.record_payment` from `invoiceDetail.mapper` (P250 frozen) | YES |
| Record gate | `canFinance && canRecordPayment(status) && outstanding > 0` | YES |
| Payment rows | Always shown when payments exist | YES |
| Detail dialog | Opens on payment ID selection | YES |

### C.6 Payment action matrix

| Action | Callback | Mutation | Permission |
|--------|----------|----------|------------|
| Record payment | `onOpenRecordDialog` → `openRecordDialog` | opens dialog | `recordGate` |
| Submit record | `onSubmitRecord` → `submitRecord` | `recordInvoicePayment` API | `recordGate` + validation |
| View details | `onDetailPaymentIdChange(id)` | none | none |
| Close detail | `onOpenChange(false)` | none | none |

No refund, void, correct, retry, receipt download, or copy-transaction-ID actions in current UI.

### C.7 Provider raw-data boundary

- `statusLabel` from API → display raw (mapper prefers over kind key)
- `createdByName` → display raw
- `reference`, `note` → display raw
- Backend error messages → `parseRecordPaymentError` may pass through unknown trimmed text
- **Do not translate** arbitrary provider/backend strings

### C.8 Fixed-locale audit (Payments paths)

| Finding | File | Classification |
|---------|------|----------------|
| `formatPaymentAmount`/`formatPaymentRowDate` without locale | mapper | **PRESENTATION-ONLY** (fix in P252) |
| `buildPaymentSummary` formatted strings without locale | mapper | **PRESENTATION-ONLY** |
| `aria-label="Aktionen"` | InvoicePayments.tsx | **PRESENTATION-ONLY** |
| `BACKEND_ERROR_MAP` German keys | mapper | **BUSINESS-SEMANTIC** (pre-existing coupling; freeze, do not extend) |
| `paymentStatusTone` by `statusKind` | components | **MACHINE** (frozen) |

### C.9 Formatter reuse strategy

**EXTEND EXISTING:** `formatInvoiceListAmount` / `formatInvoiceListDate` from `invoice-list-i18n.ts` (P214), same pattern as P250 Header (`rentalInvoiceDetailHeaderFormatAmount`).

Thread `locale` through:
- `formatPaymentAmount(amountCents, currency, locale)`
- `formatPaymentRowDate(iso, locale)`
- `buildPaymentSummary(invoice, t, locale)` or derive locale from `t` context

---

## PART D — Key / reuse / split analysis

### D.1 Key reuse audit

| Concept | Strategy |
|---------|----------|
| Section title, columns, actions, dialog, errors, success | **EXACT REUSE** — 43 existing `invoicePayment.*` keys |
| Payment methods | **EXACT REUSE** — `invoicePayment.method.*` |
| Payment statuses | **EXACT REUSE** — `invoicePayment.status.*` |
| Money formatting | **SEMANTIC REUSE** — `formatInvoiceListAmount` |
| Date formatting | **SEMANTIC REUSE** — `formatInvoiceListDate` |
| Table actions aria | **NEW P252 KEY** (1) — e.g. `invoicePayment.col.actions` or `common.actions` if exact match |
| Record gate reasons | **FROZEN P250** — `rental.invoice.detail.header.gate.*` via `record_payment` gate |

### D.2 Key budget estimate

| Category | New keys | Reused |
|----------|----------|--------|
| Section/chrome | 0 | ~15 |
| Status/method | 0 | ~8 |
| Dialog/form/errors | 0 | ~18 |
| A11y (actions column) | **1** | 0–1 (`common.actions` candidate) |
| **Total** | **1–2** | **~43** |

**Verdict:** Well within ≤25 gate.

### D.3 Split analysis

**ONE SLICE — PAYMENTS**

Rationale:
- All four components share one mapper and one hook
- Record dialog is tightly coupled to section (controlled state)
- No refund sub-flow exists
- Splitting Record Payment would duplicate hook/mapper contracts

### D.4 Financial risk score (0–5)

| Path | Money | Calc | Mutation | Refund | Provider |
|------|-------|------|----------|--------|----------|
| `InvoicePayments.tsx` | 2 | 1 | 1 | 0 | 1 |
| `invoicePayments.mapper.ts` | 3 | 2 | 3 | 0 | 2 |
| `RecordPaymentDialog.tsx` | 2 | 0 | 2 | 0 | 0 |
| `InvoicePaymentDetailDialog.tsx` | 2 | 0 | 0 | 0 | 2 |
| `useInvoicePayments.ts` | 2 | 1 | 4 | 0 | 1 |

**Safely localizable:** presentation wrappers + locale threading. **High-risk (touch carefully):** `buildRecordPaymentPayload`, `parseAmountInputToCents`, `validateRecordPaymentForm`, `parseRecordPaymentError`, `sortPaymentsNewestFirst`.

---

## PART E — P252 selection

### E.1 Target decision

**P2.2.52 — Rental Invoice Payments Localization (Production Hardening)**

### E.2 Exact P252 production boundary

| Path | Presentation responsibility | Must not change |
|------|----------------------------|-----------------|
| `InvoicePayments.tsx` | Thread locale to formatters; fix aria-label | layout, gates, callbacks |
| `InvoicePaymentDetailDialog.tsx` | Thread locale to formatters | payment raw fields |
| `RecordPaymentDialog.tsx` | Thread locale to amount hint formatter | form state, payload |
| `invoicePayments.mapper.ts` | Add locale param to format/summary helpers | payload, validation math, sort, error map keys |
| `rental-invoice-payments-i18n.ts` (**NEW**) | Locale resolve + thin formatter delegates | all business logic |
| `InvoiceDetail.tsx` | **NO CHANGE** unless mechanical locale pass-through required | — |
| `hooks/useInvoicePayments.ts` | Pass locale to mapper formatters only | mutation flow |

### E.3 Adapter strategy

**NEW BOUNDED PAYMENT PRESENTATION ADAPTER** (`rental-invoice-payments-i18n.ts`)

Owns: locale resolution, delegated money/date formatting, optional a11y key helper.
Must not own: financial math, payment state, refund eligibility, mutation payload, permissions, sorting.

### E.4 Extraction strategy

**KEEP EXISTING COMPONENTS** + **PRESENTATION CONFIG ONLY** (locale threading into existing mapper functions).

### E.5 P252_ENFORCE_CLEAN_EXACT (future)

```
rental/components/invoices/InvoicePayments.tsx
rental/components/invoices/InvoicePaymentDetailDialog.tsx
rental/components/invoices/RecordPaymentDialog.tsx
rental/components/invoices/invoicePayments.mapper.ts
rental/lib/rental-invoice-payments-i18n.ts
```

Exclude: P251 Relations, P250 Header, P249 Secondary, Documents, Line Items, Create/Send, Tenant Billing, `invoiceDetail.mapper.ts`, `useInvoicePayments.ts` mutation logic (unless mechanical locale-only one-liner).

### E.6 Future test contracts

- Same-mount DE↔EN: payment IDs, `amountCents`, `method` codes, `reference`, `note`, `statusKind`, order, record-gate state, form draft, callbacks preserved
- Money regression: `5000` cents stays `5000`; formatting may change display only
- Record-payment draft: unsaved amount/method/date/note survive locale switch
- P251/P250/P249 negative: zero diff outside boundary

### E.7 Category E feasibility

**FEASIBLE** — presentation-only changes with strict mapper hunk classification (A/B/C only).

---

## PART F — Rental / global progress

### F.1 Rental residual inventory (post-P251)

| Area | Scanner findings | Hidden debt | Notes |
|------|-----------------|-------------|-------|
| Invoice Payments | **0** | ~5–8 (fixed-locale formatters + aria) | **P252 target** |
| Invoice Line Items | **0** | ~similar fixed-locale pattern | P253 candidate |
| Invoice Documents | **0** | deferred / partial | later slice |
| Tenant Billing | **74** | high | separate campaign surface |
| Damages | **91** | medium | |
| Users & Roles | **67** | medium | |
| Data Analyse | **32** | medium | |
| Other rental | **92** | varies | |

**Rental scanner total:** 356 (unchanged post-P251)

### F.2 Top-5 Rental ranking (post-P251)

| Rank | Target | Score rationale |
|------|--------|-----------------|
| 1 | **Invoice Payments (P252)** | Campaign continuity, bounded 4-file surface, keys exist, high leverage on Invoice Detail completion |
| 2 | Invoice Line Items | Same invoice detail, 0 scanner, fixed-locale debt |
| 3 | Tenant Billing | High debt (74) but low boundedness, financial coupling |
| 4 | Invoice Documents | Deferred complexity (email/PDF gates) |
| 5 | Damages | Large debt, lower invoice-campaign leverage |

### F.3 Global i18n completion (methodology)

**Methodology (aligned with P251 preflight #1343):**
- Denominator: global hardcoded-copy inventory trajectory + estimated hidden debt outside scanner
- Numerator: closed enforce-clean slices (P216–P251) + hidden string closures
- **Not** dictionary key count

| Metric | Value |
|--------|-------|
| Scanner findings (now) | **1453** (unchanged — P251 Relations had 0 scanner entries) |
| P251 hidden closure | **~18** Relations strings |
| Remaining global actionable (inventory) | **1453** |
| Remaining hidden (invoice payments) | **~5–8** |

**Completion estimate:**
- **Conservative:** 83%
- **Central:** 84%
- **Optimistic:** 85%
- **Confidence:** MEDIUM-HIGH

**Progress delta vs pre-P251 ~83–85%:** +0 to +0.2pp from ~18 hidden Relations closures; scanner inventory unchanged so no large jump.

### F.4 Projected Rental slices

| Slice | Status |
|-------|--------|
| P252 Payments hardening | Next |
| P253 Line Items hardening | Likely |
| P254+ Documents / Create-Send residuals | TBD |
| Tenant Billing | Separate major slice (74+ findings) |

### F.5 Active collision

| Class | Result |
|-------|--------|
| Open PRs on exact Payments paths | **NONE** |
| #1339 / #1344 main drift on Payments files | **NONE** (13-line unrelated import drift on mapper vs main only) |
| Stale billing/master PRs | LOW (different surfaces) |

**Verdict:** **NONE** / **LOW** — no HIGH/DIRECT blocker.

### F.6 Baseline strategy

**DIRECT FROM P251 MERGE BASELINE** (`f4ff2e8b2`)

### F.7 P253 forecast

**P2.2.53 — Rental Invoice Line Items Localization (production hardening)** — same fixed-locale formatter pattern as Payments; `InvoiceLineItems.tsx` + `invoiceLineItems.mapper.ts`.

---

## Final pre-flight verdict

**A — GO — P2.2.52 RENTAL INVOICE PAYMENTS SELECTED**

P2.2.52: Rental Invoice Payments Localization (production hardening — locale-threaded formatters, enforce-clean, same-mount tests)

CAMPAIGN: RENTAL

P251 STATUS: FROZEN

GLOBAL I18N COMPLETION: 83% – 85% (Central estimate: 84%)

REMAINING ACTIONABLE DEBT: 1453 (scanner inventory)

IMPLEMENTATION NOT STARTED.
