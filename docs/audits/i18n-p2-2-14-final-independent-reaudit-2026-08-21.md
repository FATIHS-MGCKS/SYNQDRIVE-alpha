# P2.2.14 — Rental Invoice List + Filters localization — Final Independent Re-Audit

**Date:** 2026-08-21  
**Auditor mode:** STRICT READ-ONLY INDEPENDENT VERIFICATION  
**Target implementation:** PR #1105 — `cursor/p2214-rental-invoice-list-i18n-3c10`  
**Authoritative baseline:** `2538942add64df3aec20bccb29f58d7a138db0bd` (post–P2.2.13)  
**Implementation HEAD (verified):** `6a45f54d586be856e4c4afeca84b30785bf114d4`  
**Audit artifact branch:** `cursor/p2214-final-independent-reaudit-3c10` (audit-only)

---

## 1. Provenance

| Check | Independent result |
|-------|-------------------|
| PR #1105 exists | **YES** |
| PR state | **OPEN** |
| PR draft | **YES** (isDraft: true) |
| Base branch | `cursor/p227b-voice-telephony-test-center-preflight-3c10` |
| Base SHA | `2538942add64df3aec20bccb29f58d7a138db0bd` |
| Head SHA | `6a45f54d586be856e4c4afeca84b30785bf114d4` |
| Baseline is ancestor of HEAD | **YES** (`git merge-base --is-ancestor`) |
| Commit count `2538942a..HEAD` | **1** |
| Exact commits | `6a45f54d` — feat(i18n): P2.2.14 — Rental Invoice List + Filters localization |
| Local HEAD == remote HEAD | **YES** |
| Audit-only branch used as implementation base | **NO** |
| Unrelated commits on implementation branch | **NONE** |

**Ancestry / frozen boundaries:** Baseline `2538942a` is the verified post–P2.2.13 program tip. P2.2.7B–P2.2.13 enforce-clean scoped findings recompute to **0** on implementation HEAD (see §12).

**Verdict:** Provenance **CORRECT**. Wrong provenance is **not** blocking.

---

## 2. Complete Diff Classification

**Command:** `git diff --name-status 2538942a...6a45f54d` — **35 paths**

| Path | Cat |
|------|-----|
| `architecture/I18N_RENTAL_INVOICE_LIST_P2_2_14_2026-08-21.md` | F |
| `docs/audits/i18n-p2-2-14-rental-invoice-list-implementation-2026-08-21.md` | F |
| `frontend/scripts/i18n-hardcoded-scan.mjs` | D |
| `frontend/src/i18n/hardcoded-copy-guard.test.ts` | C/D |
| `frontend/src/i18n/hardcoded-copy-inventory.json` | D |
| `frontend/src/i18n/translations/de.ts` | B |
| `frontend/src/i18n/translations/en.ts` | B |
| `frontend/src/i18n/translations/invoices.list.de.ts` | B |
| `frontend/src/i18n/translations/invoices.list.en.ts` | B |
| `frontend/src/master/components/ArchitekturView.tsx` | F |
| `frontend/src/master/components/ChangesView.tsx` | F |
| `frontend/src/rental/components/invoices/CreateInvoiceDialog.tsx` | A (import-only → detail constants split) |
| `frontend/src/rental/components/invoices/InvoiceDetailHeader.tsx` | A (import-only) |
| `frontend/src/rental/components/invoices/InvoiceFilters.tsx` | A |
| `frontend/src/rental/components/invoices/InvoiceFilters.test.tsx` | C |
| `frontend/src/rental/components/invoices/InvoiceKpiGrid.tsx` | A |
| `frontend/src/rental/components/invoices/InvoiceList.tsx` | A |
| `frontend/src/rental/components/invoices/InvoiceList.test.tsx` | C |
| `frontend/src/rental/components/invoices/InvoiceListMobileCards.tsx` | A |
| `frontend/src/rental/components/invoices/InvoiceListMobileCards.test.tsx` | C |
| `frontend/src/rental/components/invoices/InvoiceListPagination.tsx` | A |
| `frontend/src/rental/components/invoices/InvoiceListTable.tsx` | A |
| `frontend/src/rental/components/invoices/InvoicesPage.tsx` | A |
| `frontend/src/rental/components/invoices/hooks/useInvoices.ts` | A |
| `frontend/src/rental/components/invoices/invoice-detail.constants.ts` | A (detail split — out of P214 boundary) |
| `frontend/src/rental/components/invoices/invoiceConstants.ts` | A |
| `frontend/src/rental/components/invoices/invoiceDetail.mapper.ts` | A (import-only) |
| `frontend/src/rental/components/invoices/invoiceList.util.ts` | A (type import only) |
| `frontend/src/rental/components/invoices/invoiceListLabels.ts` | A |
| `frontend/src/rental/components/invoices/invoiceListLabels.test.ts` | C |
| `frontend/src/rental/components/invoices/invoiceListState.ts` | A |
| `frontend/src/rental/components/invoices/invoiceListState.test.ts` | C |
| `frontend/src/rental/components/invoices/invoiceRelations.mapper.ts` | A (import-only) |
| `frontend/src/rental/components/rental-invoice-list-localization.test.tsx` | C |
| `frontend/src/rental/lib/invoice-list-i18n.ts` | A |

