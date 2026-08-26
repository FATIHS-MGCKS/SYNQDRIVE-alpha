# P2.2.49 — Rental Campaign Entry Pre-Flight

**Date:** 2026-08-26  
**Mode:** Read-only campaign entry audit / target selection  
**Authoritative baseline:** `2dfafe8f8810bf995146e95487792a8e8a5d5897` (merged PR #1318 — P2.2.48)  
**Current main:** `df6747763b655c5ee12988a5e2806bf47e63b5d0`  
**Operator status:** CLOSED (with deferred cross-campaign residuals)

---

## PART A — P248 Post-Merge Baseline

### Merge provenance (#1318)

| Check | Result |
|-------|--------|
| Merged | **YES** (`mergedAt`: 2026-08-26T18:35:02Z) |
| Closed | **YES** (`state`: MERGED) |
| Merge SHA on main | `2dfafe8f8810bf995146e95487792a8e8a5d5897` |
| Branch implementation HEAD | `110c24026c7bc8abea7a2f371988f7eb46f68b96` |
| Merge strategy | **Squash merge** (single parent `35fba315`; includes feat + doc-whitespace commits) |
| P248 audit conclusions | **Applicable** — content of `110c24026` embedded in merge commit |

### Baseline health (independent at `2dfafe8f`)

| Metric | Expected | Actual |
|--------|----------|--------|
| EN keys | 8732 | **8732** |
| DE keys | 8732 | **8732** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| P248 enforce-clean | 0 | **0** |
| P247–P216 | 0 | **0** |
| Global enforce-clean | 0 | **0** |
| i18n suite | ~450 | **450/450 PASS** |
| Shim | ≤29 | **29** (unchanged) |
| `npm run i18n:check` | PASS | **PASS** |
| `npm run check:surface` | PASS | **PASS** |

**Frozen baseline regression: NONE**

### Topology

| Field | Value |
|-------|-------|
| P249 authoritative baseline | `2dfafe8f8810bf995146e95487792a8e8a5d5897` |
| Commits after P248 on main | **159** |
| Classification | **VALID CAMPAIGN BASELINE BEHIND MAIN** |
| Baseline strategy | **DIRECT FROM P248 MERGE BASELINE** |

Main drift on selected P249 paths vs baseline: **LOW** — `InvoiceDetailSecondary.tsx` has non-semantic theme-token class changes only (`border-gray-*` → `border-border`).

---

## PART B — Operator Closure Confirmation

**OPERATOR CLOSURE CONFIRMED WITH DEFERRED CROSS-CAMPAIGN RESIDUALS**

Post-merge inventory scan (`operator/` prefix): **22 findings** (unchanged from #1321).

| Residual | Count | Owner | Blocker? |
|----------|-------|-------|----------|
| AI Upload (`OperatorAiUploadFlow`, `OperatorAiUploadReview`) | 14 | AI Upload / shared ingestion | NO |
| Vehicles/QV | 7 | Vehicle/Fleet + QV | NO |
| Task-create wrapper (`OperatorTaskCreateForm`) | 1 | Tasks / Rental | NO |
| Operator-core actionable | **0** | — | — |

No new Operator-core debt introduced by P248 merge.

---

## PART C — Rental Production Inventory

**Total Rental inventory findings:** 372 (of 1,469 project-wide)

### Frozen Rental slices (P216–P248 relevant)

| Slice | Surface | Governed? |
|-------|---------|-----------|
| P214 | Invoice list (`InvoicesPage`, filters, KPI, table/cards) | YES |
| P221 | `CreateInvoiceDialog` | YES |
| P222 | `SendInvoiceDialog` | YES |
| P223 | `InvoiceDocuments` panel | YES |
| P21 | Dashboard / nav | YES |
| P22 | Fleet / vehicle / health | YES |
| P23 | Bookings / customers | YES |
| P24 | Tasks / settings (partial) | YES |
| P212 | Fines | YES |
| P215 | Vendor directory | YES |
| P219 | Insurances | YES |
| P220 | Parts & accessories | YES |
| P217 | Booking vehicle picker | YES |
| P218 | Data authorization | YES |
| P25–P29 | Stations, automation, voice, WhatsApp, support | YES |

### Remaining high-debt Rental surfaces (top inventory)

| Surface | Path cluster | Findings | Eligible P249? |
|---------|--------------|----------|----------------|
| Data Analyse | `DataAnalyseView.tsx` | 32 | NO (permission-gated analytics) |
| Vehicle Documents | `DocumentsView.tsx` | 22 | DEFERRED (vehicle collision) |
| Users & Roles | `users-roles/*` | 67+ | Later slice |
| Damages | `damages/*` | 91+ | DEFERRED (vehicle/operator collision) |
| Settings Billing (tenant) | `billing/*` | 199 | Different domain (SynqDrive subscription) |
| Invoice detail unfrozen | `invoices/*` detail | 16+ | **YES** (secondary cluster) |
| Help Center | `HelpCenterView.tsx` | 6 | Low leverage |
| Price Tariffs | `PriceTariffsView.tsx` | med | Later |
| Financial Insights legacy | `FinancialInsightsView.tsx` | 11 | Later |

**Total Rental surfaces audited:** ~28 major route clusters  
**Frozen:** ~18  
**Remaining actionable Rental:** ~10 major clusters  
**Blocked/deferred:** Vehicle documents, damages, fleet operational-state surfaces

---

## PART D — Invoice Deep Audit

### Runtime map

```
/rental → currentView=invoices → FinanceView → InvoicesPage (list, P214 frozen)
  → InvoiceDetail (detail orchestrator)
      ├─ PRIMARY (not P249)
      │    InvoiceDetailHeader — amounts, status chip, PDF, actions
      │    InvoiceRelations — customer/booking/vehicle/vendor links
      │    InvoiceLineItems — keyed (invoiceLineItem.*)
      │    InvoicePayments — keyed (invoicePayment.*)
      │    InvoiceDocuments — P223 frozen
      ├─ SECONDARY (P249 target) — accordion
      │    InvoiceDetailSecondary
      │      ├─ More info: description + InvoiceNotes
      │      ├─ Tasks list (linked tasks)
      │      └─ Audit: provenance + copy internal ID + InvoiceTimeline
      └─ SendInvoiceDialog — P222 frozen (overlay)
```

**Billing drawers (separate product):** `BillingInvoiceDetailDrawer`, `TenantInvoiceDetailDrawer` — tenant SynqDrive subscription billing, NOT rental customer invoices.

### Forecast target resolution

**FORECAST TARGET EXISTS EXACTLY**

| Field | Value |
|-------|-------|
| Component | `InvoiceDetailSecondary.tsx` |
| Route | `/rental` → `invoices` view → detail panel |
| Mount | Child of `InvoiceDetail` below primary stack |
| Parent | `InvoiceDetail.tsx` |
| Audience | Rental finance users (`invoices` read/write) |
| Data source | `buildInvoiceDetailSecondaryPanel(invoice, provenance, editGate)` |

### Primary vs secondary boundary

| Area | Owner | P249? |
|------|-------|-------|
| Header amounts/status/PDF/actions | Primary (`InvoiceDetailHeader`) | NO — P250 |
| Relations (customer/booking/vehicle) | Primary (`InvoiceRelations`) | NO — P250 |
| Line items / payments | Primary (already keyed) | NO |
| Documents panel | P223 frozen | NO |
| Accordion: more info / notes | **Secondary** | **YES** |
| Accordion: linked tasks | **Secondary** | **YES** |
| Accordion: provenance / audit / timeline | **Secondary** | **YES** |

Secondary is independently bounded: single accordion card, no monetary fields, no mutations beyond notes save and clipboard copy.

### Financial semantics (secondary scope)

**No monetary values in secondary boundary.** Financial fields (subtotal, tax, gross, paid, due) live in primary header/KPI — out of P249 scope.

| Field in secondary | Classification | Localize? |
|--------------------|----------------|-----------|
| `invoice.description` | USER/BACKEND DATA | **NO** (raw) |
| `invoice.notes` | USER DATA | **NO** (raw) |
| `task.title` | BACKEND/DYNAMIC | **NO** (raw) |
| `task.status` | MACHINE VALUE | Map → TranslationKey only |
| Provenance values | DYNAMIC DATA | **NO** (raw) |
| `invoice.id` (clipboard) | MACHINE/RAW ID | **NO** |
| Timeline `event.label` | BACKEND DATA | **NO** (raw) |
| Timeline `event.detail` | BACKEND DATA | **NO** (raw) |

### Payment / invoice status (secondary scope)

Secondary does not render invoice payment status chips or filter predicates. Task status machine IDs (`DONE`, `IN_PROGRESS`, `CANCELLED`, etc.) may map to labels only via adapter.

### Fixed-locale findings (secondary cluster)

| File | Issue |
|------|-------|
| `invoiceTimeline.mapper.ts` | `Intl.DateTimeFormat('de-DE', ...)` + `toLocaleString('de-DE')` — **presentation formatter debt** (safe to thread locale) |

No `de-DE` in `InvoiceDetailSecondary.tsx` / `InvoiceNotes.tsx` / `InvoiceTimeline.tsx` host copy.

### Callback / mutation matrix (secondary)

| Control | Callback | Mutation | P249 freeze |
|---------|----------|----------|-------------|
| Save notes | `onSaveNotes(notes)` | API update notes | Identical |
| Copy internal ID | `onCopyInternalId()` | clipboard | Identical (toast in parent — defer toast keys to P250 or include host-only) |
| Edit notes button | local state | none | Identical |
| Accordion expand | local state | none | Identical |
| Timeline expand | local state | none | Identical |

### Key reuse audit (selected)

| Concept | Reuse |
|---------|-------|
| Save / Cancel | `common.save`, `common.cancel` — **EXACT** |
| Copy | `common.copy` or `actions.copy` — **SEMANTIC REUSE** candidate |
| Edit | `common.edit` — **SEMANTIC REUSE** |
| Loading | `common.loading` — **SEMANTIC REUSE** |
| Task status labels | **NEW** `rental.invoice.detail.secondary.taskStatus.*` |
| Section chrome | **NEW** `rental.invoice.detail.secondary.*` |

### Key budget estimate

| | Count |
|---|------|
| New keys | **~24–28** |
| Reused keys | **~4–6** |
| Production files | **4** (+ 1 adapter) |
| Test files | **1** |

**Split decision: ONE SLICE** — secondary accordion cluster is coherent and under 30 keys.

---

## PART E — Candidate Ranking (Top 7)

| Rank | Surface | Score /50 | Business risk | Collision |
|------|---------|-----------|---------------|-----------|
| 1 | **Invoice Detail Secondary** | **46** | 1/5 | NONE |
| 2 | Invoice Detail Primary Header/Relations | 42 | 3/5 | NONE |
| 3 | Settings Tenant Billing tab | 38 | 2/5 | LOW |
| 4 | Help Center | 28 | 1/5 | NONE |
| 5 | Data Analyse | 30 | 2/5 | LOW |
| 6 | Users & Roles | 32 | 3/5 | LOW |
| 7 | Price Tariffs | 26 | 2/5 | NONE |

**Deferred:** Damages (91, HIGH vehicle collision), Vehicle Documents (22, HIGH), Fleet operational surfaces (active P1.x work).

### Forecast vs best alternative

| Candidate | Score |
|-----------|-------|
| Rental Invoice Detail Secondary | **46** |
| Invoice Detail Primary (P250) | 42 |
| Settings Tenant Billing | 38 |

**Forecast confirmed** — secondary is strongest *first* Rental slice: highest campaign leverage after P214/P221–P223, lowest financial risk, exact bounded component exists.

### Campaign entry decision

**A — RENTAL INVOICE DOMAIN**

### Active work exclusion map (relevant)

| PR | Domain | Overlap with P249 |
|----|--------|-------------------|
| #1324 | Vehicle detail P1.4 | **NONE** |
| #1320 | Fleet list/map cutover | **NONE** |
| #1317/#1315 | Vehicle operational contract | **NONE** on invoice paths |
| #1323 | Battery/LV REST audit | **NONE** |
| Audit PRs #1321/#1322 | i18n audits | **NONE** |

**Active collision: NONE**

---

## PART F — P249 Target

### Selected target

**P2.2.49 — Rental Invoice Detail Secondary Localization**

### Exact production boundary

```
frontend/src/rental/components/invoices/InvoiceDetailSecondary.tsx
frontend/src/rental/components/invoices/InvoiceNotes.tsx
frontend/src/rental/components/invoices/InvoiceTimeline.tsx
frontend/src/rental/components/invoices/invoiceDetailSecondary.mapper.ts
frontend/src/rental/lib/rental-invoice-detail-secondary-i18n.ts   (new adapter)
```

**Exclude from P249:** `InvoiceDetailHeader`, `InvoiceRelations`, `InvoiceDetail.tsx` orchestrator toasts, `invoiceDetail.mapper.ts`, billing drawers, line items/payments UI (already keyed), documents (P223).

### Adapter strategy

**NEW BOUNDED INVOICE PRESENTATION ADAPTER** — `rental-invoice-detail-secondary-i18n.ts`

Maps: task status machine IDs → TranslationKey; static section chrome; a11y labels. No financial/tax/payment logic.

### Extraction strategy

**NO STRUCTURAL CHANGE REQUIRED** — wire `useLanguage()` + adapter in existing components.

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

Excludes: P216–P248 frozen surfaces, Operator deferred residuals, vehicle/fleet operational work, invoice primary header/relations, dynamic invoice content bodies, billing tenant domain.

### Category E feasibility

**FEASIBLE** — presentation-only; no financial mutation; machine status → key direction only.

### Future test contract (summary)

EN/DE, same-mount, task status preservation, dynamic description/notes/provenance raw, timeline event labels raw, callback/mutation freeze, no `key={locale}`, money N/A in scope.

### Likely follow-on slices

| Slice | Target |
|-------|--------|
| P250 | Rental Invoice Detail Primary (Header + Relations + mappers) |
| P251 | Settings Tenant Billing chrome OR Invoice payments mapper validation |

---

## PART G — Global Progress Update

| Metric | Value |
|--------|-------|
| Previous completion (post-P248) | **~92.7%** |
| P248 closed actionable units | ~23 |
| Current remaining actionable units | **~1,469** (inventory findings) |
| Rental remaining | **372** |
| Updated global completion | **~92.7%** (P249 not yet implemented) |
| Confidence | **HIGH** |
| Remaining fixed-locale debt (secondary) | 2 hits (`invoiceTimeline.mapper.ts`) |
| Remaining hidden debt | Mapper validation strings in unfrozen invoice primary |
| Remaining machine-display debt | Task status labels in secondary mapper |

### Rental campaign forecast

| | Slices |
|---|--------|
| Minimum | 8 |
| Most likely | 12–16 |
| Upper plausible | 22 |

### Projected global slices to 100%

| | Range |
|---|-------|
| Minimum | 30 |
| Most likely | 34–42 |
| Upper | 48 |

---

## Final Verdict

# **A — GO — P2.2.49 RENTAL INVOICE DETAIL SECONDARY SELECTED**

**P2.2.49:** Rental Invoice Detail Secondary Localization  
**CAMPAIGN:** RENTAL  
**OPERATOR STATUS:** CLOSED  
**RENTAL STATUS:** Campaign begins — first slice selected  
**GLOBAL I18N COMPLETION:** ~92.7%  
**CONFIDENCE:** HIGH  
**REMAINING ACTIONABLE DEBT:** ~1,469 inventory findings  
**PROJECTED SLICES TO 100%:** 34–42 (most likely)

**IMPLEMENTATION NOT STARTED.**

---

*Read-only pre-flight artifact. No production, dictionary, test, or scanner changes.*
