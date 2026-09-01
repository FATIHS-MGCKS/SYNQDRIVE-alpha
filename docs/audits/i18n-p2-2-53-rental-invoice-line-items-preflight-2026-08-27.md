# P2.2.53 — Rental Invoice Line Items Pre-Flight

**Date:** 2026-08-27  
**Mode:** STRICT READ-ONLY PRE-FLIGHT  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Authoritative baseline:** `d92440355178d3f7b0a5cd1417bf0d3c3e7fa5da`  
**Baseline origin:** Merged PR #1351 (P2.2.52 — Rental Invoice Payments)  
**Merged implementation HEAD:** `9ee3829cbf8405d6ef1ee1695cc05415eee77f9d`  
**Campaign:** RENTAL  
**Frozen:** P216–P252

---

## PART A — P252 Post-Merge Baseline

### 1. P252 merge provenance

| Check | Result |
|-------|--------|
| PR #1351 merged | ✅ `mergedAt: 2026-08-27T18:08:55Z` |
| PR #1351 closed | ✅ `state: MERGED` |
| Merge commit SHA | ✅ `d92440355178d3f7b0a5cd1417bf0d3c3e7fa5da` |
| Squashed implementation HEAD | ✅ `9ee3829cbf8405d6ef1ee1695cc05415eee77f9d` |
| Merge strategy | **GitHub squash merge** (single parent `f4ff2e8b`) |
| Implementation commit count (pre-squash) | **1** |
| Current `origin/main` SHA | `1d8492eccc0ad928f576507cc0babbecdbb72805` |
| Campaign baseline vs main | **Diverged** — campaign branches from `p239-p238-merge-baseline-3c10`; main contains unrelated P1 vehicle/battery work |

### 2. Baseline health (independent run @ `d92440355`)

| Metric | Expected | Actual |
|--------|:--------:|:------:|
| Working tree | clean | ✅ clean |
| `npm run i18n:check` | PASS | ✅ PASS |
| `npm run check:surface` | PASS | ✅ PASS |
| EN keys | 8799 | ✅ 8799 |
| DE keys | 8799 | ✅ 8799 |
| Parity | 100% | ✅ 100% |
| Orphans | 0 | ✅ 0 |
| P252 enforce-clean | 0 | ✅ 0 (all 5 paths) |
| P251–P216 enforce-clean | 0 | ✅ 0 (guard suite 124/124 PASS) |
| Global enforce-clean | 0 | ✅ 0 |
| Category E baseline | 0 | ✅ 0 |
| Frontend test suite | — | 472 files / 3331 tests PASS (21 pre-existing unrelated failures) |
| Scanner inventory | 1453 ref | ✅ 1453 findings |

### 3. P252 freeze verification

All five P252 paths have **0** scanner findings. P253 must not reopen Payments.

---

## PART B — Line Items Runtime / Domain Map

### 5. Surface resolution

**LINE ITEMS TARGET CONFIRMED EXACTLY**

| Item | Value |
|------|-------|
| Primary component | `frontend/src/rental/components/invoices/InvoiceLineItems.tsx` |
| Mapper | `frontend/src/rental/components/invoices/invoiceLineItems.mapper.ts` |
| Types | `frontend/src/rental/components/invoices/invoiceLineItemTypes.ts` |
| Tests | `InvoiceLineItems.test.tsx`, `invoiceLineItems.mapper.test.ts` |
| Mount | `InvoiceDetail.tsx` → `<InvoiceLineItems invoice={invoice} … />` |
| Route | Rental invoice detail (`/rental/invoices/:id` family) |
| Props | `invoice`, theme classes (`card`, `tp`, `ts`, `isDarkMode`) |
| Data source | `invoice.lineItems[]` + invoice-level totals (`subtotalCents`, `taxCents`, `totalCents`, `paidCents`, `outstandingCents`, `currency`, `status`, `creditedAt`) |
| Calculation owner | `invoiceLineItems.mapper.ts` (`parseLineInput`, `buildTaxBreakdown`, `buildInvoiceLineItemsPanel`) |
| Empty behavior | Returns `null` when `lineItems` empty (section hidden) |
| Loading/error | **NONE** — synchronous projection from invoice prop |

**Out of scope (separate surfaces):**

- `CreateInvoiceDialog.tsx` — line-item **edit/mutation** flow (create invoice)
- `pricing/pricingLineItems.ts` — booking pricing, not invoice detail

### 6. Line-item domain inventory