**Category E (business/runtime semantic change): 0**  
**Category G (unrelated/out-of-scope): 0**

No changes to API routes, invoice generation, PDF, payment execution, vendors, insurance, tenant billing, or Master Finance logic.

---

## 3. Exact Production Scope

### P214 enforce-clean boundary (12 paths — verified in scanner, guard, localization test)

1. `rental/components/invoices/InvoicesPage.tsx` — page chrome  
2. `rental/components/invoices/InvoiceList.tsx` — list shell  
3. `rental/components/invoices/InvoiceListTable.tsx` — table rendering  
4. `rental/components/invoices/InvoiceListMobileCards.tsx` — mobile cards  
5. `rental/components/invoices/InvoiceListPagination.tsx` — pagination  
6. `rental/components/invoices/InvoiceFilters.tsx` — filters  
7. `rental/components/invoices/InvoiceKpiGrid.tsx` — KPI grid  
8. `rental/components/invoices/InvoiceKpiCard.tsx` — KPI card (presentational)  
9. `rental/components/invoices/hooks/useInvoices.ts` — list hook (error toast presentation)  
10. `rental/components/invoices/invoiceListLabels.ts` — list label helpers  
11. `rental/components/invoices/invoiceConstants.ts` — machine re-exports only  
12. `rental/lib/invoice-list-i18n.ts` — presentation adapter  

### Additional production files touched (supporting, not broadened scope)

| File | Role | In P214 boundary? |
|------|------|-------------------|
| `invoiceListState.ts` | Filter/sort/url/api param state | Types moved to adapter; logic unchanged |
| `invoiceList.util.ts` | Type import path only | No |
| `invoice-detail.constants.ts` | Detail-only constants split | **Explicitly out of scope** |
| `CreateInvoiceDialog.tsx` | Import path to detail constants | Detail — out of scope |
| `InvoiceDetailHeader.tsx` | Import path | Detail — out of scope |
| `invoiceDetail.mapper.ts` | Import path | Detail — out of scope |
| `invoiceRelations.mapper.ts` | Import path | Detail — out of scope |

### Out-of-scope areas — no implementation leak verified

Vendors, Insurance, Tenant Billing, payment execution, invoice backend generation, PDF generation, accounting exports, Master Finance: **no production changes**.

**Exact production file count (excluding tests, scanner, inventory, docs): 18**

---

## 4. Business / Runtime Semantics

Compared `2538942a` vs `6a45f54d` for list stack:

