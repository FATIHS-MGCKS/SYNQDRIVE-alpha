# P2.2.50 — Key Budget & Scope Reassessment

**Date:** 2026-08-27  
**Mode:** STRICT READ-ONLY REASSESSMENT  
**Implementation PR:** [#1337](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1337) (Draft — do not merge)  
**Implementation HEAD:** `09495c593e4feb0d2b703d26cd03a8f364c78ea5`  
**Baseline:** `e0aa79d3135866eb9f890c2666165f15a1411c0b`  
**Pre-flight:** PR #1335

## Executive summary

PR #1337 delivered **42 new EN/DE keys** against a pre-flight budget of **~24–28**, violating the **>30 STOP and reassess** hard gate. The overrun is **not** primarily from status/type duplication (those were correctly reused). It comes from:

1. **Gate reasons counted as ~18 in pre-flight but implemented as 20 distinct keys** (+2 vs estimate midpoint).
2. **Missed exact reuse** for paid/outstanding/record-payment/invoice-date labels (−4 keys recoverable).
3. **Relations bucket implemented in full** (+13 keys) while pre-flight folded relations into the same slice estimate without reconciling against the ≤30 combined cap.
4. **One dead key** (`fallback.legacy`) — defined but never referenced in production.
5. **One semantic regression:** `common.cancel` (“Abbrechen”) replaces baseline invoice void label “Stornieren”.

**Safe optimized combined count:** **35–38 keys** (still **>30**).  
**Header-only optimized count:** **~26 keys** (≤30 feasible).  
**Relations-only optimized count:** **~9–12 keys**.

**Recommendation:** **SPLIT REQUIRED — P2.2.50 HEADER FIRST**; defer relations to **P2.2.51**.  
**PR #1337 disposition:** **CLOSE #1337 WITHOUT MERGE — REIMPLEMENT SPLIT P250**.

---

## 1. Implementation PR hard gate

| Check | Result |
|-------|--------|
| PR #1337 open | YES (Draft) |
| merged | false |
| Implementation HEAD | `09495c593e4feb0d2b703d26cd03a8f364c78ea5` |
| merge-base with baseline | `e0aa79d3135866eb9f890c2666165f15a1411c0b` |
| Implementation commits from baseline | 1 |
| #1335 ancestry | **NO** (merge-base with preflight branch = baseline only) |
| Unrelated main merge/rebase | **NO** |

Topology: **VALID**.

---

## 2. Complete 42-key inventory

| # | Key | EN | DE | Call site | File | Class | Required? | Reuse candidate | Dup? |
|---|-----|----|----|-----------|------|-------|-----------|-----------------|------|
| 1 | `amount.paid` | Paid | Bezahlt | Header amount cell | `InvoiceDetailHeader.tsx` | A | YES | **`invoicePayment.summary.paid`** (EXACT) | H |
| 2 | `amount.outstanding` | Outstanding | Offen | Header amount cell | `InvoiceDetailHeader.tsx` | A | YES | **`invoicePayment.summary.outstanding`** (EXACT) | H |
| 3 | `invoiceDate` | Invoice date: | Rechnungsdatum: | Header date line | `InvoiceDetailHeader.tsx` | A | YES | **`invoices.create.field.invoiceDate`** + `:` in TSX | H |
| 4 | `action.viewPdf` | View PDF | PDF ansehen | PDF button | `InvoiceDetailHeader.tsx` | A | YES | `invoices.documents.action.preview` (Preview — NOT exact) | — |
| 5 | `menu.more` | More | Mehr | Menu trigger | `InvoiceHeaderMoreMenu.tsx` | B | YES | `operator.navigation.tab.more` (cross-domain exact text) | K |
| 6 | `menu.issue` | Issue | Ausstellen | Menu item | `InvoiceHeaderMoreMenu.tsx` | B | YES | NO SAFE REUSE | — |
| 7 | `menu.regeneratePdf` | Regenerate PDF | PDF neu erzeugen | Menu item | `InvoiceHeaderMoreMenu.tsx` | B | YES | `invoices.documents.action.regenerate` (different semantics) | — |
| 8 | `menu.markSentExternally` | Record external delivery | Externen Versand erfassen | Menu item | `InvoiceHeaderMoreMenu.tsx` | B | YES | NO SAFE REUSE | — |
| 9 | `menu.recordPayment` | Record payment | Zahlung erfassen | Menu item | `InvoiceHeaderMoreMenu.tsx` | B | YES | **`invoicePayment.action.record`** (EXACT) | H |
| 10 | `relations.heading` | Assignment | Zuordnung | Section title | `InvoiceRelations.tsx` | D | YES* | `fines.detail.assignment` (cross-domain) | K |
| 11 | `relations.template` | Template | Vorlage | Template row | `InvoiceRelations.tsx` | D | YES* | NO EXACT (create section is different) | — |
| 12 | `fallback.archived` | Relation archived | Relation archiviert | Relations mapper | `invoiceRelations.mapper.ts` | E | YES* | NO EXACT | — |
| 13 | `fallback.deleted` | Relation deleted | Relation gelöscht | Relations mapper | `invoiceRelations.mapper.ts` | E | YES* | NO EXACT | — |
| 14 | `fallback.unavailable` | Data unavailable | Daten nicht verfügbar | Relations mapper | `invoiceRelations.mapper.ts` | E | YES* | `fleetHealthService.kpi.unavailable` (wrong domain) | — |
| 15 | `fallback.legacy` | Legacy origin | Legacy-Herkunft | **NONE** | adapter only | E | **NO** | Baseline used `unavailable` text | **I / J** |
| 16 | `permission.customer` | No permission for customer details | Keine Berechtigung für Kundendetails | Relations mapper | `invoiceRelations.mapper.ts` | E | YES* | NO EXACT | — |
| 17 | `permission.booking` | No permission for booking details | Keine Berechtigung für Buchungsdetails | Relations mapper | `invoiceRelations.mapper.ts` | E | YES* | NO EXACT | — |
| 18 | `permission.vehicle` | No permission for vehicle details | Keine Berechtigung für Fahrzeugdetails | Relations mapper | `invoiceRelations.mapper.ts` | E | YES* | NO EXACT | — |
| 19 | `permission.default` | No permission | Keine Berechtigung | Relations mapper | `invoiceRelations.mapper.ts` | E | YES* | `operator.entry.access.denial.forbidden_role.title` (too generic) | — |
| 20 | `period.unknown` | Period unknown | Zeitraum unbekannt | Relations mapper | `invoiceRelations.mapper.ts` | D | YES* | NO EXACT | — |
| 21 | `period.until` | until {date} | bis {date} | Relations mapper | `invoiceRelations.mapper.ts` | D | YES* | NO EXACT | — |
| 22 | `period.from` | from {date} | ab {date} | Relations mapper | `invoiceRelations.mapper.ts` | D | YES* | NO EXACT | — |
| 23–42 | `gate.*` (20 keys) | (see §9) | (see §9) | Action gates | `invoiceDetail.mapper.ts` | C | YES | Partial near-dup only (§10) | — |

\*Required for **combined** slice; deferrable to **P2.2.51** under split plan.

**Classification totals:** A=4, B=5, C=20, D=4, E=8, H=3, I/J=1, L/M/N/O=0.

**Note:** `common.edit` and `common.cancel` are reused but **not** in the +42 count. `common.cancel` is a **semantic mismatch** (see §25).

---

## 3. Key count reconciliation

| Metric | Value |
|--------|-------|
| Pre-flight estimate | 24–28 |
| Actual new keys | 42 |
| Delta | **+14 to +18** |

| Bucket | Pre-flight est. | Actual | Delta | Explanation |
|--------|-----------------|--------|-------|---------------|
| Header labels | 5 | 4 | −1 | Total/due reused via `invoices.list.col.*`; paid/outstanding should also reuse |
| Menu labels | 8 | 5 new (+2 reused) | −3 | Pre-flight counted 8 new; implementation created 5 + reused edit/cancel |
| Gate reasons | ~18 | **20** | **+2** | Baseline has 20 distinct reason strings; pre-flight rounded down |
| Relations chrome | ~10 | **13** | **+3** | 4 fallbacks + 4 permissions + 3 period + 2 heading/template |
| A11y | (in buckets) | 0 dedicated | 0 | No separate a11y keys added |
| Dead/unused | 0 | 1 (`fallback.legacy`) | +1 | Key defined, never called |
| Missed reuse | (in est.) | 4 recoverable | +4 vs optimal | paid, outstanding, recordPayment, invoiceDate |

---

## 4. Pre-flight estimate forensics (PR #1335)

Pre-flight table:

| Bucket | Est. new |
|--------|----------|
| Header amount/date | 5 |
| Header actions/menu | 8 |
| Gate/disabled reasons | ~18 |
| Relations chrome/fallbacks | ~10 |
| **Total** | **~24–28** |

**Why estimate diverged:**

| Issue | Detail |
|-------|--------|
| Gate bucket underestimated | Baseline `invoiceDetail.mapper.ts` contains **20** unique German reason strings; pre-flight said ~18 |
| Double-counting avoided in estimate, not in implementation | Pre-flight summed header+relations (~41 gross) then claimed net ~24–28 after reuse — but **did not show the subtraction math** that would reach ≤28 |
| Implementation proceeded past >30 gate | 20 gates alone + 9 header/menu + 13 relations = 42 before any reuse |
| Reuse partially applied | Status/type/template/draft/total/due reused; **invoicePayment.\*** summary labels missed |
| Unexpected key | `fallback.legacy` added though baseline mapped legacy → unavailable text and no `fallback: 'legacy'` call site exists |

---

## 5–8. Reuse audit summary

### Exact reuse available (should REMOVE new key)

| P250 key | Replace with |
|----------|--------------|
| `amount.paid` | `invoicePayment.summary.paid` |
| `amount.outstanding` | `invoicePayment.summary.outstanding` |
| `menu.recordPayment` | `invoicePayment.action.record` |
| `invoiceDate` | `invoices.create.field.invoiceDate` (+ trailing `:` in component) |

### Semantic reuse (acceptable with care)

| Concept | Candidate | Verdict |
|---------|-----------|---------|
| Total label | `invoices.list.col.total` | **Already reused** — note baseline was “Gesamtbetrag”, key is “Gesamt” |
| Due label | `invoices.list.col.dueDate` | **Already reused** — baseline was “Fälligkeit”, key is “Fällig” |
| More trigger | `operator.navigation.tab.more` | Cross-domain — **reject** |
| Relations heading | `fines.detail.assignment` | Cross-domain — **reject** |
| View PDF | `invoices.documents.action.preview` | “Preview” ≠ “View PDF” — **reject** |
| Regenerate PDF | `invoices.documents.action.regenerate` | “Generate new version” ≠ “Regenerate PDF” — **reject** |
| Cancel void action | `common.cancel` | **REJECT — semantic bug** (Abbrechen ≠ Stornieren) |

### No safe reuse

All 20 gate reason strings — each maps to a distinct machine predicate / UX context.

---

## 9. Gate-reason forensics (20 keys)

| Gate key | Baseline DE | Unique? | Consolidation |
|----------|-------------|---------|---------------|
| `issueNotDraft` | Nur Entwürfe können ausgestellt werden | YES | — |
| `noPdfYet` | Noch kein PDF vorhanden | YES | — |
| `pdfAlreadyExists` | PDF ist bereits vorhanden — „PDF neu erzeugen“ im Menü | YES | — |
| `pdfOutgoingOnly` | PDF-Generierung nur für Ausgangsrechnungen | YES | Near `outgoingOnly` but PDF-specific |
| `issueBeforePdf` | Zuerst ausstellen, danach PDF erzeugen | YES | — |
| `pdfTerminalState` | Für stornierte oder abgeschlossene Sonderfälle nicht verfügbar | YES | — |
| `pdfTypeUnavailable` | PDF-Generierung ist derzeit nur für Ausgangsrechnungen verfügbar | YES | Longer variant of outgoing PDF |
| `emailAdminOnly` | Nur Administratoren können Rechnungen per E-Mail senden | YES | — |
| `emailOutgoingOnly` | E-Mail-Versand nur für Ausgangsrechnungen | YES | — |
| `issueFirst` | Zuerst ausstellen | YES | Shared across email/regenerate paths (same key ✓) |
| `emailNeedsPdf` | PDF muss zuerst erzeugt werden | YES | Near `generatePdfFirst` — different wording |
| `regenerateBookingOnly` | Nur für Buchungsrechnungen mit PDF | YES | — |
| `generatePdfFirst` | Zuerst PDF erzeugen | YES | — |
| `markSentState` | Bereits gesendet oder noch nicht ausgestellt | YES | — |
| `outgoingOnly` | Nur für Ausgangsrechnungen | YES | Shorter outgoing-only variant |
| `paymentStatusBlocked` | Für diesen Status nicht möglich | YES | — |
| `noOutstandingAmount` | Kein offener Betrag | YES | — |
| `editDraftOrReview` | Bearbeiten nur für Entwürfe oder Rechnungen in Prüfung | YES | — |
| `cancelNoPermission` | Keine Berechtigung zum Stornieren | YES | — |
| `cancelStatusBlocked` | Stornierung für diesen Status nicht möglich | YES | — |

**Do not merge** `pdfOutgoingOnly`/`emailOutgoingOnly`/`outgoingOnly` — distinct UI contexts.

---

## 10. Semantic consolidation groups

| Group | Keys | Replacement | Safe? | Reason |
|-------|------|-------------|-------|--------|
| G1 | `amount.paid` | `invoicePayment.summary.paid` | YES | Exact EN/DE match |
| G2 | `amount.outstanding` | `invoicePayment.summary.outstanding` | YES | Exact EN/DE match |
| G3 | `menu.recordPayment` | `invoicePayment.action.record` | YES | Exact EN/DE match |
| G4 | `invoiceDate` | `invoices.create.field.invoiceDate` + `:` | YES | Field label + punctuation in TSX |
| G5 | `fallback.legacy` | REMOVE (use `unavailable` or baseline behavior) | YES | Unused; baseline used unavailable text |
| G6 | `permission.{customer,booking,vehicle,default}` | Single `permission.denied` with `{entity}` param | MAYBE | Saves 3 keys; needs review for natural DE |

**No safe consolidation** among gate keys.

---

## 11–12. Over-specific / cross-domain

| Key | Verdict |
|-----|---------|
| Most `rental.invoice.detail.primary.gate.*` | **GOOD BOUNDED KEY** — invoice-detail-specific predicates |
| `menu.more` | **TOO SPECIFIC** if `common.more` added; else acceptable bounded |
| `fallback.legacy` | **UNNECESSARY** — dead key |
| `operator.navigation.tab.more` reuse | **WRONG NAMESPACE** if used |
| No `dashboard.*` / `notification.*` misuse | **NONE** |

---

## 13. Dynamic / machine content safety

**PASS** — no keys for invoice numbers, entity names, status IDs, routes, or backend errors.

**BLOCKING presentation issues (not keyed):** `common.cancel` mislabels void action.

---

## 14. Adapter ownership

`rental-invoice-detail-primary-i18n.ts` — **ACCEPTABLE** but should not own keys recoverable via `invoicePayment.*` / `invoices.create.*`. Gate reason map is appropriate adapter ownership. Relation helpers belong in adapter **only for relations slice**.

---

## 15–16. Optimized counts & ≤30 gate

| Count | Value |
|-------|-------|
| **A. CURRENT** | 42 |
| **B. SAFE OPTIMIZED (combined)** | **35–38** (remove 4 reuse + 1 dead; add 1 void-cancel key) |
| **C. MINIMUM PLAUSIBLE (combined)** | **~35** (add permission parameterization) |

**≤30 feasibility: C — SAFE OPTIMIZED COUNT > 35**

Combined slice **cannot** meet ≤30 without unacceptable gate consolidation.

---

## 17–18. Split key counts

### Header-only (P2.2.50 revised)

| Item | New keys | Reused |
|------|----------|--------|
| Gate reasons | 20 | 0 |
| Menu chrome | 5 (`more`, `issue`, `regenerate`, `markSent`, `void`) | `common.edit`, `invoicePayment.action.record` |
| Header chrome | 1 (`viewPdf`) | paid, outstanding, invoiceDate, total, due, status, type |
| **Total new** | **~26** | ~15+ |

**Production files:** `InvoiceDetailHeader.tsx`, `InvoiceHeaderMoreMenu.tsx`, `invoiceDetail.mapper.ts` (gates/core only), `invoiceUtils.ts`, partial adapter, `InvoiceDetail.tsx` (locale threading).

### Relations-only (P2.2.51)

| Item | New keys | Reused |
|------|----------|--------|
| Heading + template | 2 | — |
| Fallbacks | 3 | — |
| Permissions | 4 (or 1 parameterized) | — |
| Period chrome | 3 | `invoices.list.emptyValue` |
| **Total new** | **~9–12** | `tasks.entity.*`, `invoices.list.col.*`, templates |

**Production files:** `InvoiceRelations.tsx`, `invoiceRelations.mapper.ts`, partial adapter.

---

## 19. Split quality comparison (0–5)

| Criterion | Combined optimized | Header first + Relations next |
|-----------|-------------------|-------------------------------|
| Semantic cohesion | 4 | 5 |
| Boundedness | 2 | 5 |
| Key budget compliance | 1 | 5 |
| Testability | 3 | 4 |
| Business risk | 3 | 4 |
| Financial risk | 5 | 5 |
| Merge safety | 2 | 4 |
| Campaign efficiency | 4 | 3 |
| **Total** | **24** | **35** |

---

## 20–22. File boundary & threading

| File | Classification |
|------|----------------|
| `InvoiceDetailHeader.tsx` | SUBSTANTIVE |
| `InvoiceHeaderMoreMenu.tsx` | SUBSTANTIVE |
| `InvoiceRelations.tsx` | SUBSTANTIVE |
| `invoiceDetail.mapper.ts` | SUBSTANTIVE |
| `invoiceRelations.mapper.ts` | SUBSTANTIVE |
| `invoiceUtils.ts` | SUPPORT-ONLY (formatter threading) |
| `rental-invoice-detail-primary-i18n.ts` | SUPPORT-ONLY (adapter) |
| `InvoiceDetail.tsx` | **LOCALE THREADING ONLY** — passes `locale` into `buildInvoiceDetailDto` |

**Substantive production files:** **5** (matches pre-flight) + 2 support + 1 threading = scope pressure vs “≤5 substantive” intent.

`invoiceUtils.ts`: presentation formatting only — **MECHANICAL**, non-blocking.  
`InvoiceDetail.tsx`: **MECHANICAL PRESENTATION THREADING**, non-blocking.

---

## 23–24. Status/type/template reuse

| Check | Result |
|-------|--------|
| Status duplicate keys | **NONE** — reuses `invoices.list.status.*` |
| Type duplicate keys | **NONE** — reuses `invoices.list.type.*` |
| Template names | **CORRECT** — reuses `invoices.create.template.*` |

---

## 25. Current implementation safety

**SEMANTIC ISSUE FOUND:**

1. **`common.cancel` for invoice void** — baseline menu label was **“Stornieren”**; `common.cancel` = **“Abbrechen”** / **“Cancel”**. Callback unchanged but **user-facing void semantics regressed**.
2. **`fallback.legacy` key unused** — dead dictionary entry; baseline legacy path used unavailable text.
3. **Minor label drift** — total/due use list column keys (“Gesamt”/“Fällig”) vs baseline (“Gesamtbetrag”/“Fälligkeit”) via reuse; acceptable if P214 canonical wins.

Financial/tax/payment/status machine/action gates/navigation/permissions/P249 freeze: **appear intact**.

---

## 26–28. Correction strategy & split plan

**Selected strategy: C — SPLIT P250 INTO HEADER FIRST / RELATIONS NEXT**

### P2.2.50 first slice (revised)

**P2.2.50 — Rental Invoice Detail Primary Header Localization**

Paths:
- `frontend/src/rental/components/invoices/InvoiceDetailHeader.tsx`
- `frontend/src/rental/components/invoices/InvoiceHeaderMoreMenu.tsx`
- `frontend/src/rental/components/invoices/invoiceDetail.mapper.ts` (gate reasons + core presentation only; defer relations locale to P251)
- `frontend/src/rental/components/invoices/invoiceUtils.ts`
- `frontend/src/rental/lib/rental-invoice-detail-primary-i18n.ts` (header/gate exports only)
- `frontend/src/rental/components/invoices/InvoiceDetail.tsx` (locale threading)

**Target new keys: ≤26**

### P2.2.51 second slice (planning only)

**P2.2.51 — Rental Invoice Detail Relations Localization**

Paths:
- `frontend/src/rental/components/invoices/InvoiceRelations.tsx`
- `frontend/src/rental/components/invoices/invoiceRelations.mapper.ts`
- `frontend/src/rental/lib/rental-invoice-detail-primary-i18n.ts` (relation exports — or rename/split adapter)

**Target new keys: ~9–12**

### Original P251 forecast displacement

**P2.2.52 — Invoice Payments panel + `invoicePayments.mapper.ts`** (was P251)

---

## 27. If combined correction set (not recommended)

| Action | Keys |
|--------|------|
| **REMOVE** | `amount.paid`, `amount.outstanding`, `menu.recordPayment`, `invoiceDate`, `fallback.legacy` |
| **REUSE** | → `invoicePayment.summary.*`, `invoicePayment.action.record`, `invoices.create.field.invoiceDate` |
| **ADD** | `menu.voidInvoice` (Stornieren / Void invoice) — replace `common.cancel` |
| **KEEP** | 20 gate keys + 4 menu keys + 13 relations keys |
| **Target** | **~35–38** — still **>30** |

---

## 30. PR #1337 disposition

**CLOSE #1337 WITHOUT MERGE — REIMPLEMENT SPLIT P250**

Rationale: combined optimized count remains >30; semantic cancel regression; cleaner to reimplement header-only slice than surgically revert relations half in-place.

---

## 31. Correction risk (if fixing #1337 in place)

**MEDIUM–HIGH** — requires removing ~13 relation keys, reverting relations mapper/TSX, fixing reuse + cancel label, updating tests/docs. Split reimplementation is lower risk.

---

## 32–33. Revised enforce-clean & tests

### Header-first `P250_ENFORCE_CLEAN_EXACT`

```
rental/components/invoices/InvoiceDetailHeader.tsx
rental/components/invoices/InvoiceHeaderMoreMenu.tsx
rental/components/invoices/invoiceDetail.mapper.ts
rental/components/invoices/invoiceUtils.ts
rental/lib/rental-invoice-detail-primary-i18n.ts
```

Exclude `InvoiceRelations.tsx`, `invoiceRelations.mapper.ts` until P251.

### Test contract (header-first)

Retain: EN/DE header render, gate reasons, status/type/money/date, menu labels, void label, same-mount header, action eligibility.  
Exclude until P251: relations heading, fallbacks, permissions, navigation, period chrome.

---

## 34. Progress impact

| Approach | Units closed | Notes |
|----------|--------------|-------|
| #1337 as merged | ~55–65 (claimed) | **Invalid for campaign credit** until key budget resolved |
| Header-only split | ~35–45 | Honest partial closure |
| Relations follow-up | ~15–20 | Remaining primary debt |

Do not inflate global completion % until bounded slices land at ≤30 keys each.

---

## 35. Future P251 / P252

| Slice | Target |
|-------|--------|
| P2.2.50 (revised) | Primary **Header** localization |
| P2.2.51 | Primary **Relations** localization |
| P2.2.52 | Invoice **Payments** panel (original P251 forecast) |

---

## Final verdict

**C — SPLIT REQUIRED — P2.2.50 HEADER FIRST**

**PR #1337 MUST NOT BE MERGED YET.**

**P2.2.50 first-slice target:** Rental Invoice Detail Primary **Header** Localization (~26 new keys).  
**P2.2.51 planned second slice:** Rental Invoice Detail **Relations** Localization (~9–12 new keys).
