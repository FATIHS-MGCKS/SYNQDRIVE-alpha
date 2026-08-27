# P2.2.53 — Final Independent Read-Only Re-Audit
## Rental Invoice Line Items Localization / Production Hardening

**Date:** 2026-08-27  
**Auditor:** Cursor Cloud Agent (independent read-only)  
**Implementation PR:** [#1355](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1355)  
**Authoritative baseline:** `d92440355178d3f7b0a5cd1417bf0d3c3e7fa5da`  
**Implementation HEAD:** `7194fe2629f83d10b29790c3d78be44a97284fae`  
**Pre-flight PR:** [#1354](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1354) (reference only)  
**Mode:** STRICT READ-ONLY — no modifications to #1355

---

## 1. PR / Provenance Hard Gate

| Check | Result |
|-------|--------|
| PR #1355 open | **PASS** (`state: OPEN`) |
| Draft | **PASS** (`isDraft: true`) |
| Merged | **PASS** (`mergedAt: null`) |
| Mergeable | **PASS** (`mergeable: MERGEABLE`) |
| Base OID | **PASS** `d92440355178d3f7b0a5cd1417bf0d3c3e7fa5da` |
| HEAD OID | **PASS** `7194fe2629f83d10b29790c3d78be44a97284fae` |
| Implementation commit count | **PASS** — exactly **1** |
| Commit parent | **PASS** — `7194fe262^` = `d92440355178d3f7b0a5cd1417bf0d3c3e7fa5da` |
| Ancestry from #1354 pre-flight | **PASS** — `merge-base --is-ancestor` exit **1** (no ancestry) |
| Ancestry from main-only commits | **PASS** — no main-only ancestry |
| Local HEAD == remote HEAD | **PASS** |

**Topology:** VALID

---

## 2. Complete Diff Forensics

**Changed paths (12):**

| Path | Classification |
|------|----------------|
| `frontend/src/rental/lib/rental-invoice-line-items-i18n.ts` | **C** — new presentation adapter |
| `frontend/src/rental/components/invoices/invoiceLineItems.mapper.ts` | **B** — mapper presentation wiring |
| `frontend/src/rental/components/invoices/InvoiceLineItems.tsx` | **A** — locale threading |
| `frontend/src/i18n/translations/en.ts` | **D** — dictionary (+3 keys) |
| `frontend/src/i18n/translations/de.ts` | **D** — dictionary (+3 keys) |
| `frontend/src/i18n/hardcoded-copy-guard.test.ts` | **E** — scanner/governance |
| `frontend/src/i18n/hardcoded-copy-inventory.json` | **E** — scanner regen |
| `frontend/src/rental/components/rental-invoice-line-items-localization.test.tsx` | **F** — focused tests |
| `architecture/I18N_RENTAL_INVOICE_LINE_ITEMS_P2_2_53_2026-08-27.md` | **H** — architecture bookkeeping |
| `docs/audits/i18n-p2-2-53-rental-invoice-line-items-implementation-2026-08-27.md` | **G** — implementation audit doc |
| `frontend/src/master/components/ArchitekturView.tsx` | **H** — bookkeeping |
| `frontend/src/master/components/ChangesView.tsx` | **H** — bookkeeping |

**Negative certification counts:**

| Category | Count |
|----------|------:|
| I — financial semantic change | **0** |
| J — tax semantic change | **0** |
| K — quantity semantic change | **0** |
| L — unit inference semantic change | **0** (patterns preserved; ownership evaluated separately) |
| M — dynamic-description transformation | **0** (non-fallback) |
| N — credit/discount semantic change | **0** |
| O — frozen-surface change | **0** |
| P — unrelated production | **0** |

---

## 3. Exact Production Boundary

### `InvoiceLineItems.tsx`
| Aspect | Baseline | Implementation |
|--------|----------|----------------|
| Responsibility | Render line-item panel from mapper | Same + thread `useLanguage().locale` |
| Presentation | Money/unit labels via mapper defaults (`de`) | Locale-aware via `locale` param |
| Financial/business | None | None |

### `invoiceLineItems.mapper.ts`
| Aspect | Baseline | Implementation |
|--------|----------|----------------|
| Responsibility | Parse, calculate, credit classify, build panel | Same financial core; presentation overlay in panel map |
| Presentation | Hardcoded DE inferred units; `formatAmount` default | Delegates to adapter for money + localized units/fallback |
| Financial/business | `parseLineInput`, rollups, credit, tax breakdown | **Unchanged** |

### `rental-invoice-line-items-i18n.ts` (NEW)
| Aspect | Responsibility |
|--------|----------------|
| Locale resolution | `resolveRentalInvoiceLineItemsLocale` |
| Money presentation | `formatRentalInvoiceLineItemMoney` → `formatInvoiceListAmount` |
| Unit label presentation | `resolveLineItemUnitDisplayLabel` |
| Fallback presentation | `resolveLineItemFallbackDescription` |
| Unit classification (display) | `inferUnitKind`, `inferUnitLabelBaseline` |
| Financial/tax/quantity/credit | **None** |

---

## 4. P252–P249 Hard Freeze

| Surface | Diff lines |
|---------|----------:|
| P252 Payments (`rental-invoice-payments-i18n.ts`, `InvoicePayments.tsx`) | **0** |
| P251 Relations | **0** |
| P250 Header | **0** |
| P249 Secondary | **0** |

---

## 5. Other Negative Certifications

| Surface | Diff lines |
|---------|----------:|
| CreateInvoiceDialog | **0** |
| Invoice Documents | **0** |
| Tenant Billing | **0** |
| Line-item mutation/edit flow | **0** |

---

## 6. Line Item Domain Reconstruction

| Field | Baseline source | Implementation source | Business use | Display use | Changed? |
|-------|-----------------|----------------------|--------------|-------------|----------|
| description | `parseLineInput` trim/fallback | Overlay: localized fallback only when input empty/whitespace | Credit regex (pre-overlay) | Visible text | **Presentation only** for fallback |
| quantity | `parseLineInput` | Same | Calculations | Qty column | **No** |
| unit/unitLabel | `inferUnitLabel` in parse; overlay in panel | `resolveLineItemUnitDisplayLabel` in panel | None | Unit column | **Presentation only** |
| unitPriceNetCents | `parseLineInput` | Same | Net calc | Money format | **No** (format locale only) |
| netCents/taxCents/grossCents | `parseLineInput` | Same | Rollups | Money format | **No** |
| taxRate | `normalizeTaxRate` | Same | Tax calc | Label via `taxRateLabel` | **No** |
| subtotal/tax/total | Panel rollups | Same | Summary | Money format | **No** |
| currency | `invoice.currency \|\| 'EUR'` | Same | Formatting | Display | **No** |
| isCreditOrDiscount | `parseLineInput` | Same | Credit summary | Badge/row styling | **No** |
| creditedAt/status | Invoice fields | Same | Credit label | Summary | **No** |

---

## 7. Financial Formula Audit

**Symbols compared byte-for-byte in `parseLineInput`, `normalizeTaxRate`, `buildTaxBreakdown`, rollup section:**

| Certification | Result |
|---------------|--------|
| FINANCIAL CALCULATION DIFF | **ZERO** |
| TAX CALCULATION DIFF | **ZERO** |
| QUANTITY CALCULATION DIFF | **ZERO** |
| ROUNDING DIFF | **ZERO** |

Formulas preserved:
- quantity fallback: `Number.isFinite(item.quantity) ? item.quantity : 1`
- unit price: `Math.round(item.unitPriceNetCents ?? item.unitPriceCents ?? 0)`
- net: `Math.round(unitPriceNetCents * quantity)` when absent
- tax: `Math.round((netCents * taxRate) / 100)` when absent
- gross: `netCents + taxCents` when absent
- rollups: identical reduce + reconciliation

---

## 8–10. Frozen Symbol Gates

| Symbol | Semantic diff |
|--------|---------------|
| `parseLineInput` | **ZERO** (body unchanged) |
| `normalizeTaxRate` | **ZERO** (domain 0/7/19 preserved) |
| `buildTaxBreakdown` | **ZERO** (grouping, order, rates, cents) |

---

## 11. `buildInvoiceLineItemsPanel` Semantic Split

| Change class | Hunks |
|--------------|------:|
| PRESENTATION ONLY | locale param; money delegate; unit label overlay; fallback overlay |
| FINANCIAL CALCULATION | **0** |
| DESCRIPTION SEMANTICS (non-fallback) | **0** |
| UNIT INFERENCE SEMANTICS | **0** (patterns unchanged) |
| CREDIT SEMANTICS | **0** |
| ORDERING | **0** |
| EMPTY BEHAVIOR | **0** |

---

## 12. Credit / Discount Hard Freeze

- `isCreditOrDiscount` computed in `parseLineInput` before presentation overlay.
- Regex source: `item.description?.trim() || 'Position'` — never translated text.
- Negative cents paths unchanged.
- Credit summary logic (`creditedByStatus`, `creditFromLines`) unchanged.
- Fixture `Rabatt Sommeraktion` → `isCreditOrDiscount: true` in tests.

**Credit classification:** UNCHANGED

---

## 13. Currency Hard Freeze

Source remains: `invoice.currency || 'EUR'` — **UNCHANGED**

---

## 14–15. Money Formatter Audit & Regression

`formatRentalInvoiceLineItemMoney` delegates exclusively to `formatInvoiceListAmount(resolveRentalInvoiceLineItemsLocale(locale), cents, currency)`.

No rounding, cents conversion, currency derivation, or aggregation in adapter.

Representative values (1234, 5000, 10084, negative) at rates 0/7/19: raw cents identical DE/EN; only formatted strings differ (verified in focused test).

---

## 16–17. Unit Inference Truth Tables

### Baseline rules (reconstructed)
1. explicit `unit`/`unitLabel` (trimmed, non-empty) wins
2. `/\bTage\b/i` → `Tage`
3. `/\bStunden?\b/i` → `Std.`
4. `/\bkm\b/i` → `km`
5. else null

### Implementation truth table (independent `tsx` execution)

| Fixture | kind | baseline label | DE display | EN display |
|---------|------|----------------|------------|------------|
| explicit `unit: Paket X7` | explicit | Paket X7 | Paket X7 | Paket X7 |
| explicit `unitLabel: Paket X7` | explicit | Paket X7 | Paket X7 | Paket X7 |
| `Fahrzeugmiete (5 Tage)` | days | Tage | Tage | days |
| `miete 3 tage` | days | Tage | Tage | days |
| `Beratung 1 Stunde` | hours | Std. | Std. | hrs |
| `Beratung 2 Stunden` | hours | Std. | Std. | hrs |
| `120 KM` | km | km | km | km |
| `120 km` | km | km | km | km |
| `Zusatzleistung Sonderfall X7` | null | null | null | null |
| `5 Tage und 2 Stunden` | days | Tage | Tage | days (first-match precedence) |
| whitespace-only desc | null | null | null | null |
| empty desc | null | null | null | null |
| ` Zusatzleistung X7 ` (trimmed) | null | null | null | null |
| `unit: " "` + `unitLabel: Paket X7` | explicit | baseline would regex-infer; impl uses unitLabel | Paket X7 | Paket X7 |

**Minor edge (display-only):** whitespace-only `unit` now falls through to `unitLabel` via `unit?.trim() \|\| unitLabel?.trim()` vs baseline `unit ?? unitLabel` then trim. Affects visible label only; no financial/credit impact.

**UNIT INFERENCE PATTERNS CHANGED = NO**

---

## 18–19. Unit Inference Architecture Gate & Adapter Ownership

**Consumer trace:**
- `inferUnitKind` / `resolveLineItemUnitDisplayLabel` consumed only for visible `unitLabel` in panel + tests.
- `parseLineInput` financial path uses `inferUnitLabelBaseline` internally but panel **overwrites** `unitLabel` for display.
- No quantity, pricing, tax, payload, sorting, or business decisions consume unit kind.

**Verdict:** **UNIT INFERENCE IN ADAPTER — ACCEPTABLE PRESENTATION CLASSIFICATION**

Classification regex moved to adapter, but kind affects **only** visible unit label selection. Pre-flight contract permits adapter ownership of inferred-unit TranslationKeys; this is presentation classification, not business semantics.

**Preferred canonical split (observation, not blocking):** mapper could own kind resolution; adapter maps kind → TranslationKey. Current design is acceptable.

---

## 20–22. Explicit Unit / km Gates

| Check | Result |
|-------|--------|
| `Paket X7` explicit unitLabel DE/EN | **PASS** — raw string, no translation |
| `km` DE/EN | **PASS** — static `km`, no key |
| No `invoiceLineItem.unit.km` key | **PASS** |

---

## 23–27. Description Raw Semantics & Fallback

### Raw description gate
`Zusatzleistung Sonderfall X7` → DE/EN display identical raw string. **PASS**

### Whitespace forensics

| Input | Baseline parsed | Impl parsed | Visible DE | Visible EN | Inference source |
|-------|-----------------|-------------|------------|------------|------------------|
| `Zusatzleistung X7` | trimmed | trimmed | trimmed | trimmed | trimmed |
| ` Zusatzleistung X7 ` | trimmed | trimmed | trimmed | trimmed | trimmed |
| `   ` | `Position` | `Position` | `Position` (localized) | `Line item` | `Position` |
| `""` | `Position` | `Position` | localized fallback | localized fallback | `Position` |
| null | `Position` | `Position` | localized fallback | localized fallback | `Position` |

`descriptionSource = item.description?.trim() || parsed.description` — unit inference for empty/whitespace uses `Position`, matching baseline `parseLineInput` behavior.

### Fallback truth table

| Input | Baseline visible | DE impl | EN impl | Category | PASS |
|-------|------------------|---------|---------|----------|------|
| missing/null | Position | Position | Line item | fallback | **PASS** |
| empty | Position | Position | Line item | fallback | **PASS** |
| whitespace-only | Position | Position | Line item | fallback | **PASS** |
| normal raw text | trimmed raw | trimmed raw | trimmed raw | raw | **PASS** |

**FALLBACK LOCALIZATION VERDICT:** **FALLBACK LOCALIZATION SEMANTICALLY EQUIVALENT**

**DYNAMIC DESCRIPTION TRANSFORMATION DIFF = ZERO** (non-fallback cases)

---

## 28–30. Order / Identity / Empty

| Check | Result |
|-------|--------|
| Line IDs (`line-0`…`line-n`) | **UNCHANGED** |
| Row count / order | **UNCHANGED** |
| React keys (`line.id`) | **UNCHANGED** |
| Locale-dependent sorting | **NONE** |
| Empty `lineItems` → `null` | **UNCHANGED** |
| `invoiceLineItem.empty` wired | **NO** (intentionally unwired) |

---

## 31–32. Test Quality

**File:** `rental-invoice-line-items-localization.test.tsx`  
**Grade:** **STRONG**

Proves: enforce-clean=0, money locale diff, raw descriptions, explicit units, inferred label localization, financial semantics, DE↔EN same-mount, empty behavior.

**Same-mount identity:** **SUFFICIENT** — `data-testid="invoice-line-items-section"` persists across locale toggle; stable line IDs; stateless list component.

---

## 33–36. Key Inventory & Dictionary

### New keys (3)

| Key | EN | DE | Call site | Used |
|-----|----|----|-----------|------|
| `invoiceLineItem.unit.days` | days | Tage | `resolveLineItemUnitDisplayLabel` | yes |
| `invoiceLineItem.unit.hours` | hrs | Std. | `resolveLineItemUnitDisplayLabel` | yes |
| `invoiceLineItem.fallback.description` | Line item | Position | `resolveLineItemFallbackDescription` | yes |

- new keys = **3**
- unused = **0**
- out-of-scope = **0**
- no `invoiceLineItem.unit.km` key

### Existing 21-key reuse
All wired keys remain appropriately used. `invoiceLineItem.empty` remains intentionally unwired.

### Dictionary accounting

| Metric | Value |
|--------|------:|
| Baseline EN/DE | 8799 / 8799 |
| Final EN/DE | **8802 / 8802** |
| New keys | +3 |
| Removed keys | 0 |
| Changed existing translations | 0 |
| Orphans | 0 |
| Parity | **100%** |

---

## 37–38. Adapter Complete Classification

| Export | Classification |
|--------|----------------|
| `resolveRentalInvoiceLineItemsLocale` | LOCALE RESOLUTION |
| `formatRentalInvoiceLineItemMoney` | MONEY PRESENTATION |
| `inferUnitKind` | UNIT CLASSIFICATION (presentation-only) |
| `inferUnitLabelBaseline` | UNIT LABEL PRESENTATION (baseline compat) |
| `resolveLineItemUnitDisplayLabel` | UNIT LABEL PRESENTATION |
| `resolveLineItemFallbackDescription` | FALLBACK PRESENTATION |

Counts: financial=0, tax=0, quantity=0, rounding=0, credit=0, mutation=0

**ADAPTER FINAL VERDICT:** **ACCEPTABLE**

---

## 39–40. P253 Enforce-Clean & Inventory

| Path | P253 findings |
|------|--------------:|
| `InvoiceLineItems.tsx` | **0** |
| `invoiceLineItems.mapper.ts` | **0** |
| `rental-invoice-line-items-i18n.ts` | **0** |

Scanner inventory: **1453** total (unchanged). Regeneration/line-shift only; no suppressions or hidden exclusions.

---

## 41. ArchitekturView / ChangesView Bookkeeping

Hunks are **REQUIRED NON-SEMANTIC BOOKKEEPING** — P2.2.53 entry documentation only. No semantic production change.

---

## 42. Category E Audit

Production hunks: **financial/tax/quantity/rounding/credit/mutation = 0**.  
Governance hunks (guard test + inventory regen): expected Category E scope only.

---

## 43. Regression Execution

| Suite | Result |
|-------|--------|
| P253 focused (`rental-invoice-line-items-localization.test.tsx`) | **PASS** (8) |
| `InvoiceLineItems.test.tsx` | **PASS** (13) |
| `invoiceLineItems.mapper.test.ts` | **PASS** (7) |
| `hardcoded-copy-guard.test.ts` | **PASS** (126) |
| P252 payments regression | **PASS** |
| P251 relations regression | **PASS** (6) |
| P250 header regression | included in suite |
| P249 secondary regression | **PASS** (11) |
| `npm run i18n:check` | **PASS** — 8802/8802 |
| `npm run check:surface` | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check baseline...HEAD` | **FAIL** — trailing whitespace in 2 markdown docs only |

**P253-caused CI failures:** **0** (unrelated vehicle/E2E failures on PR, same pattern as P252)

---

## 44. Source-Guard Quality

Guard test enforces P253 paths at zero debt and verifies adapter delegates to `formatInvoiceListAmount`. Protects against `de-DE` fallback, hardcoded `Tage`/`Std.`/`Position` in scoped production files.

---

## 45–46. Main Collision & Drift

| Check | Classification |
|-------|----------------|
| #1353 merged / #1347 active | **LOW** — no direct line-items overlap |
| Open billing PRs | Pre-flight/audit PRs only; #1355 is sole implementation |
| Collision level | **NONE** |

**Main drift (baseline vs `origin/main`):** cosmetic Tailwind token changes on `InvoiceLineItems.tsx` only (`bg-gray-50/80` → `bg-muted/80`, `border-gray-200` → `border-border`). Not absorbed by #1355. **Acceptable isolation.**

---

## 47. Claim Reconciliation

| Claim | Implementation | Independent | PASS/FAIL |
|-------|----------------|-------------|-----------|
| 1 commit | 1 | 1 | **PASS** |
| Direct ancestry | baseline parent | verified | **PASS** |
| +3 keys | 3 | 3 | **PASS** |
| 8802/8802 | claimed | i18n:check | **PASS** |
| Money locale | threaded | verified | **PASS** |
| Raw descriptions | preserved | verified | **PASS** |
| Fallback description | localized | semantically equivalent | **PASS** |
| Unit patterns | unchanged | truth table | **PASS** |
| Unit labels | localized | verified | **PASS** |
| Explicit units | raw | verified | **PASS** |
| Financial calculations | frozen | zero diff | **PASS** |
| Tax / quantity | frozen | zero diff | **PASS** |
| Credit classification | frozen | verified | **PASS** |
| Line order | unchanged | verified | **PASS** |
| Empty behavior | null panel | verified | **PASS** |
| Adapter ownership | acceptable | presentation-only | **PASS** |
| P253 enforce-clean | 0 | 0 | **PASS** |
| P252–P249 freeze | 0 diff | 0 diff | **PASS** |
| Category E production | 0 | 0 | **PASS** |
| Tests | pass | 154+ focused pass | **PASS** |
| Surface / build | pass | pass | **PASS** |
| diff-check | claimed pass | **fail** (doc whitespace) | **FAIL** |
| Collision | none | none | **PASS** |

---

## 48. Correction Threshold

No blocking corrections required for production semantics.  
**Non-blocking:** trailing whitespace in implementation architecture/audit markdown files fails `git diff --check`.

---

## 49. Smallest Correction Set

**Not required for merge readiness.** Optional hygiene (non-blocking):

| File | Problem | Minimal fix |
|------|---------|-------------|
| `architecture/I18N_RENTAL_INVOICE_LINE_ITEMS_P2_2_53_2026-08-27.md` | trailing whitespace lines 3–4 | strip trailing spaces |
| `docs/audits/i18n-p2-2-53-rental-invoice-line-items-implementation-2026-08-27.md` | trailing whitespace lines 3–4 | strip trailing spaces |

---

## 50. Progress Update

| Metric | Pre-P253 | Post-P253 |
|--------|----------|-----------|
| Line Items hidden debt (3 paths) | >0 (de locale, hardcoded units) | **0** |
| Scanner total | 1453 | **1453** |
| Rental actionable debt | 356 | **356** (Finance/Billing: 74) |
| Conservative % | ~84.5% | **~84.5%** |
| Central % | ~84.5% | **~85.0%** |
| Optimistic % | ~85.5% | **~85.5%** |
| Confidence | high | **high** |

---

## 51. P254 Forecast

**Strongest next candidate:** **Tenant Billing** (Finance/Billing module; ~17 actionable scanner findings in pre-flight scope; bounded surface; no collision with frozen P253 line items).

Alternatives: Invoice Documents residual, Users & Roles, Damages, Data Analyse — lower priority than Tenant Billing for Rental campaign continuity.

**DO NOT IMPLEMENT P254 in this audit.**

---

## 52. Audit Artifact

This document: `docs/audits/i18n-p2-2-53-final-independent-reaudit-2026-08-27.md`

---

## 53. Audit Branch / PR

- Branch: `cursor/p2253-final-independent-reaudit-3c10`
- Base: `7194fe2629f83d10b29790c3d78be44a97284fae`
- Commits ahead of implementation HEAD before audit commit: **0**
- Audit commit: **1** (this file only)

---

## 54. Final Verdict

# **B — READY WITH NON-BLOCKING OBSERVATIONS**

All production hardening gates pass. Unit inference in adapter is acceptable presentation classification. Financial/tax/quantity/credit/order/empty/frozen surfaces certified zero diff.

**Non-blocking observation:** `git diff --check` reports trailing whitespace in two implementation markdown files (not production code).

**PR #1355 may be marked ready and merged** after optional doc whitespace cleanup (or accept as doc-only hygiene in a follow-up).

**RENTAL CAMPAIGN STATUS: CONTINUES.**

---

### Summary certifications

| Gate | Result |
|------|--------|
| UNIT INFERENCE IN ADAPTER | ACCEPTABLE PRESENTATION CLASSIFICATION |
| UNIT INFERENCE PATTERNS CHANGED | **NO** |
| FALLBACK LOCALIZATION | SEMANTICALLY EQUIVALENT |
| DYNAMIC DESCRIPTION TRANSFORMATION DIFF | **ZERO** |
| ADAPTER FINAL VERDICT | **ACCEPTABLE** |
| FINANCIAL/TAX/QUANTITY/ROUNDING DIFF | **ZERO** |
| P253 enforce-clean | **0** |
| Dictionary | **8802/8802** |
| Test quality | **STRONG** |
| Same-mount identity | **SUFFICIENT** |

**Changes / Architektur updated in implementation PR:** Yes (bookkeeping in #1355). This audit artifact does not modify them.