| Area | Result |
|------|--------|
| Invoice fetching (`useInvoices` → `api.invoices.listItems`) | Unchanged |
| API query params (`buildInvoiceListApiParams`) | Unchanged keys/values |
| URL sync keys (`invQ`, `invStatus`, `invSort`, …) | Unchanged |
| Invoice status machine values | Unchanged (`DRAFT`, `ISSUED`, `OVERDUE`, …) |
| Payment/billing status in list scope | Presentation only via `labelInvoiceListStatus`; raw status in row data unchanged |
| Filter machine values | Unchanged |
| Sort keys / direction | Default `invoiceDate` / `desc` unchanged |
| Pagination | Unchanged |
| IDs, currency codes, cents amounts | Unchanged |
| Effects / callbacks | Unchanged semantics; error toast text localized only |

**BUSINESS/RUNTIME SEMANTIC CHANGES: 0**

---

## 5. Filter Machine-Value Audit

Architecture verified: **machine value → label key → `t(labelKey)` / `ili(locale, key)`**. Select `value={filters.*}` binds machine tokens, not localized labels.

| Filter | Machine before | Machine after | EN label | DE label | API/query effect | Verdict |
|--------|----------------|---------------|----------|----------|------------------|---------|
| Direction | `all`/`outgoing`/`incoming` | same | All directions / Outgoing / Incoming | Alle Richtungen / Ausgehend / Eingehend | `params.direction` when ≠ `all` | **PASS** |
| Status | `all`, `DRAFT`, `ISSUED`, … | same | via `invoices.list.status.*` | via `invoices.list.status.*` | `params.status` when ≠ `all` | **PASS** |
| Type | `all`, `OUTGOING_*`, `INCOMING_*` | same | via `invoices.list.type.*` | via `invoices.list.type.*` | `params.type` when ≠ `all` | **PASS** |
| Document | `all`/`present`/`missing`/`failed` | same | via documentFilter keys | via documentFilter keys | `params.documentStatus` | **PASS** |
| Send | `all`/`QUEUED`/…/`SENT_SIMULATED` | same | via sendFilter keys | via sendFilter keys | `params.sendStatus` | **PASS** |
| Station | station UUID string | same | dynamic name / fallback key | dynamic name / fallback key | `params.stationId` | **PASS** |
| Date range | ISO date strings | same | Von/Bis labels | Von/Bis labels | `dateFrom`/`dateTo` | **PASS** |
| Overdue | boolean | same | chip label localized | chip label localized | `params.overdue=true` | **PASS** |
| Search | string | same | placeholder localized | placeholder localized | `params.search` | **PASS** |
| Sort field | `invoiceDate`, … | same | via sort keys | via sort keys | `params.sortBy` | **PASS** |
| Sort order | `asc`/`desc` | same | Ascending/Descending | Aufsteigend/Absteigend | `params.sortOrder` | **PASS** |

Active filter chips display localized labels but clear handlers reset **machine** state (`onPatchFilters({ status: 'all' })`, etc.). Localization test confirms `value={filters.status}` pattern and `buildInvoiceListApiParams` identity.

---

## 6. Sort Machine-Key Audit

| Sort key | Before | After | Default | Direction | EN label | DE label | Verdict |
|----------|--------|-------|---------|-----------|----------|----------|---------|
| `invoiceDate` | yes | yes | **default** | desc default | Invoice date / Rechnungsdatum | **PASS** |
| `dueDate` | yes | yes | — | — | Due / Fälligkeit | **PASS** |
| `totalGross` | yes | yes | — | — | Amount / Betrag | **PASS** |
| `status` | yes | yes | — | — | Status | **PASS** |
| `createdAt` | yes | yes | — | — | Created / Erstellt am | **PASS** |

Localized labels never become sort keys. Comparator/API semantics unchanged.

---

## 7. Invoice Status

Pattern: raw `status` field → `labelInvoiceListStatus(locale, status)` → `invoices.list.status.{STATUS}`.