| Field | Classification | Notes |
|-------|----------------|-------|
| `id` | MACHINE VALUE | Synthetic `line-${index}` |
| `description` | **DYNAMIC USER/BACKEND TEXT** | Raw passthrough; fallback `'Position'` is host debt |
| `quantity` | RAW DOMAIN DATA | `number`; displayed raw in table |
| `unit` / `unitLabel` | RAW DOMAIN DATA + HOST PRESENTATION | Explicit API fields; `inferUnitLabel` adds German heuristics |
| `unitPriceNetCents` | FINANCIAL INPUT | Integer cents |
| `netCents` | FINANCIAL DERIVED | Computed if missing |
| `taxRate` | MACHINE VALUE | Normalized to 0/7/19 |
| `taxCents` | FINANCIAL DERIVED | `round(net * rate / 100)` if missing |
| `grossCents` / `totalCents` | FINANCIAL DERIVED | `net + tax` if missing |
| `taxRateLabel` | HOST PRESENTATION | Via `taxRateLabel()` + `invoiceLineItem.tax.*` keys |
| `isCreditOrDiscount` | FINANCIAL DERIVED | Negative amounts or description regex |
| `currency` | MACHINE VALUE | `invoice.currency \|\| 'EUR'` |
| `subtotalCents` | FINANCIAL DERIVED | Invoice-level with line rollup reconciliation |
| `paidCents` / `outstandingCents` | RAW DOMAIN DATA | From invoice; display only in summary |
| `status` / `creditedAt` | MACHINE VALUE | Credit-note label logic |
| booking/damage linkage | **NOT PRESENT** on line-item model | — |
| metadata | **NOT PRESENT** | — |

### 24. Action matrix

**NONE** — read-only display surface. No edit, remove, add, navigate, or mutation actions.

### 28. Same-mount state inventory

**NONE** — no expanded row, selection, accordion, or edit state. Stateless projection from `invoice` prop.

### 27. React identity risk

No `key={locale}`, `key={t(...)}`, or localized keys found. Line rows use `key={line.id}` (stable `line-${index}`).

---

## PART C — Money / Tax / Quantity Freeze

### 12. Line total calculation formulas (baseline — DO NOT CHANGE)

```
quantity = finite(item.quantity) ? item.quantity : 1
taxRate = normalizeTaxRate(item.taxRate)  // → 0|7|19, default 19
unitPriceNetCents = round(item.unitPriceNetCents ?? item.unitPriceCents ?? 0)
netCents = item.netCents ?? round(unitPriceNetCents * quantity)
taxCents = item.taxCents ?? round(netCents * taxRate / 100)
grossCents = item.grossCents ?? item.totalCents ?? (netCents + taxCents)
subtotalCents = invoice.subtotalCents ?? Σ netCents
taxCents (panel) = invoice.taxCents ?? Σ taxCents
totalCents = invoice.totalCents ?? Σ grossCents
```

### 9–10. Unit machine inventory

| Source | Machine / raw value | Business use | Visible label today | Canonical key |
|--------|---------------------|--------------|---------------------|---------------|
| API `unit` / `unitLabel` | string | Display | Raw passthrough | — (dynamic) |
| `inferUnitLabel` heuristic | `Tage` | Days from description | Hardcoded DE | **NONE** (debt) |
| `inferUnitLabel` heuristic | `Std.` | Hours from description | Hardcoded DE | **NONE** (debt) |
| `inferUnitLabel` heuristic | `km` | Distance from description | Hardcoded DE | **NONE** (debt) |
| No enum registry | — | — | — | — |

Repository has **no** `invoiceLineItem.unit.*` keys. Inference is description-pattern-based, not a formal unit machine.

### 16–18. Formatter audit

| Formatter | Location | Classification |
|-----------|----------|----------------|
| `formatInvoiceMoney` | mapper | **PRESENTATION-ONLY** but calls `formatAmount(cents, currency)` → **defaults locale `'de'`** |
| `formatAmount` | `invoiceUtils.ts` | Delegates to `formatInvoiceListAmount` when locale passed; else `'de'` |
| `formatUnitTimesPrice` | mapper | Presentation composition; embeds formatted money |
| `formatQuantityWithUnit` | mapper | String concat `{quantity} {unitLabel}` — no locale |
| Quantity table cell | `InvoiceLineItems.tsx` | Raw `{line.quantity}` |
| `taxRateLabel` | mapper | Already i18n via `invoiceLineItem.tax.free` / `tax.rate` |
| `Intl.NumberFormat` | `invoice-list-i18n.ts` | Canonical money (reuse target) |

**Fixed-locale debt (hidden):**

1. Money always renders as `de` locale regardless of UI language
2. `inferUnitLabel` returns German strings (`Tage`, `Std.`, `km`) in all locales
3. Fallback description `'Position'` is hardcoded German

