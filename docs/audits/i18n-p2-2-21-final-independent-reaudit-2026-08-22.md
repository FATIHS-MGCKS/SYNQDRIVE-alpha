# P2.2.21 — Final Independent Re-Audit

**Date:** 2026-08-22  
**Mode:** STRICT READ-ONLY INDEPENDENT VERIFICATION  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Target:** PR [#1167](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1167) — P2.2.21 Rental Create Invoice Dialog Localization  
**Authoritative baseline:** `6413a3dd68dce6b9d0db6346a2ae9245821d22fb`  
**Expected implementation HEAD:** `5bcc1088160597d3ca60108cc0bdc2cfd3f0e6a4`  
**Auditor workspace HEAD:** `5bcc1088160597d3ca60108cc0bdc2cfd3f0e6a4`  
**Pre-flight reference:** PR #1166 (audit-only; **not** implementation baseline)

---

## 1. Provenance — HARD GATE

| Check | Independent result |
|-------|-------------------|
| PR #1167 exists | ✅ #1167 |
| `state` | `OPEN` |
| `isDraft` | `true` |
| merged | `false` |
| `mergeable` | `MERGEABLE` |
| Base branch | `cursor/p227b-voice-telephony-test-center-preflight-3c10` |
| Base SHA | `6413a3dd68dce6b9d0db6346a2ae9245821d22fb` ✅ |
| Head branch | `cursor/p2221-rental-create-invoice-dialog-i18n-3c10` |
| Head SHA | `5bcc1088160597d3ca60108cc0bdc2cfd3f0e6a4` ✅ |
| Commits after baseline | **1** (`5bcc1088 feat(i18n): P2.2.21 localize Rental Create Invoice Dialog`) |
| Audit-only contamination on #1167 | ✅ none |
| Communication Center contamination | ✅ none |
| Master Admin production contamination | ✅ none (only `ChangesView` / `ArchitekturView` bookkeeping) |
| Unrelated finance refactor | ✅ none |
| `local HEAD == origin/head` | ✅ verified via `git fetch` + `rev-parse` |

**Provenance verdict:** ✅ **PASS**

---

## 2. Complete diff classification

Range: `6413a3dd..5bcc1088` — **14 paths**, **1 commit**.

| Path | Cat | Notes |
|------|:---:|-------|
| `frontend/src/rental/components/invoices/CreateInvoiceDialog.tsx` | A | Presentation wiring |
| `frontend/src/rental/lib/create-invoice-i18n.ts` | B | New presentation adapter |
| `frontend/src/i18n/translations/invoices.create.en.ts` | C | +40 keys |
| `frontend/src/i18n/translations/invoices.create.de.ts` | C | +40 keys |
| `frontend/src/i18n/translations/en.ts` | C | spread import |
| `frontend/src/i18n/translations/de.ts` | C | spread import |
| `frontend/src/rental/components/rental-create-invoice-dialog-localization.test.tsx` | D | Localization tests (13 declared) |
| `frontend/scripts/i18n-hardcoded-scan.mjs` | E | `P221_ENFORCE_CLEAN_EXACT` |
| `frontend/src/i18n/hardcoded-copy-guard.test.ts` | E | P221 guards + source grep |
| `frontend/src/i18n/hardcoded-copy-inventory.json` | E | Inventory refresh |
| `docs/audits/i18n-p2-2-21-rental-create-invoice-dialog-implementation-2026-08-22.md` | F | Implementation evidence |
| `architecture/I18N_RENTAL_CREATE_INVOICE_DIALOG_P2_2_21_2026-08-22.md` | F | Architecture record |
| `frontend/src/master/components/ChangesView.tsx` | G | Changelog bookkeeping |
| `frontend/src/master/components/ArchitekturView.tsx` | G | Architecture bookkeeping |

**Category H = 0** ✅  
**Category I = 0** ✅  
**New compatibility consumers = 0** ✅

---

## 3. Exact production scope

| Path | Role | Baseline presentation debt | Financial coupling | Actual modifications | Why required for P221 |
|------|------|---------------------------|-------------------|---------------------|----------------------|
| `rental/components/invoices/CreateInvoiceDialog.tsx` | Create Invoice UI | ~24 hardcoded DE strings; `formatAmount` fixed `de-DE` | Owns form state, line items, `calcTotals`, `api.invoices.create` payload assembly | `useLanguage()` + `t()` / adapter label helpers; `formatCreateInvoiceAmount(locale,…)`; `CREATE_INVOICE_VAT_RATE` constant | Primary dialog surface |
| `rental/lib/create-invoice-i18n.ts` | Presentation adapter | N/A (new) | Exports machine constants (`TYPE_VALUES`, `TEMPLATE_IDS`, `VAT_RATE=19`); display formatters only | Locale resolution, `TranslationKey` maps, `formatCreateInvoiceAmount` via `getFormattingLocale` | Bounded adapter; keeps machine/API values out of JSX |

---

## 4. Full dialog scope audit

| Presentation area | Baseline | Implementation | In slice? |
|-------------------|----------|----------------|-----------|
| Dialog title/subtitle | Hardcoded DE | `invoices.create.*` keys | ✅ |
| Customer selection | Hardcoded labels; dynamic names | Localized labels; names untouched | ✅ |
| Booking context | Not in dialog | N/A | — |
| Vehicle context | Hardcoded label; dynamic make/model/plate | Localized label; values untouched | ✅ |
| Invoice type | Machine enums + hardcoded DE labels | Machine enums + `invoices.list.type.*` + desc keys | ✅ |
| Template | `INVOICE_TEMPLATES` DE names | Machine IDs + `invoices.create.template.*` | ✅ |
| Invoice number | Not shown at create | N/A | — |
| Issue date | Hardcoded DE | `invoices.create.field.invoiceDate` | ✅ |
| Due date | Hardcoded DE | `invoices.create.field.dueDate` | ✅ |
| Service date | Not in dialog | N/A | — |
| Line items | Hardcoded DE | `invoices.create.lineItems.*` | ✅ |
| Quantity / unit price | Numeric inputs unchanged | Placeholders localized | ✅ |
| Tax/VAT display | Hardcoded `MwSt 19%` pattern | `invoices.create.totals.vat` + rate var | ✅ |
| Subtotal/net/gross | `formatAmount` (de-DE) | `formatCreateInvoiceAmount(locale,…)` | ✅ |
| Notes/description | Hardcoded DE | Localized labels/placeholders | ✅ |
| Validation | Same guards (`title`, `type`, incoming `totalCents`) | Unchanged conditions | ✅ |
| Actions | Hardcoded DE cancel/create | `common.cancel`, `invoices.createInvoice` | ✅ |
| Errors/loading | DE error fallback string | `invoices.create.error.createFailed` | ✅ |
| Tooltips/aria/title | Minimal (`previewAlt` hardcoded) | `invoices.create.image.previewAlt` | ✅ |
| Empty states | Implicit (empty selects) | Unchanged | ✅ |

**Slice boundary verdict:** **KEEP AS ONE SLICE**

---

## 5. Financial machine value inventory

| Machine field | Baseline semantics | Implementation semantics | Changed? |
|---------------|-------------------|-------------------------|----------|
| `customerId` | Selected option value string | Same | NO |
| `bookingId` | Not used | Not used | NO |
| `vehicleId` | Selected option value | Same | NO |
| Invoice type (`form.type`) | `OUTGOING_MANUAL` / `INCOMING_VENDOR` | Same enum strings | NO |
| `templateId` | `standard`/`booking`/`damage`/`extra` | Same IDs via `CREATE_INVOICE_TEMPLATE_IDS` | NO |
| Invoice status | Set by API on create | Unchanged (not in dialog) | NO |
| `taxRate` (payload) | Literal `19` | `CREATE_INVOICE_VAT_RATE` (=19) | NO |
| `quantity` | `Number` per line | Same | NO |
| `unitPriceNetCents` | Cents integer | Same | NO |
| Net amount (display) | Sum of line `totalCents` | Same `calcTotals().subtotalCents` | NO |
| Tax amount (display) | `Math.round(sub * 0.19)` | `Math.round(sub * (19/100))` | NO |
| Gross amount (display) | `sub + tax` | Same | NO |
| `currency` | `'EUR'` default | Same | NO |
| `dueDate` / `invoiceDate` | ISO date input strings `YYYY-MM-DD` | Same | NO |
| Line item structure | `{description, quantity, unitPriceNetCents, taxRate}` | Same | NO |
| API operation | `api.invoices.create` + optional `uploadFile` | Same | NO |
| Permission identifiers | None in dialog | None | NO |

---

## 6. VAT / TAX — PRIMARY HARD GATE

| Aspect | Baseline | Implementation |
|--------|----------|----------------|
| Tax rate source | Literal `0.19` in `calcTotals`; literal `19` in payload | `CREATE_INVOICE_VAT_RATE = 19` |
| Type | `number` | `number` const |
| Default | 19% hardcoded | 19% named constant |
| Calculation | `Math.round(sub * 0.19)` | `Math.round(sub * (CREATE_INVOICE_VAT_RATE / 100))` |
| Payload | `taxRate: 19` per line item | `taxRate: CREATE_INVOICE_VAT_RATE` |
| Display | Hardcoded German MwSt label | `invoices.create.totals.vat` with `{rate}` interpolation |
| Classification | Hardcoded domain rule (19% VAT) | Same rule, extracted constant |

**tax/VAT semantics changed = NO** ✅

---

## 7. Net / tax / gross calculation

| Formula | Baseline | Implementation |
|---------|----------|----------------|
| Line subtotal | `quantity * unitPriceCents` | Identical |
| Net (subtotal) | `Σ line.totalCents` | Identical |
| Tax | `Math.round(sub * 0.19)` | `Math.round(sub * 19/100)` — equivalent |
| Gross | `sub + tax` | Identical |
| Rounding | `Math.round` on tax only | Same |
| Decimal precision | Cents integers internally | Same |
| Aggregation order | Line reduce then tax | Same |

**All formulas and evaluation order unchanged** ✅

---

## 8. Rounding — CRITICAL

| Aspect | Baseline | Implementation |
|--------|----------|----------------|
| Rounding timing | Tax only, after line multiply | Same |
| Precision | Integer cents | Same |
| Per-line vs aggregate | Per-line multiply; aggregate tax round | Same |
| Float helpers | `parseFloat` on user EUR input → `Math.round(*100)` | Same |
| Formatter rounding | `Intl.NumberFormat` display only (`formatAmount`) | `formatCreateInvoiceAmount` display only |

**financial rounding semantics unchanged** ✅

---

## 9. Currency

| Check | Result |
|-------|--------|
| Currency code | `EUR` unchanged |
| Numeric amounts in state/payload | Cents integers unchanged |
| Presentation | `formatCreateInvoiceAmount` locale-aware (was fixed `de-DE`) |
| Locale string in payload | None introduced |
| Comma/period parsing | Same `parseFloat` + `Math.round(*100)` path |

---

## 10. Line item semantics

| Field | Baseline | Implementation | Changed? |
|-------|----------|----------------|----------|
| `description` | Free text | Same | NO |
| `quantity` | `parseInt` min 1 default | Same | NO |
| `unitPriceCents` | `parseFloat` → cents | Same | NO |
| `taxRate` in payload | 19 | `CREATE_INVOICE_VAT_RATE` (19) | NO |
| `totalCents` (draft) | `qty * unitPriceCents` | Same | NO |
| Add/remove | `addLineItem` / `removeLineItem` when >1 | Same | NO |
| Validation | No per-field messages | Same | NO |

---

## 11. Validation

| Field / rule | Baseline condition | Implementation condition | Baseline message | New message | Condition changed? |
|--------------|-------------------|-------------------------|------------------|-------------|-------------------|
| Submit gate | `!form.title \|\| !form.type` | Same | (silent) | Same | NO |
| Create disabled | `saving \|\| !title \|\| (!isOut && !totalCents)` | Same | N/A | N/A | NO |
| API error toast | German fallback string | `invoices.create.error.createFailed` | DE hardcoded | Localized key | NO (message only) |

---

## 12. Invoice type / template IDs

| Check | Baseline | Implementation |
|-------|----------|----------------|
| Available type values | `OUTGOING_MANUAL`, `INCOMING_VENDOR` | `CREATE_INVOICE_TYPE_VALUES` — same |
| Selected value | Stored in `form.type` | Same |
| Comparisons | `isOutgoing(form.type)` | Same |
| API/payload | `type: form.type` | Same |
| Default | `''` until selected | Same |
| Visible labels | Hardcoded DE | `invoices.list.type.*` + desc keys |
| Template IDs | From `INVOICE_TEMPLATES[].id` | `CREATE_INVOICE_TEMPLATE_IDS` — same four IDs |
| Payload `templateId` | `form.templateId \|\| undefined` | Same |

**stable machine ID → TranslationKey → localized label** ✅  
**Never translated label → payload** ✅

---

## 13. Customer / booking / vehicle lookups

| Aspect | Baseline | Implementation | Changed? |
|--------|----------|----------------|----------|
| Lookup source | `lookup` prop (`customers`, `vehicles`, `vendors`) | Same | NO |
| Selected IDs | `form.customerId`, `form.vehicleId`, `form.vendorId` | Same | NO |
| Vendor callback | Sets `vendorId` + `vendorName` from lookup | Same | NO |
| Filtering | None | None | NO |
| Displayed values | Dynamic names/plates/VIN slice | Same raw values | NO |
| Payload references | Same optional fields | Same | NO |

---

## 14. CREATE API PAYLOAD — ABSOLUTE HARD GATE

`api.invoices.create(orgId, payload)` — field-by-field:

| Payload field | Baseline source | Implementation source | Changed? |
|---------------|----------------|------------------------|----------|
| `type` | `form.type` | `form.type` | NO |
| `title` | `form.title` | `form.title` | NO |
| `description` | `form.description` | `form.description` | NO |
| `vendorId` | `form.vendorId \|\| undefined` | Same | NO |
| `vendorName` | `form.vendorName \|\| undefined` | Same | NO |
| `customerId` | `form.customerId \|\| undefined` | Same | NO |
| `vehicleId` | `form.vehicleId \|\| undefined` | Same | NO |
| `notes` | `form.notes` | Same | NO |
| `templateId` | `form.templateId \|\| undefined` | Same | NO |
| `invoiceDate` | `form.invoiceDate` | Same | NO |
| `dueDate` | `form.dueDate \|\| undefined` | Same | NO |
| `currency` | `form.currency` | Same | NO |
| `lineItems` | Outgoing map with `taxRate: 19` | Same shape with `CREATE_INVOICE_VAT_RATE` | NO |
| `totalCents` | Incoming only; outgoing `undefined` | Same | NO |
| `imageUrl` | Upload result optional | Same | NO |

**payload shape / keys / types / serialization identical** ✅

---

## 15. Callback order / dialog lifecycle

| Event | Baseline | Implementation | Changed? |
|-------|----------|----------------|----------|
| Submit success | `onCreated(inv)` | Same | NO |
| Submit error | `toast.error` | Same path | NO |
| Cancel | `onClose` | Same | NO |
| Back navigation | `setStep` type/details | Same | NO |
| Reset on close | Host-owned | Unchanged | NO |
| Refresh/invalidation | Host `onCreated` | Same | NO |

---

## 16. Permissions

No permission checks, button visibility rules, or disabled-state logic were added, removed, or altered. Host surface controls access.

**unchanged** ✅

---

## 17. Date formatting

| Aspect | Baseline | Implementation |
|--------|----------|----------------|
| Visible date inputs | Native `<input type="date">` | Same |
| Machine values | `YYYY-MM-DD` strings | Same |
| `toLocaleDateString` / fixed locale in dialog | Not used for create fields | Not introduced |
| Due-date calculation | User input only (no auto-calc) | Same |

**raw timestamps unchanged; presentation labels only localized** ✅

---

## 18. Number / currency formatter (`create-invoice-i18n.ts`)

| Function | Behavior | Classification |
|----------|----------|----------------|
| `formatCreateInvoiceAmount` | `Intl.NumberFormat(getFormattingLocale(locale), {currency}).format(cents/100)` | Presentation-only |
| `ci` / label helpers | `translateKey` lookups | Presentation-only |
| `CREATE_INVOICE_VAT_RATE` | Machine constant export | Domain constant (unchanged value) |

**Adapter classification: ACCEPTABLE** (presentation-only; no payload mutation)

---

## 19. Dynamic business data

Verified: customer names, vendor names, vehicle make/model/plate/VIN, user-entered titles/descriptions/notes, and line-item descriptions are **not** passed through translation helpers.

**unchanged** ✅

---

## 20. +40 key audit

**Independent recompute:** `invoices.create.en.ts` contains **40** keys; `invoices.create.de.ts` contains **40** keys.  
**Dictionary totals:** 8190 → **8230** EN and DE (+40 net). ✅

### Per-key classification (A–O)

| # | Key | Class |
|---|-----|-------|
| 1 | `invoices.create.typeStep.title` | A |
| 2 | `invoices.create.type.outgoing.desc` | E |
| 3 | `invoices.create.type.incoming.desc` | E |
| 4 | `invoices.create.templates.section` | A |
| 5–12 | `invoices.create.template.*` (8) | E |
| 13–14 | `invoices.create.title.outgoing/incoming` | A |
| 15–32 | field/placeholder/select/document keys (18) | B |
| 33 | `invoices.create.image.previewAlt` | I |
| 34–37 | `invoices.create.lineItems.*` (4) | C |
| 38–40 | `invoices.create.totals.*` (3) | D |
| 41 | `invoices.create.error.createFailed` | F |

### Counts A–O

| Class | Count | Description |
|-------|------:|-------------|
| A — dialog chrome | 4 | |
| B — form labels | 17 | |
| C — line items | 4 | |
| D — tax/totals | 3 | |
| E — type/template labels | 10 | |
| F — validation | 1 | |
| G — actions | 0 | Reuses `common.*` / `invoices.createInvoice` |
| H — dates/payment terms | 0 | Date labels counted under B |
| I — accessibility | 1 | |
| J — should reuse existing | 4 | See §21 |
| K — semantic duplicate | 0 | |
| L — overly granular | 2 | `select.choose`, `select.optional` |
| M — orphan | 0 | |
| N — incorrect translation | 0 | |
| O — machine value translated | 0 | |

**orphans = 0** ✅

---

## 21. Key reuse

**Reused (not in +40):** `common.back`, `common.cancel`, `invoices.createInvoice`, `invoices.list.type.OUTGOING_MANUAL`, `invoices.list.type.INCOMING_VENDOR`.

**Avoidable new keys (J=4, non-blocking):**

| New key | Existing candidate |
|---------|-------------------|
| `invoices.create.field.customer` | `bookings.customer` |
| `invoices.create.field.vehicle` | `bookings.vehicle` |
| `invoices.create.field.dueDate` | `invoices.dueDate` |
| `invoices.create.field.invoiceDate` | `invoices.date` |

Scoped `invoices.create.*` namespace is acceptable for enforce-clean boundary clarity.

---

## 22. Orphans / duplicates

| Metric | Result |
|--------|--------|
| New keys | 40 EN / 40 DE |
| Production referenced | 40/40 |
| Test-only keys | 0 |
| Orphans | **0** |
| Semantic duplicates | Minor (template copy mirrors `invoice-detail.constants` German source) — justified for slice isolation |

---

## 23. Translation quality

| Term / area | EN | DE | Class |
|-------------|----|----|-------|
| Rechnung / invoice | Clear SaaS English | Consistent | STYLE ONLY |
| Position / line item | "Line item" | "Position" | OK |
| Netto / Net | "Net:" | "Netto:" | OK |
| Brutto / Total | "Total:" | "Gesamt:" | OK |
| MwSt / VAT | "VAT {rate}%:" | "MwSt {rate}%:" | OK |
| Fälligkeit | "Due date" | "Faelligkeitsdatum" (ASCII ue) | STYLE ONLY (project convention) |
| Leistungsdatum | N/A in dialog | N/A | — |
| Zahlungsbedingungen | N/A in dialog | N/A | — |
| Rechnung erstellen | Reuses `invoices.createInvoice` | Reuses key | OK |

**No BLOCKING translation issues.**

---

## 24. P221 ENFORCE-CLEAN

```
P221_ENFORCE_CLEAN_EXACT =
  rental/components/invoices/CreateInvoiceDialog.tsx
  rental/lib/create-invoice-i18n.ts
```

| Check | Result |
|-------|--------|
| Exact paths only | ✅ |
| No broad Rental prefix | ✅ |
| No broad billing prefix | ✅ |
| No ignores/allowlists/exemptions | ✅ |
| No scanner weakening | ✅ |

**P221 scoped findings = 0** (was 24 at baseline) ✅

---

## 25. Hidden / fixed-locale debt (P221 scope)

Re-scan of both enforce-clean paths:

| Pattern | Findings |
|---------|----------|
| Hardcoded user labels | 0 |
| `de-DE` / `en-US` | 0 |
| `locale === 'de'` | 0 |
| Template literal presentation | 0 |
| `aria`/`title` debt | 0 (preview alt localized) |

**hidden presentation debt = 0** ✅  
**host-owned fixed-locale debt = 0** ✅

---

## 26. Test source audit

File: `rental-create-invoice-dialog-localization.test.tsx` — **13** `it()` blocks declared.

| Test group | Count | Type |
|------------|------:|------|
| enforce-clean inventory | 1 | Static inventory |
| machine semantics | 5 | Constant / adapter unit |
| EN render | 1 | Component render |
| DE render | 1 | Component render |
| runtime locale switch | 1 | Sequential remount EN→DE |
| dynamic business data | 1 | Component render |
| payload regression | 1 | Component interaction |
| calculation regression | 1 | Unit math |
| source guards | 1 | Static file read |

**Independent execution result:**

```
npx vitest run src/rental/components/rental-create-invoice-dialog-localization.test.tsx
→ FAIL: ReferenceError: Cannot access 'mockCreate' before initialization
   (vi.mock hoisting — mockCreate referenced in factory before const init)
```

**Grade: WEAK** — tests do not currently execute; implementation audit claim "P221 tests (13) PASS" is **not reproducible** in this workspace.

**Supplemental evidence (PASS):** `hardcoded-copy-guard.test.ts` P221 source greps + inventory zero findings; static payload diff review.

---

## 27. Test adequacy

| Required evidence | Covered? | Notes |
|-------------------|----------|-------|
| EN render | Intended | Blocked by mock hoisting |
| DE render | Intended | Blocked |
| Runtime switch | Partial | Remount pattern (not same-mounted); static diff sufficient for label wiring |
| VAT presentation | Partial | Adapter unit test in file (blocked) |
| taxRate unchanged | Static + blocked unit test | Static diff sufficient |
| subtotal/net/tax/gross | Static + blocked calc test | Static diff sufficient |
| Line items | Static diff | Sufficient |
| Type/template IDs | Static + blocked constant tests | Static diff sufficient |
| Payload equivalence | Intended integration test | Blocked; static diff sufficient |
| Dynamic data | Intended | Blocked |
| Callbacks | Not directly tested | Static diff sufficient |
| No raw TranslationKey | Source guard in guard.test.ts | ✅ PASS via guard suite |

**Gap:** Dedicated component test file is non-executable until mock fix.

---

## 28. Runtime locale switch

Implementation test uses **sequential remount** (EN container teardown → DE container mount), not locale toggle on a single mounted dialog instance. This matches prior slice patterns (e.g. P220).

Static review: all visible strings route through `t()` / adapter with `locale` from `useLanguage()`. Numeric state, selected IDs, and draft line items are component state — not locale-dependent.

**Machine state intact during locale change** ✅ (by architecture; live same-mount test not provided)

---

## 29. Business / financial diff — HARD GATE

**business/runtime semantic changes = 0** ✅  
**Category H = 0** ✅

---

## 30. Global i18n freeze

```
npm run i18n:check → PASS
```

- Structural health: passed  
- EN/DE: 8230/8230 (100%)  
- Hardcoded enforce-clean surfaces guarded  

**GLOBAL ACTIVE I18N ENFORCE-CLEAN DEBT = 0** ✅

---

## 31. Dictionary accounting

| Metric | Baseline | Implementation | Independent |
|--------|----------|----------------|-------------|
| EN keys | 8190 | 8230 | 8230 ✅ |
| DE keys | 8190 | 8230 | 8230 ✅ |
| Parity | 100% | 100% | 100% ✅ |
| New keys | — | +40 | +40 ✅ |
| Removed keys | 0 | 0 | 0 |
| Changed existing translations | 0 | 0 | 0 |
| Duplicates | — | slice-scoped | Minor, non-blocking |
| Orphans | — | 0 | 0 ✅ |

---

## 32. Prior freezes

| Freeze | Scoped findings @ HEAD |
|--------|------------------------|
| P220 | 0 |
| P219 | 0 |
| P218 | 0 |
| P217 | 0 |
| P216A | 0 |
| P216B1 | 0 |
| P216B2 | 0 |
| P216C1 | 0 |
| P216C2A | 0 |
| P216C2B | 0 |

---

## 33. Shim / compatibility

| Metric | Baseline | Implementation |
|--------|----------|----------------|
| COMPAT `../i18n/` total | 29 | 29 |
| New compat consumers | 0 | 0 |

**shim <= baseline** ✅

---

## 34. Build

```
cd frontend && npm run build → PASS
```

---

## 35. git diff --check

```
git diff --check 6413a3dd...5bcc1088
```

**Result:** trailing whitespace in **documentation only** (`architecture/I18N_*`, `docs/audits/i18n-p2-2-21-rental-create-invoice-dialog-implementation-*`).  
**Production code:** PASS.

---

## 36. CI triage (#1167 @ `5bcc1088`)

| Job | Result | Class | Notes |
|-----|--------|-------|-------|
| Frontend component tests | PASS | — | Runs `test:vehicle-detail:unit` only — **does not execute P221 test file** |
| Production build | PASS | — | |
| Lint | PASS | — | |
| `npm run i18n:check` (via workflow) | PASS | — | |
| Typecheck | FAIL | **B** — pre-existing | Backend billing/vehicles spec errors; no P221 files |
| Backend unit tests | FAIL (1 run) / PASS (parallel run) | **C** — flaky/infra | Not P221-scoped |
| Playwright E2E | FAIL (vehicle detail run) | **B** — pre-existing | Not P221-scoped |

**P221-caused required failures = 0** ✅

---

## 37. Parallel work collision (Communication Center)

| Collision vector | Overlap? |
|------------------|----------|
| Files | NO |
| Dictionary namespaces | NO (`invoices.create.*` only) |
| Scanner boundaries | NO (exact P221 paths) |
| Shared helpers | NO |

**material collision = NO** ✅

---

## 38. Documentation accuracy

Compared implementation docs vs independent results:

| Claim | Accurate? |
|-------|-----------|
| +40 keys | ✅ |
| 8230/8230 | ✅ |
| P221 = 0 | ✅ |
| taxRate 19 unchanged | ✅ |
| payload unchanged | ✅ |
| Category E/H = 0 | ✅ |
| global i18n PASS | ✅ |
| prior freezes intact | ✅ |
| P221 tests (13) PASS | ❌ **Not reproducible** — hoisting error |
| `git diff --check` PASS | ❌ Docs trailing whitespace |

---

## 39. Final reconciliation table

| Metric | Baseline | Implementation claim | Independent result |
|--------|----------|---------------------|-------------------|
| Provenance | `6413a3dd` | #1167 draft @ `5bcc1088` | ✅ PASS |
| Scope | 2 production files | CreateInvoiceDialog + adapter | ✅ PASS |
| Financial machine values | Frozen | Unchanged | ✅ NO changes |
| VAT/tax semantics | 19% | 19% constant | ✅ NO |
| Net/tax/gross formulas | `round(sub*0.19)` | `round(sub*19/100)` | ✅ Equivalent |
| Rounding | Tax-only round | Same | ✅ NO |
| Currency | EUR cents | EUR cents | ✅ NO |
| Line items | Standard map | Same | ✅ NO |
| Validation conditions | title/type/total | Same | ✅ NO |
| Type/template IDs | Machine strings | Same | ✅ NO |
| Customer lookup | lookup prop | Same | ✅ NO |
| Booking lookup | N/A | N/A | N/A |
| Vehicle lookup | lookup prop | Same | ✅ NO |
| Create payload | `api.invoices.create` | Identical shape | ✅ NO |
| Callbacks | onCreated/onClose | Same | ✅ NO |
| Permissions | None in dialog | Same | ✅ NO |
| Date formatting | native date inputs | Same | ✅ NO |
| Number formatting | de-DE display | locale-aware display | ✅ Presentation only |
| Dynamic data | Untranslated | Untranslated | ✅ NO |
| P221 findings | 24 | 0 | ✅ 0 |
| Hidden literals | 24 | 0 | ✅ 0 |
| Fixed locale | de-DE formatAmount | 0 in scope | ✅ 0 |
| EN keys | 8190 | 8230 | ✅ 8230 |
| DE keys | 8190 | 8230 | ✅ 8230 |
| Parity | 100% | 100% | ✅ 100% |
| New keys | — | +40 | ✅ +40 |
| Duplicates | — | Minor | Non-blocking |
| Orphans | — | 0 | ✅ 0 |
| Runtime switch | N/A | Remount test | Partial (static OK) |
| Tests | — | 13 PASS | ❌ File fails to load |
| Test quality | — | STRONG | **WEAK** (non-executable) |
| Category H | 0 | 0 | ✅ 0 |
| P220–P216 | 0 | 0 | ✅ 0 |
| Shim | 29 | 29 | ✅ 29 |
| New compat consumers | 0 | 0 | ✅ 0 |
| npm run i18n:check | PASS | PASS | ✅ PASS |
| Global enforce-clean | 0 | 0 | ✅ 0 |
| Build | PASS | PASS | ✅ PASS |
| git diff --check | — | PASS | ⚠️ Docs whitespace only |
| CI | — | — | ✅ 0 P221-caused |
| Parallel collision | — | NO | ✅ NO |

---

## 40. Smallest correction set (for #1167, not applied in this audit)

1. **Fix test hoisting** in `rental-create-invoice-dialog-localization.test.tsx`:
   ```ts
   const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn(async () => ({ … })) }));
   vi.mock('../../lib/api', () => ({ api: { invoices: { create: mockCreate, … } } }));
   ```
2. **Register test in** `frontend/scripts/i18n-check.mjs` (parity with P220 `rental-parts-accessories-localization.test.tsx`).
3. **Optional:** Trim trailing whitespace in implementation docs for clean `git diff --check`.

---

## 41. Final verdict

### **B — READY WITH NON-BLOCKING OBSERVATIONS**

**PR #1167 may be marked ready and merged** after addressing the test hoisting fix (recommended pre-merge, non-blocking for financial/i18n freeze gates).

### Rationale

| Hard gate | Status |
|-----------|--------|
| Provenance / topology | ✅ PASS |
| Bounded dialog scope | ✅ KEEP AS ONE SLICE |
| Financial machine values / payload / VAT / rounding | ✅ Unchanged |
| Category H / I | ✅ 0 |
| P221 enforce-clean | ✅ 0 |
| Dictionary +40 / 8230 parity / orphans | ✅ |
| Global i18n freeze | ✅ PASS |
| Prior freezes + shim | ✅ |
| Build | ✅ PASS |
| Communication Center collision | ✅ NO |

### Non-blocking observations

1. **P221 component test file does not execute** (`mockCreate` hoisting) — implementation audit overstates test PASS.
2. **P221 tests omitted from `i18n-check.mjs`** — guard tests provide partial coverage only.
3. **`git diff --check`** reports trailing whitespace in implementation documentation files only.
4. **Runtime locale switch** uses remount pattern, not same-instance toggle (consistent with prior slices).
5. **J=4** keys could reuse existing `bookings.*` / `invoices.*` labels (style/consistency only).

### Not applicable

- **D** SPLIT — scope appropriately bounded  
- **E** NO-GO financial — no semantic regression found  
- **F** NO-GO global i18n — freeze intact  
- **G** NO-GO topology — provenance valid  

---

**STOP — No merge performed. P2.2.22 not started.**