- Comparisons/filters/API use raw enum strings (`ISSUED`, `OVERDUE`, …).  
- Badge styling uses `INVOICE_LIST_STATUS_STYLES[status]` keyed by machine value.  
- Unknown status falls back to `DRAFT` label key (presentation only).  

**PASS**

---

## 8. Payment / Billing Status (list presentation)

List scope covers invoice lifecycle status and document/send delivery status — not a separate payment-state machine in the list adapter.

- Document status: `GENERATED`, `SENT`, `FAILED`, … → localized via `labelInvoiceListDocumentStatus`  
- Send status: `QUEUED`, `SENDING`, `SENT`, `FAILED`, … → localized via `labelInvoiceListSendStatus`  
- Raw values preserved in row data and filter state  

No translated payment state enters API/query/persisted state. **PASS**

---

## 9. Amount / Currency / Tax

- `formatInvoiceListAmount(locale, cents, currency)` — cents/100 unchanged; `Intl.NumberFormat` with `de-DE`/`en-US` via `invoiceListFormattingLocale`  
- Currency code parameter unchanged  
- Sort by `totalGross` uses machine key, not formatted string  
- No amount filter logic changed  

**PASS** (presentation formatting only)

---

## 10. Date / Time

- List adapter uses `invoiceListFormattingLocale` → `de-DE` or `en-US` for display  
- Fixed `de-DE` remains in **detail-only** files (`invoiceUtils.ts`, mappers) — out of P214 scope, unchanged  
- Date filter values (`dateFrom`/`dateTo`) remain raw ISO date strings  
- Sort by date fields unchanged  

**PASS**

---

## 11. Blind-Spot Audit

| Metric | Baseline (`2538942a`) | Implementation (`6a45f54d`) |
|--------|----------------------|----------------------------|
| P214 scanner-visible findings | 17 | **0** |
| P214 hidden presentation literals (manual + guard) | ~17+ blind spots closed | **0** |

Manually inspected: filter arrays, sort arrays, status maps, KPI descriptors, table columns, pagination, toast/error strings, aria labels, mobile/desktop surfaces — all routed through `invoice-list-i18n.ts` + `invoices.list.*` keys.

**Target P214 hidden presentation debt = 0 — ACHIEVED**

---

## 12. P214 ENFORCE-CLEAN

`P214_ENFORCE_CLEAN_EXACT` in scanner matches guard test and localization test (12 paths). Verified:

- Every migrated production file included  
- Invoice Detail not in boundary (split to `invoice-detail.constants.ts`)  
- No Finance/Vendor/Master paths included  
- No broad-prefix workaround, new ignores, allowlists, or scanner weakening  

**Recomputed P214 scoped findings: 0**

Previous boundaries on implementation HEAD:

| Phase | Scoped debt |
|-------|-------------|
| P27B | 0 |
| P28 | 0 |
| P29 | 0 |
| P210 | 0 |
| P211 | 0 |
| P212 | 0 |
| P213 | 0 |
| P214 | 0 |

---

## 13. Dictionary Audit

**Reported delta:** 7417 → 7542 (+125) — **independently confirmed**

New module: `invoices.list.en.ts` / `invoices.list.de.ts` — **125 keys each**, 0 orphans, 100% EN/DE parity.

### Key breakdown (125 total)

| Bucket | Count |
|--------|------:|
| Invoice status labels | 14 |
| Invoice type labels | 5 |
| Document/send status + filters | 28 |
| Filter chrome + chips + aria | 36 |
| Table columns | 11 |
| Sort + direction | 8 |
| KPI + pagination + actions + empty/error | 23 |

### Classification