### 40. Financial freeze matrix

| Field | Source | Unit | Calc owner | Precision | Rounding | Currency | May localize? | Must remain unchanged? |
|-------|--------|------|------------|-----------|----------|----------|:-------------:|:------------------------:|
| `quantity` | API | count | — | number | — | — | Display only (optional) | ✅ raw value |
| `unitPriceNetCents` | API | cents | mapper | integer | `Math.round` | invoice | Display only | ✅ raw cents |
| `netCents` | API or derived | cents | mapper | integer | `Math.round` | invoice | Display only | ✅ formula |
| `taxRate` | API | percent | `normalizeTaxRate` | integer % | `Math.round` | — | Label only | ✅ machine rate |
| `taxCents` | API or derived | cents | mapper | integer | `Math.round` | invoice | Display only | ✅ formula |
| `grossCents` | API or derived | cents | mapper | integer | — | invoice | Display only | ✅ formula |
| `subtotal/tax/total` | API or rollup | cents | mapper | integer | — | invoice | Display only | ✅ formulas |
| `paid/outstanding` | API | cents | — | integer | — | invoice | Display only | ✅ raw cents |
| `description` | API/user | text | — | — | — | — | **NO** | ✅ raw text |
| `unitLabel` (explicit) | API | text | — | — | — | — | **NO** (raw) | ✅ raw text |
| `unitLabel` (inferred) | heuristic | text | mapper | — | — | — | Label may localize | ⚠️ inference rules unchanged |

### 41. Tax freeze matrix

| Field | Source | Display | May localize? | Unchanged? |
|-------|--------|---------|:-------------:|:----------:|
| `taxRate` (0/7/19) | API + normalize | `invoiceLineItem.tax.*` | Label only | ✅ rate machine |
| `taxCents` | derived | `formatInvoiceMoney` | Money display | ✅ cents |
| `taxBreakdown` | `buildTaxBreakdown` | per-rate rows | Labels + money | ✅ aggregation |
| Tax-inclusive/exclusive | net + tax = gross | summary rows | Labels only | ✅ semantics |

### 42. Quantity/unit freeze matrix

| Field/code | Source | Business use | Visible label | May localize? | Unchanged? |
|------------|--------|--------------|---------------|:-------------:|:----------:|
| `quantity` | API | `qty × price` | raw number | optional display format | ✅ value |
| explicit `unit`/`unitLabel` | API | display | raw string | NO | ✅ raw |
| inferred `Tage` | description regex | display | German always | label only | ✅ pattern logic |
| inferred `Std.` | description regex | display | German always | label only | ✅ pattern logic |
| inferred `km` | description regex | display | German always | label only | ✅ pattern logic |

### 43. Dynamic data freeze matrix

| Data | Preserve raw? | Translate? |
|------|:-------------:|:----------:|
| `description` | ✅ | ❌ |
| `Zusatzleistung Sonderfall X7` fixture | ✅ exact | ❌ |
| explicit `unit`/`unitLabel` | ✅ | ❌ |
| inferred unit labels | display only | may localize label text |
| credit/discount descriptions | ✅ | ❌ |
| `creditLabel` (status-driven) | — | already i18n keyed |

---

## PART D — Key / Reuse / Split Analysis

### 31–32. Existing i18n inventory

**21 `invoiceLineItem.*` keys** in EN+DE (parity 100%):

| Key | Wired? |
|-----|:------:|
| `section.title` | ✅ |
| `col.*` (7 column labels) | ✅ |
| `tax.free`, `tax.rate` | ✅ |
| `mobile.qtyTimesPrice`, `mobile.lineTotal` | ✅ |
| `summary.*` (8 summary labels) | ✅ |
| `empty` | ❌ **DEAD** — component returns `null` instead |

**Assessment:** Line Items is **already substantially i18n-wired** (like P252 Payments). P253 is **production hardening**, not greenfield localization.

### 31. Key reuse classification

| Concept | Classification |
|---------|----------------|
| Section/column/summary labels | **EXACT REUSE** (21 existing keys) |
| Tax labels | **EXACT REUSE** |
| Money formatting | **SEMANTIC REUSE** → `formatInvoiceListAmount` via adapter |
| Inferred units (`Tage`/`Std.`/`km`) | **NEW P253 KEY** (3 keys) or extend with `invoiceLineItem.unit.*` |
| Fallback `'Position'` | **NEW P253 KEY** (1 key) or reuse generic |
| `invoiceLineItem.empty` | **EXACT REUSE** (exists; optional wire if empty-state UX desired — out of current behavior) |
| `description` | **DYNAMIC — DO NOT TRANSLATE** |
| Explicit `unitLabel` | **DYNAMIC — DO NOT TRANSLATE** |

