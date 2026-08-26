# P2.2.49 — Rental Campaign Entry Pre-Flight (Repaired Topology)

**Date:** 2026-08-26  
**Mode:** Read-only topology repair + finding revalidation  
**Authoritative baseline:** `2dfafe8f8810bf995146e95487792a8e8a5d5897` (merged PR #1318 — P2.2.48)  
**Rejected audit PR:** [#1325](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1325) — **INVALID TOPOLOGY** (based on `main`, 62 commits, 854 files)  
**Reference-only artifact:** `docs/audits/i18n-p2-2-49-rental-campaign-entry-preflight-2026-08-26.md` (#1325)  
**Current main (informational):** `c943cba9f80be2ca97933bc32000337e0bfa2393`

---

## Topology repair statement

PR **#1325 is rejected** for invalid topology. Its findings were used **only as non-authoritative reference**. All merge-critical P249 conclusions below were **independently revalidated** on exact baseline `2dfafe8f` with **no ancestry** from #1325 head `084f72243`, #1325 branch, or current `main`.

**Clean replacement branch:** `cursor/p2249-rental-campaign-entry-preflight-repair-3c10`  
**Clean PR base:** `p239-p238-merge-baseline-3c10` (= `2dfafe8f`)

---

## 1. Authoritative baseline health

Verified on `2dfafe8f` with clean working tree; `rev-list` count before audit commit = **0**; `merge-base` = **2dfafe8f**.

| Metric | #1325 ref | Repaired (independent) |
|--------|-----------|------------------------|
| EN | 8732 | **8732** |
| DE | 8732 | **8732** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| P248 | 0 | **0** |
| P247–P216 | 0 | **0** |
| Global enforce-clean | 0 | **0** |
| i18n suite | ~450 | **450/450 PASS** |
| Shim | 29 | **29** |
| `npm run i18n:check` | PASS | **PASS** |
| `npm run check:surface` | PASS | **PASS** |

**Frozen baseline regression: NONE**

---

## 2. Operator closure

**OPERATOR CLOSURE CONFIRMED** (with deferred cross-campaign residuals)

| Residual | Count | Owner |
|----------|-------|-------|
| AI Upload | 14 | AI Upload / shared ingestion |
| Vehicles/QV | 7 | Vehicle/Fleet + QV |
| Task-create wrapper | 1 | Tasks / Rental |
| Operator-core actionable | **0** | — |

Matches independently certified post-P248 state. No regression at authoritative baseline.

---

## 3. Rental inventory revalidation

| Metric | #1325 | Repaired | Diff |
|--------|-------|----------|------|
| Total project findings | — | **1,469** | — |
| Rental prefix findings | 372 | **372** | **0** |
| Operator prefix | — | 22 | — |

**Reason for match:** Same authoritative baseline SHA; inventory regenerated identically by `i18n:check`.

### Production-reachable Rental surfaces (summary)

| Cluster | Frozen? | Inventory debt | P249 eligible? |
|---------|---------|----------------|----------------|
| Dashboard/nav (P21) | YES | 0 | NO |
| Bookings/customers (P23) | YES | 0 | NO |
| Fleet/vehicle/health (P22) | YES | 0 | DEFERRED (P1.x ops) |
| Invoice list (P214) | YES | 0 | NO |
| Create/send invoice (P221–P222) | YES | 0 | NO |
| Invoice documents panel (P223) | YES | 0 | NO |
| **Invoice detail secondary** | NO | **16** | **YES** |
| Invoice detail primary | NO | ~40+ (mappers/header) | P250 |
| Settings tenant billing | NO | 199 | Different domain |
| Damages | NO | 91+ | DEFERRED (collision) |
| Data Analyse | NO | 32 | Later |
| Users & Roles | NO | 67+ | Later |
| Help Center | NO | 6 | Low leverage |

---

## 4. Forecast target revalidation

**FORECAST TARGET CONFIRMED EXACTLY**

| Field | Value |
|-------|-------|
| Path | `frontend/src/rental/components/invoices/InvoiceDetailSecondary.tsx` |
| Component | `InvoiceDetailSecondary` |
| Route | `/rental` → `currentView=invoices` → `InvoiceDetail` child |
| Parent | `InvoiceDetail.tsx` |
| Mount | Accordion card below primary invoice stack |
| Audience | Rental finance users (`invoices` permission) |
| Data source | `buildInvoiceDetailSecondaryPanel(invoice, provenance, editGate)` |
| Production reachable | **YES** |

Embedded children (secondary-only usage):
- `InvoiceNotes.tsx` — only imported by `InvoiceDetailSecondary`
- `InvoiceTimeline.tsx` — embedded in audit accordion section

---

## 5. P249 boundary (primary vs secondary)

| Area | P249? |
|------|-------|
| Header amounts/status/PDF/actions | **NO** (P250) |
| Relations customer/booking/vehicle | **NO** (P250) |
| Line items / payments UI | **NO** (already keyed) |
| Documents panel | **NO** (P223 frozen) |
| Accordion: description + internal notes | **YES** |
| Accordion: linked tasks + status labels | **YES** |
| Accordion: provenance + copy ID + timeline chrome | **YES** |
| Send/create dialogs | **NO** (P221–P222 frozen) |
| Tenant billing drawers | **NO** (separate product) |

**Split decision: ONE SLICE**

---

## 6. Debt count revalidation

| Metric | #1325 | Repaired |
|--------|-------|----------|
| Secondary cluster inventory | 16 | **16** |
| Visible (TSX host copy) | 16 | **16** |
| Hidden (mapper in boundary) | task status labels | **4** (`invoiceDetailSecondary.mapper.ts`) |
| Fixed-locale (adjacent) | 2 | **2** (`invoiceTimeline.mapper.ts` — used by embedded timeline; **outside** strict enforce-clean, thread in P249 or P250) |
| Machine-display | task status | **4** machine → key |

**Files with inventory hits:** `InvoiceDetailSecondary.tsx`, `InvoiceNotes.tsx`, `InvoiceTimeline.tsx` (16 total).

---

## 7. Financial / tax / status freeze (P249 scope)

**No monetary fields in secondary boundary.** Subtotal, tax, gross, paid, due, currency formatting live in primary header — excluded.

| Field | In P249? | May localize? |
|-------|----------|---------------|
| Amounts / tax / currency | NO | N/A |
| `invoice.description` | YES (display) | **NO** — raw user/backend text |
| `invoice.notes` | YES | **NO** — raw |
| `task.title` | YES | **NO** — raw |
| `task.status` | YES | **MAP ONLY** → TranslationKey |
| Provenance values | YES | **NO** — raw |
| Timeline `event.label/detail` | YES | **NO** — raw backend |
| Invoice internal ID (clipboard) | YES | **NO** — raw |

Payment/invoice status chips: **not in secondary** — no status machine in P249 boundary.

---

## 8. Dynamic data / date / callback freeze

**Dynamic raw:** description, notes, task titles, provenance strings, timeline events, `profileError`-class timeline errors.

**Dates:** Timeline uses `invoiceTimeline.mapper.ts` with fixed `de-DE` formatter — presentation-only locale threading allowed; business predicates unchanged.

| Control | Callback | Mutation |
|---------|----------|----------|
| Save notes | `onSaveNotes(notes)` | API update |
| Copy internal ID | `onCopyInternalId()` | clipboard (toast in parent — out of strict boundary) |
| Accordion/timeline expand | local state | none |

**PDF/document actions:** not in secondary boundary.

---

## 9. Fixed-locale hits (selected boundary + embedded timeline)

| File | Hit |
|------|-----|
| `invoiceTimeline.mapper.ts` | `Intl.DateTimeFormat('de-DE')`, `toLocaleString('de-DE')` |

No fixed-locale in `InvoiceDetailSecondary.tsx`, `InvoiceNotes.tsx`, `InvoiceTimeline.tsx` host strings.

---

## 10. Key reuse / budget (revalidated)

| Classification | Examples |
|----------------|----------|
| EXACT REUSE | `common.save`, `common.cancel` |
| SEMANTIC REUSE | `common.edit`, `common.loading`, copy actions |
| NEW P249 KEY | `rental.invoice.detail.secondary.*` section chrome, task status map |
| MACHINE — MAP ONLY | `DONE`, `IN_PROGRESS`, `CANCELLED`, etc. |
| DYNAMIC — DO NOT TRANSLATE | description, notes, task titles, timeline bodies |

| Metric | #1325 | Repaired |
|--------|-------|----------|
| New keys | 24–28 | **25–29** |
| Reused keys | 4–6 | **4–6** |
| Production files | 4 + adapter | **4 + adapter** (verified) |
| Test files | 1 | **1** |

**Production paths (exact):**
1. `frontend/src/rental/components/invoices/InvoiceDetailSecondary.tsx`
2. `frontend/src/rental/components/invoices/InvoiceNotes.tsx`
3. `frontend/src/rental/components/invoices/InvoiceTimeline.tsx`
4. `frontend/src/rental/components/invoices/invoiceDetailSecondary.mapper.ts`
5. `frontend/src/rental/lib/rental-invoice-detail-secondary-i18n.ts` (new)

---

## 11. Collision / drift / baseline strategy

### Active collision (revalidated)

| PR | Overlap |
|----|---------|
| #1324 Vehicle detail P1.4 | **NONE** |
| #1323 LV REST audit | **NONE** |
| Vehicle/fleet operational (#1320, #1317, #1315) | **NONE** on invoice detail paths |

**Classification: NONE**

### Main drift (P249 paths vs `c943cba9`)

**LOW** — only `InvoiceDetailSecondary.tsx` differs (semantic token classes: `border-gray-*` → `border-border`); no i18n/copy change.

### Baseline strategy

**DIRECT FROM P248 MERGE BASELINE** (`2dfafe8f`)

---

## 12. Candidate ranking (revalidated scores /50)

| Rank | Surface | Score | Business risk |
|------|---------|-------|---------------|
| 1 | **Invoice Detail Secondary** | **46** | 1/5 |
| 2 | Invoice Detail Primary | 42 | 3/5 |
| 3 | Settings Tenant Billing | 38 | 2/5 |
| 4 | Help Center | 28 | 1/5 |
| 5 | Data Analyse | 30 | 2/5 |
| 6 | Users & Roles | 32 | 3/5 |
| 7 | Damages | 34 | 4/5 (DEFERRED) |

---

## 13. P249 selection

**P2.2.49 — Rental Invoice Detail Secondary Localization**

### P249_ENFORCE_CLEAN_EXACT (proposed)

```typescript
const P249_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoiceDetailSecondary.tsx',
  'rental/components/invoices/InvoiceNotes.tsx',
  'rental/components/invoices/InvoiceTimeline.tsx',
  'rental/components/invoices/invoiceDetailSecondary.mapper.ts',
  'rental/lib/rental-invoice-detail-secondary-i18n.ts',
];
```

Excludes: P216–P248, Operator deferred residuals, vehicle/fleet ops, dashboard, invoice primary, dynamic invoice bodies, financial calculations, legal document bodies.

### Adapter / extraction

- **NEW BOUNDED INVOICE PRESENTATION ADAPTER** — `rental-invoice-detail-secondary-i18n.ts`
- **NO STRUCTURAL CHANGE REQUIRED**

### Category E feasibility

**FEASIBLE** — presentation-only; no financial/legal semantic change in boundary.

### Future test contract

EN/DE, same-mount DE↔EN, task status machine preservation, dynamic description/notes/provenance/timeline raw, callback/mutation freeze, no `key={locale}`, a11y, raw-key/machine leakage guards. Money/tax N/A in scope.

---

## 14. Global progress (revalidated)

| Metric | #1325 | Repaired |
|--------|-------|----------|
| Global completion | ~92.7% | **~92.7%** |
| Remaining actionable units | ~1,469 | **~1,469** (inventory findings) |
| Confidence | HIGH | **HIGH** |
| Fixed-locale debt (secondary adjacency) | 2 | **2** |
| Hidden debt | mapper validation in unfrozen primary | unchanged |
| Machine-display debt | task status labels | **4** in boundary mapper |

### Rental campaign forecast

| | Slices |
|---|--------|
| Minimum | 8 |
| Most likely | 12–16 |
| Upper | 22 |

| Planning | Target |
|----------|--------|
| Likely P250 | Invoice Detail Primary (Header + Relations) |
| Likely P251 | Settings Tenant Billing OR invoice payments mapper validation |

---

## Final verdict

# **A — CLEAN PRE-FLIGHT CERTIFIED — P2.2.49 RENTAL INVOICE DETAIL SECONDARY SELECTED**

**P2.2.49 clean pre-flight is authoritative.**

**P2.2.49:** Rental Invoice Detail Secondary Localization  
**CAMPAIGN:** RENTAL  
**OPERATOR STATUS:** CLOSED  
**IMPLEMENTATION NOT STARTED.**

**CLOSE PR #1325 WITHOUT MERGE.**

---

*Repaired audit-only artifact. 1 commit, 1 file, merge-base `2dfafe8f`. No production/dictionary/test/scanner changes.*