| Class | Count | Notes |
|-------|------:|-------|
| **A** — genuinely new list semantic | **119** | Status/type/document/send enums, list-specific filter chrome, KPI helpers, column headers |
| **B** — justified context-specific list key | **6** | List-scoped filter/table labels where reuse would cross slice boundaries |
| **C** — should reuse `invoice.*` | **0** | No erroneous duplication of detail invoice keys |
| **D** — should reuse common/billing/finance/… | **0** | Six English string matches to `fines.*` (see below) are acceptable cross-slice parallels, not blocking mis-keys |
| **E** — unnecessary semantic duplicate | **0** | |
| **F** — incorrect/misleading translation | **0** | DE copy operational and consistent (Rechnung, MwSt. context N/A in list slice, Überfällig, Versand, etc.) |
| **G** — orphan/unreferenced | **0** | |

**English string parallels (non-blocking reuse candidates):**

- `invoices.list.emptyValue` ↔ `fines.emptyValue` (—)
- `invoices.list.action.aiUpload` ↔ `fines.aiUpload`
- `invoices.list.filters.title` ↔ `fines.filters.title`
- `invoices.list.filters.allStatuses` ↔ `fines.filters.allStatuses`
- (+2 minor generic matches)

**Summary:** existing keys reused at call sites ≈ **4** (`nav.customerInvoices`, etc.); new keys retained **125**; duplicate candidates **6** (style-only); orphans **0**.

**+125 justified:** bounded list surface migrated ~17 scanner findings plus ~45+ hidden literals across filters, KPI grid, table/mobile columns, document/send maps, pagination, and status/type enumerations — consistent with P2.2.12/P2.2.13 adapter pattern.

---

## 14. Key Normalization

Fragmentation review: generic concepts (Filter, Status, Reset, Retry) use list-scoped keys where the list slice owns the surface; machine enums use dedicated `invoices.list.status.*` / `type.*` namespaces — appropriate for enforce-clean ownership.

**Cleanup classification: NOT NEEDED** (optional fines.* string parallels are **NON-BLOCKING**)

---

## 15. EN/DE Copy Quality

Terminology spot-check (Rechnung, Rechnungsnr., Fällig, Überfällig, Versand, Offen, Buchungsrechnung, Filter zurücksetzen): natural operational German and English.

**Classification: STYLE ONLY** (no blocking terminology issues)

---

## 16. Test Quality

### `rental-invoice-list-localization.test.tsx` — **17/17 PASS**

**Grade: STRONG**

Proves: real `LanguageProvider`, production list/filters/page components, EN/DE DOM, machine value preservation, API param identity, locale-aware amount/date formatting, empty/error states, P214 enforce-clean = 0, blind-spot source guards.

### Legacy list unit tests — **8 failures** when run locally

`InvoiceList.test.tsx`, `InvoiceFilters.test.tsx`, `InvoiceListMobileCards.test.tsx` wrap `LanguageProvider` but **do not set locale to `de`** while asserting `de['invoices.list.*']` strings → renders English default.

**Grade for legacy updates: WEAK / MISLEADING**

These failures are **P2.2.14-caused test harness gaps**, not production regressions. Smallest fix: set `localStorage synqdrive.locale = 'de'` or explicit locale prop before render.

---

## 17. Independent Validation

Executed on implementation checkout `6a45f54d`:

| Check | Result |
|-------|--------|
| `rental-invoice-list-localization.test.tsx` | **PASS 17/17** |
| `invoiceListState.test.ts`, `invoiceListLabels.test.ts` | **PASS** |
| Legacy `InvoiceList*.test.tsx`, `InvoiceFilters.test.tsx` | **FAIL 8** (locale not set — see §16) |
| `hardcoded-copy-guard.test.ts` | **PARTIAL** — P214 scope **PASS**; global enforce-clean assertion **FAIL** (2 — see §19) |
| `node scripts/i18n-hardcoded-scan.mjs` | **PASS** (inventory regenerated) |
| `npm run i18n:check` | **FAIL** — exits non-zero due to legacy guard tests expecting global enforce-clean 0 |
| `npm run build` | **PASS** |
| `git diff --check 2538942a...6a45f54d` | **FAIL** — trailing whitespace in 2 markdown docs (cosmetic) |
| Shim inventory | **29 total (18 prod, 11 test)** — unchanged |