### 33. Key budget estimate

| Category | New keys | Reused keys |
|----------|:--------:|:-----------:|
| Section/columns/summary/tax | 0 | 20 wired |
| Money/date locale threading | 0 | canonical formatters |
| Inferred unit labels | 0–3 | — |
| Fallback description | 0–1 | — |
| a11y | 0 | existing |
| **Total estimate** | **0–4** | **20+** |

**Gate:** ≤15 ideal ✅

### 34. Split analysis

| Option | Assessment |
|--------|------------|
| A — View/table only | ✅ matches surface |
| B — Formatting hardening only | ✅ primary work |
| C — Mutation/edit separate | ✅ `CreateInvoiceDialog` excluded |
| D — Combined slice | ✅ view + hardening in one bounded slice |

**Decision:** **ONE SLICE — LINE ITEMS**

No edit/mutation on detail surface. `CreateInvoiceDialog` line-item editor is a separate future slice (frozen for P253).

### 35. Financial risk score (0–5)

| Path | money | tax | quantity | rounding | mutation | provider |
|------|:-----:|:---:|:--------:|:--------:|:--------:|:--------:|
| `InvoiceLineItems.tsx` | 2 | 1 | 1 | 0 | 0 | 0 |
| `invoiceLineItems.mapper.ts` (presentation fns) | 2 | 1 | 1 | **5** | 0 | 0 |
| `inferUnitLabel` | 0 | 0 | 1 | 0 | 0 | 0 |

**Highest-risk functions — MUST NOT CHANGE:**

- `parseLineInput`
- `normalizeTaxRate`
- `buildTaxBreakdown`
- `buildInvoiceLineItemsPanel` (rollup/reconciliation/credit logic)

---

## PART E — P253 Selection

### 38–39. Selected target and exact boundary

**P2.2.53 — Rental Invoice Line Items Localization / Production Hardening**

| Path | Role | P253 scope |
|------|------|------------|
| `InvoiceLineItems.tsx` | UI | Locale threading for money; optional quantity display |
| `invoiceLineItems.mapper.ts` | Projection | Locale param on `formatInvoiceMoney` / `formatUnitTimesPrice` only; localize `inferUnitLabel` **labels** via keys without changing inference rules |
| `rental-invoice-line-items-i18n.ts` | **NEW** adapter | Locale resolution + delegate to `formatInvoiceListAmount` |
| `rental-invoice-line-items-localization.test.tsx` | **NEW** tests | Same-mount, raw cents, description fixture, sort/order |
| `hardcoded-copy-guard.test.ts` | Governance | P253 enforce-clean block |

**Excluded:**

- P252 Payments (5 paths)
- P251 Relations (4 paths)
- P250 Header / P249 Secondary
- `CreateInvoiceDialog` mutation flow
- `invoiceLineItems.mapper.ts` calculation functions
- Tenant Billing, Documents, etc.

### 44. Adapter strategy

**NEW BOUNDED LINE-ITEM PRESENTATION ADAPTER**

Mirror P252 pattern: `rental-invoice-line-items-i18n.ts` delegating to `formatInvoiceListAmount` from `invoice-list-i18n.ts`.

Must not own: financial math, tax math, quantity math, rounding, mutation, permissions, sorting, dynamic text transforms.

### 45. Formatter strategy

| Type | Canonical formatter |
|------|---------------------|
| Money | `formatInvoiceListAmount(locale, cents, currency)` |
| Date | N/A on this surface |
| Quantity | Raw display acceptable; optional `Intl.NumberFormat` for decimal quantities only if already supported |
| Tax % | Existing `taxRateLabel()` + `invoiceLineItem.tax.*` keys (no change) |

### 46. P253_ENFORCE_CLEAN_EXACT (proposed)

```
rental/components/invoices/InvoiceLineItems.tsx
rental/components/invoices/invoiceLineItems.mapper.ts
rental/lib/rental-invoice-line-items-i18n.ts
```

Note: mapper included for presentation functions only; calculation symbols are frozen by test contract.

### 47–52. Future regression contracts

| Contract | Requirement |
|----------|-------------|
| Same-mount | DE↔EN: same line IDs, descriptions, quantities, unit labels (raw), cents, tax rates, currency, order |
| Money | `unitPriceNetCents=1234`, totals unchanged; only formatted strings differ |
| Description | `Zusatzleistung Sonderfall X7` exact raw in EN and DE |
| Tax | Rates 0/7/19 machine values and `taxCents` unchanged |
| Order | `line-0`, `line-1`, … stable across locale |
| Actions/mutation | N/A (no actions) |

