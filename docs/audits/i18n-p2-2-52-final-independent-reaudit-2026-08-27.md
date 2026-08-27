# P2.2.52 — Final Independent Re-Audit

**Date:** 2026-08-27  
**Mode:** STRICT READ-ONLY INDEPENDENT VERIFICATION  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Implementation PR:** [#1351](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1351)  
**Authoritative baseline:** `f4ff2e8b22ede182a57433076a0e0c03f504dd78` (post-P251 merge)  
**Implementation HEAD:** `9ee3829cbf8405d6ef1ee1695cc05415eee77f9d`  
**Auditor branch:** `cursor/p2252-final-independent-reaudit-3c10`  
**Pre-flight reference:** PR #1348 (read-only; not in implementation ancestry)

---

## 1. Provenance hard gate

| Check | Independent result |
|-------|-------------------|
| PR #1351 state | OPEN |
| PR #1351 draft | true |
| PR #1351 merged | false (`mergedAt: null`) |
| PR #1351 mergeable | MERGEABLE |
| Base OID | `f4ff2e8b22ede182a57433076a0e0c03f504dd78` ✅ |
| Head OID | `9ee3829cbf8405d6ef1ee1695cc05415eee77f9d` ✅ |
| Implementation commit count (`baseline..HEAD`) | **1** (`9ee3829cb`) ✅ |
| `merge-base(baseline, HEAD)` | `f4ff2e8b` (= baseline) ✅ |
| `baseline` ancestor of HEAD | ✅ |
| Ancestry from PR #1348 preflight | ❌ not ancestor (`exit:1`) ✅ |
| Ancestry from PR #1347 vehicle cross-surface | ❌ not in lineage ✅ |
| Ancestry from PR #1349 connectivity audit | ❌ not in lineage ✅ |
| Ancestry from PR #1350 vehicle detail (merged on main) | ❌ not in lineage ✅ |
| `local HEAD == origin/head` | ✅ both `9ee3829cb` |

**Provenance verdict:** ✅ **PASS**

---

## 2. Complete diff forensics

**12 paths changed** (`f4ff2e8b..9ee3829cb`):

| Path | Classification | Notes |
|------|:--:|-------|
| `frontend/src/rental/lib/rental-invoice-payments-i18n.ts` | **D** | New bounded presentation adapter |
| `frontend/src/rental/components/invoices/invoicePayments.mapper.ts` | **B** | Locale param on money/date formatters only |
| `frontend/src/rental/components/invoices/InvoicePayments.tsx` | **A** | Locale threading + `common.actions` aria |
| `frontend/src/rental/components/invoices/InvoicePaymentDetailDialog.tsx` | **A** | Locale-threaded money/date display |
| `frontend/src/rental/components/invoices/RecordPaymentDialog.tsx` | **A** | Locale-threaded outstanding hint |
| `frontend/src/rental/components/rental-invoice-payments-localization.test.tsx` | **F** | 6 focused P252 tests |
| `frontend/src/i18n/hardcoded-copy-guard.test.ts` | **E** | P252 enforce-clean guard |
| `frontend/src/i18n/hardcoded-copy-inventory.json` | **E** | Scanner inventory refresh |
| `architecture/I18N_RENTAL_INVOICE_PAYMENTS_P2_2_52_2026-08-27.md` | **H** | Architecture bookkeeping |
| `docs/audits/i18n-p2-2-52-rental-invoice-payments-implementation-2026-08-27.md` | **G** | Implementation evidence |
| `frontend/src/master/components/ArchitekturView.tsx` | **H** | Bookkeeping entry |
| `frontend/src/master/components/ChangesView.tsx` | **H** | Bookkeeping entry |

**Forbidden categories:** I/J/K/L/M/N/O = **0** ✅

---

## 3. Production boundary

| Path | Baseline responsibility | Changed responsibility | Presentation | Business | Safe? |
|------|------------------------|------------------------|:--:|:--:|:--:|
| `InvoicePayments.tsx` | List/summary UI, sort display, record gate visibility | +`locale` threading; `aria-label={t('common.actions')}` | ✅ | unchanged | ✅ |
| `InvoicePaymentDetailDialog.tsx` | Read-only payment detail | +`locale` on amount/date formatters | ✅ | unchanged | ✅ |
| `RecordPaymentDialog.tsx` | Record form UI (controlled props) | +`locale` on outstanding hint | ✅ | unchanged | ✅ |
| `invoicePayments.mapper.ts` | Domain labels, sort, parse, validate, payload, errors | +optional `locale` on `buildPaymentSummary` / format helpers | ✅ | unchanged | ✅ |
| `rental-invoice-payments-i18n.ts` | — (new) | Locale resolution + delegate to `formatInvoiceListAmount/Date` | ✅ | none | ✅ |
| `useInvoicePayments.ts` | Mutation hook | **not changed** | — | — | ✅ |

---

## 4. P251 / P250 / P249 hard freeze

Independent `git diff f4ff2e8b..9ee3829cb` on frozen surfaces:

| Surface | Diff lines | Certification |
|---------|:----------:|:-------------:|
| P251 Relations (`InvoiceRelations.tsx`, `invoiceRelations.mapper.ts`, `rental-invoice-relations-i18n.ts`, `InvoiceDetail.tsx` relations wiring) | 0 | ✅ PASS |
| P250 Header (`InvoiceHeader.tsx`, `InvoiceDetailHeader.tsx`, `invoiceDetail.mapper.ts` header paths) | 0 | ✅ PASS |
| P249 Secondary (`InvoiceDetail` secondary chrome) | 0 | ✅ PASS |
| Documents (`InvoiceDocuments.tsx`) | 0 | ✅ PASS |
| Line Items (`InvoiceLineItems.tsx`, `invoiceLineItems.mapper.ts`) | 0 | ✅ PASS |
| Create/Send invoice dialogs | 0 | ✅ PASS |
| Tenant Billing surfaces | 0 | ✅ PASS |

---

## 5. Payment domain inventory

| Field | Present | Raw preserved | Notes |
|-------|:-------:|:-------------:|-------|
| `payment.id` | ✅ | ✅ | React `key={payment.id}` unchanged |
| `invoice.id` | ✅ | ✅ | Via parent props; unchanged |
| `amountCents` | ✅ | ✅ | Integer cents unchanged |
| `currency` | ✅ | ✅ | `invoice.currency \|\| 'EUR'` |
| `statusKind` | ✅ | ✅ | `recorded` \| `provider_confirmed` |
| `statusLabel` | ✅ | ✅ | Raw API override when present |
| `method` | ✅ | ✅ | Machine codes unchanged |
| `paidAt` | ✅ | ✅ | ISO timestamps unchanged |
| `createdAt` | ✅ | ✅ | Not displayed on payments surface |
| `reference` | ✅ | ✅ | Raw passthrough |
| `note` | ✅ | ✅ | Raw passthrough |
| `createdByName` | ✅ | ✅ | Raw passthrough |
| `isProviderBacked` | ✅ | ✅ | Drives system label fallback only |
| `createdByUserId` | type only | — | Not surfaced in UI |

---

## 6. Payment status machine

| Machine ID | Source | Business use | Baseline label | Implementation label | Tone | Icon |
|------------|--------|--------------|----------------|---------------------|------|------|
| `recorded` | `statusKind` | Manual/offline payment | `t('invoicePayment.status.recorded')` | same | `paymentStatusTone` → default | StatusChip dot |
| `provider_confirmed` | `statusKind` | Provider-backed payment | `t('invoicePayment.status.provider_confirmed')` | same | `paymentStatusTone` → success | StatusChip dot |
| *(raw)* | `statusLabel` API | Provider override | `payment.statusLabel` verbatim | same | tone from `statusKind` | same |

`paymentStatusTone` function: **unchanged** (grep confirms no diff hunks).

**Status machine verdict:** ✅ **PASS** — same IDs, meaning, tone, icon.

---

## 7. Status raw override gate

`invoicePaymentStatusLabel`:

```ts
if (payment.statusLabel?.trim()) return payment.statusLabel;
```

**Unchanged.** Fixture `PAYMENT_PROVIDER_ERROR_X7` passes through raw in EN and DE. ✅

---

## 8. Payment method machine

Repository truth (`invoicePaymentTypes.ts`):

| Code | In `INVOICE_PAYMENT_METHOD_CODES` (record select) | Payload | Changed? |
|------|:--:|:--:|:--:|
| `BANK_TRANSFER` | ✅ | ✅ | ❌ |
| `CASH` | ✅ | ✅ | ❌ |
| `CARD` | ✅ | ✅ | ❌ |
| `STRIPE` | ✅ | ✅ | ❌ |
| `DIRECT_DEBIT` | label map only | — | ❌ |
| `OTHER` | fallback label | — | ❌ |

Record select omits `DIRECT_DEBIT` (baseline behavior preserved).

---

## 9. Method label reuse

`METHOD_I18N` → `invoicePayment.method.*` (6 codes). No parallel namespace. No P252 duplicate keys. ✅

---

## 10. Money raw inventory

| Value | Raw integer preserved | Display localized |
|-------|:--------------------:|:---------------:|
| `payment.amountCents` | ✅ | ✅ via adapter |
| `invoice.paidCents` | ✅ | ✅ |
| `invoice.outstandingCents` | ✅ | ✅ |
| `invoice.currency` | ✅ | display only |

---

## 11. Financial calculation hard gate

**FINANCIAL CALCULATION DIFF = ZERO**

- `paidCents` / `outstandingCents` / `totalCents`: sourced from invoice object; no derivation logic touched
- Payment aggregation: none in frontend (backend-sourced)
- Fees/refunds: not present
- Currency source: `invoice.currency || 'EUR'` unchanged

---

## 12. `parseAmountInputToCents` gate

Baseline vs implementation: **identical function body** (only import relocation in file). Verified:

- comma/dot → `.` normalization ✅
- empty → `null` ✅
- `NaN` / `<= 0` → `null` ✅
- `Math.round(value * 100)` ✅
- Test: `'42,00'` → `4200` ✅

---

## 13. Outstanding default input gate

`outstandingAmountInputValue`: **unchanged**

```ts
return (outstandingCents / 100).toFixed(2);  // e.g. 6900 → '69.00'
```

No locale-aware formatting applied to form draft default. ✅

---

## 14. Currency hard freeze

Same raw source, same `'EUR'` fallback, same payload `currency` prop threading. Locale affects display only. ✅

---

## 15. Money formatter audit (`rental-invoice-payments-i18n.ts`)

| Export | Classification |
|--------|---------------|
| `resolveRentalInvoicePaymentsLocale` | LOCALE RESOLUTION |
| `formatRentalInvoicePaymentAmount` | MONEY PRESENTATION → `formatInvoiceListAmount` |
| `formatRentalInvoicePaymentDate` | DATE PRESENTATION → `formatInvoiceListDate` |

No cents conversion, rounding, currency derivation, aggregation, or business logic. ✅

---

## 16. Date raw hard freeze

`paidAt` ISO strings unchanged. Sort uses `new Date(b.paidAt).getTime()` — unchanged. ✅

---

## 17. Date formatter audit

Only `formatPaymentRowDate(iso, locale)` and detail/list display paths localized. No date predicate changes. ✅

---

## 18. Payment order hard gate

`sortPaymentsNewestFirst`: **byte-identical** (verified via diff). Test order `['pay-newer', 'pay-older']` preserved across locales. ✅

---

## 19–22. Record payment mutation trace & payload

Flow unchanged:

1. `onOpenRecordDialog` → `recordDialogOpen=true`
2. Form state in parent (`useInvoicePayments` — **unchanged**)
3. `validateRecordPaymentForm` → same predicates
4. `buildRecordPaymentPayload` → same structure
5. `recordInvoicePayment(orgId, invoice.id, payload)` via `invoicePayments.api.ts` — **unchanged**
6. Success toast / refresh — **unchanged**

**Fixture payload (independent test):**

```json
{
  "amountCents": 4200,
  "method": "CARD",
  "paidAt": "2026-07-10T12:00:00.000Z",
  "reference": "PAY-X7-00421",
  "note": "Sondertext X7"
}
```

Endpoint: `api.invoices.recordPayment(orgId, invoiceId, payload)` — unchanged. ✅

---

## 23. Validation hard gate

`validateRecordPaymentForm` predicates: **unchanged** (no diff hunks). ✅

---

## 24–25. Backend error map & unknown passthrough

`BACKEND_ERROR_MAP`: same 4 German keys, same matching semantics, same fallbacks.  
`PAYMENT_PROVIDER_ERROR_X7`: raw passthrough via `if (trimmed) return trimmed`. ✅

---

## 26. Provider raw data hard freeze

`statusLabel`, `createdByName`, `reference`, `note`, `STRIPE-PI-X7-729` — all raw, not translated. ✅

---

## 27. Refund / void / correct negative certification

| Action | Added? |
|--------|:------:|
| Refund | ❌ NO |
| Void payment | ❌ NO |
| Correct payment | ❌ NO |
| Retry | ❌ NO |
| Receipt | ❌ NO (not in baseline) |

Dictionary keys `invoicePayment.action.correct` / `void` exist but remain unwired. ✅

---

## 28–30. Record gate, permissions, visibility

- Gate source: `detail.actions.record_payment` in `invoiceDetail.mapper.ts` — **0 diff**
- `useInvoicePayments` permission/gate usage — **unchanged**
- Record button, row visibility, dialog open, submit disabled/loading predicates — **unchanged** ✅

---

## 31–32. Callback matrix & dialog state

| Action | Baseline | Implementation |
|--------|----------|----------------|
| Open record | `onOpenRecordDialog` | same |
| Submit record | `onSubmitRecord` | same |
| Cancel/close record | `onRecordDialogOpenChange` | same |
| Open detail | `onDetailPaymentIdChange(id)` | same |
| Close detail | `onDetailPaymentIdChange(null)` | same |

State ownership: parent-controlled `recordDialogOpen`, `detailPaymentId`, form fields, `recording` — unchanged. ✅

---

## 33–35. Same-mount gates

| Gate | Result |
|------|--------|
| Record draft DE↔EN | ✅ dialog open; amount `42,00`; method `CARD`; date `2026-07-10`; no reset/autosubmit |
| Detail dialog locale switch | ✅ same payment ID; `STRIPE-PI-X7-729` raw; title DE/EN localized |
| Payment list locale switch | ✅ same IDs, order, raw refs/errors |

Focused test file: **6/6 PASS**

---

## 36. React identity audit

Search `key={locale}`, `key={t(`, `key={localizedStatus}`, `key={localizedMethod}` in invoice payment components: **0 matches** ✅

---

## 37–40. Deep component/mapper audits

### `InvoicePayments.tsx` (13+/7- lines)

| Hunk type | Count |
|-----------|:-----:|
| PRESENTATION (locale threading) | all |
| ARIA (`common.actions`) | 1 |
| LOCALE THREADING | 6 |
| GATE / CALLBACK / ORDER / BUSINESS | 0 |

### `InvoicePaymentDetailDialog.tsx`

Presentation-only money/date locale. No raw field transformation. ✅

### `RecordPaymentDialog.tsx`

Presentation-only outstanding hint. Form machine values unchanged. ✅

### `invoicePayments.mapper.ts`

| Category | Semantic change |
|----------|:---------------:|
| A money presentation | locale param only |
| B date presentation | locale param only |
| C status/method presentation | 0 |
| D raw projection | 0 |
| E sorting | 0 |
| F validation | 0 |
| G parsing | 0 |
| H payload | 0 |
| I backend errors | 0 |
| J gate/business | 0 |

---

## 41. `useInvoicePayments.ts` boundary

**Not changed** (`git diff` = 0 lines). ✅

---

## 42–43. Adapter audit & verdict

All exports classified as LOCALE RESOLUTION / MONEY PRESENTATION / DATE PRESENTATION only.

**Adapter verdict:** ✅ **CANONICAL**

---

## 44–45. Key reuse & new key count

| Metric | Value |
|--------|------:|
| `invoicePayment.*` keys in EN/DE registry | 43 each |
| New keys introduced by P252 | **0** |
| Dictionary diff (`en.ts` / `de.ts`) | 0 lines |
| Parallel namespace | none |

Keys touched on surface (all pre-existing): section/summary/col/action/dialog/detail/error/method/status/recordedBy + `common.actions`.

---

## 46. `common.actions` reuse

| Locale | Value | Prior hardcoded | Verdict |
|--------|-------|-----------------|---------|
| EN | `Actions` | `aria-label="Aktionen"` (wrong locale) | **EXACT** semantic fix |
| DE | `Aktionen` | `Aktionen` | **EXACT** |

---

## 47. Dictionary accounting

| Metric | Baseline | Final |
|--------|:--------:|:-----:|
| EN keys | 8799 | 8799 |
| DE keys | 8799 | 8799 |
| New keys | — | 0 |
| Removed keys | — | 0 |
| Changed translations | — | 0 |
| Orphans | 0 | 0 |
| Parity | 100% | 100% |

`npm run i18n:check`: **PASS**

---

## 48–50. Scanner / enforce-clean

| Scope | Findings |
|-------|:--------:|
| P252 exact paths (5) | **0** |
| P251 | **0** |
| P250 | **0** |
| P249 | **0** |
| P214 | **0** |
| Global actionable (guard suite) | **0** |

No ignore/allowlist/weakening added for P252 paths. ✅

---

## 51–52. Raw leakage

| Check | Count |
|-------|:-----:|
| Raw i18n key leakage (scanner) | 0 |
| Raw method/status codes in UI where labels exist | 0 |
| Intentional raw provider strings | preserved |

---

## 53. Category E (governance)

Production hunks: financial/payment/mutation/validation/permission/provider semantic modifications = **0**.  
Governance changes limited to P252 enforce-clean guard + inventory refresh. ✅

---

## 54. Focused test quality

`rental-invoice-payments-localization.test.tsx` covers:

- P252 scanner zero
- DE/EN money/date formatting + raw cents
- Sort order + raw fields
- Payload fixture
- Same-mount list/detail/record draft
- Provider error raw passthrough

**Grade:** ✅ **STRONG**

---

## 55. Test execution (independent)

| Suite | Result |
|-------|--------|
| P252 focused (`rental-invoice-payments-localization.test.tsx`) | **6/6 PASS** |
| Mapper regressions (`invoicePayments.mapper.test.ts`) | **7/7 PASS** |
| Integration (`useInvoicePayments.integration.test.ts`) | **1/1 PASS** |
| Payment bundle (above + hardcoded-copy-guard) | **138/138 PASS** |
| P251 regression | **6/6 PASS** |
| P250 regression | **17/17 PASS** |
| P249 regression | **11/11 PASS** |
| hardcoded-copy-guard (124 tests) | **124/124 PASS** |
| `npm run i18n:check` | **PASS** |
| `npm run check:surface` | **PASS** |
| `npm run build` | **PASS** (16.85s) |
| `git diff --check baseline..HEAD` | **PASS** |

**Note:** Full `src/rental/components/invoices/` directory run shows 13 pre-existing failures in unrelated invoice tests (timeline loading copy); not attributable to P252 paths.

**CI (PR #1351):** Frontend component tests PASS; Production build PASS; unrelated failures on Vehicle Detail typecheck / some backend unit runs — **not P252-caused**.

---

## 56. Active collision

| PR | Overlap with P252 paths |
|----|------------------------|
| #1350 Vehicle Detail connectivity | NONE (vehicle-detail only; merged on main) |
| #1347 Vehicle cross-surface | NONE |
| #1349 Connectivity audit | NONE (docs only) |
| #1348 Payments preflight | NONE (audit-only branch; not merged) |

**Collision classification:** ✅ **NONE**

---

## 57. Current main drift

P252 production paths differ between implementation HEAD and `origin/main` (expected — rental campaign branches from `p239-p238-merge-baseline-3c10`, not main). Drift is **campaign baseline divergence**, not concurrent Payments edits.

**Main drift classification:** ✅ **LOW** (unrelated vehicle/main work)

---

## 58. Claim reconciliation

| Claim | Implementation claim | Independent result | PASS/FAIL |
|-------|---------------------|-------------------|:---------:|
| 1 commit | 1 | 1 (`9ee3829cb`) | ✅ |
| Direct P251 baseline ancestry | yes | merge-base = baseline | ✅ |
| No #1348 ancestry | yes | not ancestor | ✅ |
| Payments-only scope | yes | 5 prod files + adapter | ✅ |
| 0 new dictionary keys | 0 | 0 (diff verified) | ✅ |
| 43 reused `invoicePayment.*` | 43 | 43 in registry | ✅ |
| `common.actions` reuse | yes | EXACT | ✅ |
| Money locale hardening | yes | adapter delegates canonical | ✅ |
| Date locale hardening | yes | adapter delegates canonical | ✅ |
| `parseAmountInputToCents` unchanged | yes | byte-identical | ✅ |
| Outstanding default unchanged | yes | byte-identical | ✅ |
| Currency unchanged | yes | same source/fallback | ✅ |
| Sorting unchanged | yes | byte-identical | ✅ |
| Status machine unchanged | yes | same IDs/labels/tone | ✅ |
| Method machine unchanged | yes | same codes/payload | ✅ |
| Payload unchanged | yes | fixture match | ✅ |
| Validation unchanged | yes | no diff | ✅ |
| Backend error matching unchanged | yes | same map | ✅ |
| Provider text raw | yes | fixture PASS | ✅ |
| Record gate unchanged | yes | 0 diff on mapper | ✅ |
| No refund/void/correct | yes | confirmed | ✅ |
| Same-mount gates | yes | 6 tests PASS | ✅ |
| P252 enforce-clean = 0 | 0 | 0 | ✅ |
| Category E = 0 | 0 | 0 | ✅ |
| EN/DE 8799/8799 | 8799/8799 | verified | ✅ |
| Tests | 6+182 PASS | 138 payment bundle PASS | ✅ |
| Build | PASS | PASS | ✅ |
| Collision | NONE | NONE | ✅ |
| P253 forecast | Line Items next | paths confirmed | ✅ |

---

## 59. Correction threshold

No blocking violations detected.

---

## 60. Smallest correction set

**Not applicable** — no corrections required.

---

## 61. Progress update

| Metric | Prior (P251) | Post-P252 |
|--------|:------------:|:---------:|
| Rental invoice detail slices closed | Relations | +Payments |
| P252 scanner debt | ~5–8 estimated hidden | **0** |
| Global actionable debt | low | unchanged |
| Conservative completion | 83% | **~84%** |
| Central estimate | 84% | **~85%** |
| Optimistic completion | 85% | **~86%** |
| Confidence | medium-high | **high** |

Payments slice was hardening (not greenfield); denominator shift is modest (~1% campaign band).

---

## 62. P253 forecast

**Next:** P2.2.53 — Rental Invoice Line Items Localization / Production Hardening

Likely paths:

- `frontend/src/rental/components/invoices/InvoiceLineItems.tsx`
- `frontend/src/rental/components/invoices/invoiceLineItems.mapper.ts`
- New bounded adapter (e.g. `rental-invoice-line-items-i18n.ts`)
- Focused localization test + P253 enforce-clean guard

**Not implemented** (per audit scope).

---

## 63. Final verdict

# ✅ A — READY FOR P2.2.52 FREEZE / MERGE

All hard gates pass. Implementation is a single safe commit with bounded Payments-only presentation hardening, zero financial/mutation semantic drift, frozen P251/P250/P249 surfaces intact, 0 new dictionary keys, canonical adapter, enforce-clean at zero, and strong same-mount test coverage.

**PR #1351 may be marked ready and merged.**

**RENTAL CAMPAIGN STATUS: CONTINUES.**

**NEXT CANDIDATE:**  
P2.2.53 — Rental Invoice Line Items Localization / Production Hardening

---

*Audit artifact only. No production, dictionary, test, scanner, or architecture changes in this commit.*