---

## 18. Full Metric Recompute

| Metric | Baseline (`2538942a`) | Implementation claim | Independent result |
|--------|----------------------:|---------------------:|-------------------:|
| Global findings | 1832 | 1817 | **1817** ✓ |
| Rental findings | 565 | 550 | **550** ✓ |
| Master findings | 1049 | — | **1049** |
| Operator findings | 158 | — | **158** |
| SHARED findings | 35 | — | **35** |
| SHELL findings | 25 | — | **25** |
| P214 scoped findings | 17 | 0 | **0** ✓ |
| P214 hidden literals | ~17+ | 0 | **0** ✓ |
| Canonical EN | 7417 | 7542 | **7542** ✓ |
| Canonical DE | 7417 | 7542 | **7542** ✓ |
| Parity | 100% | 100% | **100%** ✓ |
| New keys | +125 | +125 | **+125** ✓ |
| Reused keys | ~4 | ~4 | **~4** ✓ |
| Duplicate candidates | — | — | **6** (non-blocking) |
| Orphans | — | 0 | **0** ✓ |
| Shim total | 29 | 29 | **29** ✓ |
| New compat consumers | 0 | 0 | **0** ✓ |
| Category E | 0 | 0 | **0** ✓ |
| Category G | 0 | 0 | **0** ✓ |
| Finance/Billing rental module | 142 | 125 | **125** (−17) ✓ |

Baseline scanner recomputed from pristine worktree @ `2538942a`: global **1832**, enforce-clean **0**.

---

## 19. Scanner Accounting

**P214 delta:** 17 → 0 (Finance/Billing module 142 → 125 = **−17**)

**Global delta:** 1832 → 1817 = **−15** (not −17)

**Proven explanation (not assumed):**

When P214 removed hardcoded German strings from invoice list files, two cross-file deduplicated inventory groups **re-anchored** their primary file:

| Sample | Baseline primary files (included invoice list) | After P214 primary |
|--------|-----------------------------------------------|-------------------|
| `Alle Stationen` | `InvoiceFilters.tsx` + others | `VehiclePickerStep.tsx` (P23 enforce-clean) |
| `Filter zurücksetzen` | `InvoiceFilters.tsx`, `InvoiceList.tsx` + others | `VehiclePickerStep.tsx` (P23 enforce-clean) |

Baseline: these samples counted as **global** findings anchored on invoice list (non–enforce-clean debt).  
After P214: invoice list occurrences removed (−17 scoped); same global samples remain but anchor to **P2.2.3 enforce-clean** paths (+2 enforce-clean summary).

**Net global math:** −17 (P214 list literals) + 2 (re-anchored enforce-clean groups already counted globally but now in enforce-clean bucket) = **−15**.

**Unrelated inventory drift:** `ChangesView.tsx` / `ArchitekturView.tsx` line-number shifts from doc inserts — content-neutral, no net finding change.

---

## 20. Shim / Compat

- No invoice compatibility shim added  
- `invoice-list-i18n.ts` is canonical presentation adapter (not `../i18n/` compat)  
- New compat consumers: **0**  
- Shim total **29** ≤ 29 target  

**PASS**

---

## 21. Documentation Review

Reviewed implementation docs vs code/metrics:

- `docs/audits/i18n-p2-2-14-rental-invoice-list-implementation-2026-08-21.md` — metrics **match** independent recompute; global enforce-clean note **accurate**  
- `architecture/I18N_RENTAL_INVOICE_LIST_P2_2_14_2026-08-21.md` — architecture description **matches** adapter pattern  
- `ChangesView.tsx` / `ArchitekturView.tsx` — updated appropriately  

Minor doc issue: implementation audit claims `git diff --check PASS` — independent run finds trailing whitespace in those markdown files (**cosmetic**).