### 53. Category E feasibility

**FEASIBLE** — presentation-only changes isolated from calculation symbols. Same pattern as P252.

### 29–30. Frozen surface separation

| Surface | Required diff |
|---------|:-------------:|
| P252 Payments | ZERO |
| P251 Relations | ZERO |
| P250 Header | ZERO |
| P249 Secondary | ZERO |

---

## PART F — Rental / Global Progress

### 4. Rental residual inventory (post-P252)

| Surface | Scanner findings | Hidden debt | Financial coupling | Candidate score |
|---------|:----------------:|:-----------:|:------------------:|:---------------:|
| **Invoice Line Items** | 0 | **Fixed-locale money + DE unit inference** | HIGH (display only) | **9/10** |
| Invoice Documents | 0 | Possible fixed-locale datetime | LOW | 6/10 |
| Tenant Billing | 17 | Visible copy | MEDIUM | 7/10 |
| Users & Roles | 67 | Dense UI copy | LOW | 6/10 |
| Data Analyse | 32 | Chart labels | LOW | 5/10 |
| Help Center | 6 | Static copy | LOW | 4/10 |
| Damages | 2 | Minor | LOW | 5/10 |

### 37. Top-5 rental target ranking

| Rank | Target | Rationale |
|:----:|--------|-----------|
| 1 | **Line Items** | Next invoice-detail slice; already keyed; bounded; mirrors P252 |
| 2 | Tenant Billing | 17 scanner findings; more visible debt |
| 3 | Invoice Documents residual | 0 scanner; possible formatter hardening |
| 4 | Users & Roles | High finding count but lower campaign leverage |
| 5 | Damages | Low finding count |

### 54–55. Collision and main drift

| PR | Collision with Line Items |
|----|:-------------------------:|
| #1350 Vehicle Detail (merged on main) | NONE |
| #1347 Vehicle cross-surface | NONE |
| #1349 Connectivity audit | NONE |
| #1351 Payments (merged) | NONE (frozen) |

**Collision:** ✅ **NONE**

**Main drift on P253 paths:**

| Path | Drift |
|------|:-----:|
| `InvoiceLineItems.tsx` | 22 lines (cosmetic Tailwind token: `bg-gray-50` → `bg-muted`) |
| `invoiceLineItems.mapper.ts` | 0 lines |

**Drift classification:** **LOW** (cosmetic only; do not absorb)

### 56. Baseline strategy

**DIRECT FROM P252 MERGE BASELINE** (`d92440355178d3f7b0a5cd1417bf0d3c3e7fa5da`)

### 57–58. Progress recompute

| Metric | Value |
|--------|------:|
| Scanner findings (global) | 1453 |
| Rental scanner findings | 356 |
| Invoice detail hidden debt closed by P252 | ~5–8 (fixed-locale money/date) |
| Line Items actionable units | ~4–6 (money locale, unit labels, fallback description) |
| Projected Rental slices remaining after P253 | ~8–12 |

**Global i18n completion (methodology: actionable debt closed / total actionable debt):**

| Band | Prior (post-P251) | Post-P252/P253 forecast |
|------|:-----------------:|:-----------------------:|
| Conservative | 83% | **84%** |
| Central | 84% | **~84.5%** |
| Optimistic | 85% | **~85%** |
| Confidence | medium-high | **high** |

### 59. Progress consistency

P252/P253 are **hardening slices** on already-keyed surfaces. They close hidden fixed-locale debt without materially shifting the 1453-finding scanner denominator. Increment is **~0.5–1%** band, not a jump.

### 60. P254 forecast

**Likely next:** Tenant Billing subsection localization (17 scanner findings, bounded tabs) **or** Invoice Documents datetime/money locale hardening (0 scanner, hidden formatter debt).

Independent of P253; do not assume without pre-flight.

---

## Final Verdict

# **A — GO — P2.2.53 RENTAL INVOICE LINE ITEMS SELECTED**

**P2.2.53:** Rental Invoice Line Items Localization / Production Hardening (detail view + formatter hardening; no mutation/edit)

**CAMPAIGN:** RENTAL

**P252 STATUS:** FROZEN

**GLOBAL I18N COMPLETION:** 84% – 85%  
Central estimate: **~84.5%**

**REMAINING ACTIONABLE DEBT:** ~1453 scanner + ~4–6 Line Items hidden units (of ~360 rental)

**IMPLEMENTATION NOT STARTED.**

---

*Audit-only. No production, dictionary, test, scanner, or architecture changes.*