---

## 22. CI Triage (PR #1105 @ `6a45f54d`)

| Job | Result | Class |
|-----|--------|-------|
| Frontend component tests (`test:legal-documents` / `test:vehicle-detail:unit`) | PASS | — |
| Production build | PASS | — |
| Lint | PASS | — |
| Backend unit tests (one workflow) | FAIL | **B** — pre-existing backend spec signature drift |
| Typecheck | FAIL | **B** — `billing.controller.security.characterization.spec.ts`, `vehicles-security-negative.spec.ts`, `vehicles.controller.status-patch.spec.ts` — unrelated to frontend i18n |
| Playwright E2E (Vehicle Detail) | FAIL | **B/C** — vehicle-detail workflow, not invoice list |
| Accessibility (axe) | PASS | — |

**P2.2.14-caused required CI failures: 0**

---

## 23. Final Metrics Table

| Metric | Baseline | Implementation claim | Independent result |
|--------|----------|---------------------|-------------------|
| Global | 1832 | 1817 | **1817** |
| Rental | 565 | 550 | **550** |
| P214 | 17 | 0 | **0** |
| hidden literals | ~17+ | 0 | **0** |
| Canonical EN | 7417 | 7542 | **7542** |
| Canonical DE | 7417 | 7542 | **7542** |
| Parity | 100% | 100% | **100%** |
| new keys | +125 | +125 | **+125** |
| reused keys | ~4 | ~4 | **~4** |
| duplicate candidates | — | — | **6** |
| orphans | 0 | 0 | **0** |
| Shim | 29 | 29 | **29** |
| new compat consumers | 0 | 0 | **0** |
| Category E | 0 | 0 | **0** |
| Category G | 0 | 0 | **0** |
| Invoice List tests (P214 suite) | — | 17/17 | **17/17 PASS** |
| Legacy list unit tests | — | claimed updated | **8 FAIL** (locale harness) |
| Guard tests (P214 scope) | — | — | **PASS** |
| i18n:check | — | PASS | **FAIL** (legacy global guard) |
| Build | — | PASS | **PASS** |
| git diff --check | — | PASS | **FAIL** (doc trailing WS) |
| business/runtime changes | 0 | 0 | **0** |
| P2.2.14-caused CI failures | — | — | **0** |
| test-quality grade | — | — | **STRONG** (P214) / **WEAK** (legacy) |

---

## 24. Smallest Correction Set (if addressing before merge)

Non-blocking but recommended on PR #1105:

1. **Legacy unit tests** — set locale to `de` in `InvoiceList.test.tsx`, `InvoiceFilters.test.tsx`, `InvoiceListMobileCards.test.tsx` when asserting `de[...]` strings.  
2. **Doc whitespace** — strip trailing whitespace in implementation/architecture markdown (for clean `git diff --check`).  
3. *(Optional follow-up, not P214 scope)* — P2.2.3 `VehiclePickerStep.tsx` enforce-clean debt now visible in global guard after inventory re-anchoring.

---

## 25. Final Verdict

### **B — READY WITH NON-BLOCKING OBSERVATIONS**

**PR #1105 may be marked ready and merged** after optional correction of legacy list unit test locale wiring (§24.1). Core P2.2.14 implementation is architecturally correct:

- Provenance verified  
- Zero business/runtime semantic changes  
- Filter/sort/status machine values preserved  
- P214 enforce-clean = 0; frozen prior phases clean  
- +125 dictionary delta justified and parity-complete  
- No new compat shims  
- Primary P214 localization tests **STRONG** (17/17)  
- Production build passes  
- CI failures are pre-existing/unrelated to P214  

**Not blocking merge:** legacy unit test locale harness (§16), cosmetic doc whitespace, optional fines.* key reuse candidates, global enforce-clean guard surfacing pre-existing P23 shared strings after inventory re-anchoring (§19).

---

**STOP — No merge performed. P2.2.15 not started.**
