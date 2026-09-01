# P2.2.56 — Tenant Billing Invoices Pre-Flight

**Date:** 2026-08-28  
**Mode:** STRICT READ-ONLY TARGET VALIDATION  
**Campaign:** RENTAL i18n Production Hardening  
**Baseline:** `e1fa84ec5cd5cb765acddc972607b4658d85da87` (merged PR #1368 / P2.2.55B)  
**Implementation HEAD (P255B):** `ff31011fce989600be3c1a70d5acaae9adbb60f7`  
**Frozen:** P216–P255  
**Verdict:** **A — GO — P2.2.56 TENANT BILLING INVOICES LIST + DETAIL SELECTED**

---

## PART A — Post-P255 Baseline

### P255 merge provenance

| Check | Result |
|-------|--------|
| PR #1368 merged | **YES** (`mergedAt`: 2026-08-28T08:06:33Z) |
| PR #1368 closed | **YES** |
| Merge commit | `e1fa84ec5cd5cb765acddc972607b4658d85da87` |
| Implementation HEAD | `ff31011fce989600be3c1a70d5acaae9adbb60f7` |
| Tree identity | **IDENTICAL** (`git diff e1fa84ec..ff31011` = empty) |
| Merge strategy | **Squash merge** (single parent `20eb441f`, PR title in message) |

### Baseline health (independent run on `e1fa84ec`)

| Metric | Expected | Independent |
|--------|----------|-------------|
| EN keys | 8885 | **8885** |
| DE keys | 8885 | **8885** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| Global scanner | 1421 | **1421** |
| Rental scanner | 324 | **324** |
| Finance/Billing (Rental) | 42 | **42** |
| P255A enforce-clean | 0 | **0** |
| P255B enforce-clean | 0 | **0** |
| P254–P216 | 0 | **0** |
| Global enforce-clean | 0 | **0** |
| `npm run i18n:check` | PASS | **PASS** |
| `npm run check:surface` | PASS | **PASS** |

**Regression:** NONE — baseline healthy.

### P255 hard freeze

Future P256 must not alter these surfaces (verified present and localized at baseline):

- `TenantBillingTariffVehiclesTab.tsx`
- `TenantTariffSummarySection.tsx`
- `TenantPricingBreakdownSection.tsx`
- `BillingPriceTierLadder.tsx`
- `TenantBillableVehiclesTable.tsx`
- `TenantVehicleChangesSection.tsx`
- `tenant-tariff-vehicles.utils.ts`
- `rental-tenant-billing-i18n.ts` (P254/P255A/P255B exports frozen)

---

## PART B — Invoice Mount Topology

```
Settings → Billing (`BillingTab`)
  └─ `billingSubTab=invoices` (URL param via `tenant-billing-navigation.ts`)
      └─ `TenantBillingInvoicesTab` (thin wrapper, `data-testid="tenant-invoices-tab"`)
          └─ `TenantInvoicesSection` (list UI + local filter/search/pagination state)
              └─ `TenantInvoiceDetailDrawer` (detail + payments, on row click)
                  ├─ `useBillingInvoiceDetail` (detail/payments API + document URLs)
                  └─ `useInvoiceDocumentAction` (open hosted/PDF)
```

**Data hook (parent):** `useBillingInvoices(orgId)` in `BillingTab.tsx`  
**API:** `api.billing.orgInvoices`, `orgInvoiceDetail`, `orgInvoicePayments`, `orgInvoiceHosted`, `orgInvoicePdf`

---

## PART C — Candidate Path Classification

| Path | Classification | Notes |
|------|----------------|-------|
| `TenantBillingInvoicesTab.tsx` | **ACTIVE MOUNTED** | Wrapper only, no host copy |
| `TenantInvoicesSection.tsx` | **ACTIVE MOUNTED** | Primary list surface — major host copy |
| `TenantInvoiceDetailDrawer.tsx` | **ACTIVE MOUNTED** | Primary detail drawer — 9 scanner findings |
| `tenant-invoices.utils.ts` | **ACTIVE MOUNTED** | Presentation helpers — **hidden German debt** |
| `useBillingInvoiceDetail.ts` | **ACTIVE MOUNTED** | Document action errors — **hidden German debt** |
| `useBillingInvoices.ts` | **ACTIVE MOUNTED** | Query hook only, no host copy |
| `BillingInvoiceSection.tsx` | **LEGACY DEAD** | Zero importers; duplicate of list UI |
| `BillingInvoiceDetailDrawer.tsx` | **LEGACY DEAD** | Only imported by dead `BillingInvoiceSection` |
| `invoices/*` (rental customer invoices) | **UNRELATED** | Separate Finance → Invoices module (P221–P225 frozen) |
| `master/components/billing/*` | **UNRELATED** | Master admin billing, out of RENTAL campaign scope |

### Duplicate/legacy relationship

`BillingInvoiceSection` + `BillingInvoiceDetailDrawer` are **older SaaS-invoice prototypes** using `BillingInvoiceDto`. The active tenant path uses `TenantInvoiceListItemDto` / `TenantInvoiceDetailDto`. Scanner still attributes **7 list findings** to dead `BillingInvoiceSection` (string deduplication); **P256 must not localize dead paths**.

---

## PART D — List Domain (`TenantInvoicesSection`)

### List DTO (`TenantInvoiceListItemDto`)

| Field | Classification | Display | Freeze |
|-------|----------------|---------|--------|
| `id` | RAW IDENTITY | key only | unchanged |
| `invoiceNumber` | RAW IDENTITY | nullable raw | unchanged |
| `invoiceNumberLabel` | RAW IDENTITY | primary number column | exact DE/EN |
| `invoiceDate` | DATE | `formatDateDe` → migrate to `formatRentalTenantBillingDate` | ISO raw |
| `periodStart` / `periodEnd` | DATE | formatted range | ISO raw |
| `status` | MACHINE | filter/query only | unchanged |
| `statusLabel` | PROVIDER TEXT | via `resolveTenantInvoiceStatusLabel` | raw precedence |
| `netAmount` | MONEY | `.formatted` raw | unchanged |
| `taxAmount` | MONEY | `.formatted` raw | unchanged |
| `grossAmount` | MONEY | `.formatted` raw | unchanged |
| `amountDue` / `amountRemaining` | MONEY | `formatOpenAmount` → `.formatted` | unchanged |
| `dueDate` / `paidAt` | DATE | formatted | ISO raw |
| `hasPdf` / `hasHostedInvoice` | HOST FLAGS | `PDF` / `Online` badges | labels only |

### Filters / search / sort / pagination

| Concern | Repository truth |
|---------|------------------|
| Default query | `page=1`, `pageSize=20`, `sort=-invoiceDate` |
| Status filter machines | `''`/`undefined`, `DRAFT`, `OPEN`, `OVERDUE`, `PAID`, `VOID` |
| Search | debounced 300ms → `query.search` (invoice number) |
| Sort UI | none exposed (server default only) |
| Pagination | `page`, `meta.totalPages`, prev/next buttons |

**Filter freeze:** `<option value>` uses machine strings only; labels may localize.

### Host copy — list (inventory)

- Title, count label (`{n} von {total} Rechnungen`), updating hint
- Load error + retry
- Search placeholder
- Status filter labels (6)
- Empty title + filtered hint
- 11 column headers
- Document badges (`PDF`, `Online`)
- Pagination chrome (`Zurück`, `Weiter`, `Seite X von Y`)

---

## PART E — Detail Domain (`TenantInvoiceDetailDrawer`)

### Detail DTO extensions (`TenantInvoiceDetailDto`, payments)

| Field | Classification | Freeze |
|-------|----------------|--------|
| `amountPaid` | MONEY (formatted) | raw precedence |
| `voidedAt` | DATE | ISO raw |
| `lines[]` | LINE ITEMS | description raw; amounts `.formatted` |
| `lines.description` | PROVIDER TEXT | exact |
| `lines.quantity`, `unitAmount`, `grossAmount` | MONEY/qty | formatted precedence |
| `payments.payments[]` | PAYMENT HISTORY | amount `.formatted`; `providerLabel` raw |
| `payment.status` | MACHINE | unchanged |
| `payment.statusLabel` | PROVIDER TEXT | raw precedence via `resolvePaymentStatusLabel` |
| `payment.refundedAmount` | MONEY | formatted |
| `failedAttempts[]` | PROVIDER | `safeReason` raw |
| `creditNotes[]` | not rendered in drawer | N/A |

### Detail drawer state

| State | Owner | Freeze |
|-------|-------|--------|
| `selected` invoice row | `TenantInvoicesSection` `useState` | preserve on locale switch |
| `open` | `!!selected` | must not close on locale switch |
| URL/query | **not synced** to invoice ID | N/A |
| List query | `useBillingInvoices` in `BillingTab` | preserve filters/page |

### Actions (read-only + navigation)

| Action | Mutation? | Freeze |
|--------|-----------|--------|
| Row click → open drawer | no | unchanged |
| Hosted invoice open | API fetch URL → `window.open` | URL unchanged |
| PDF open | API fetch URL → `window.open` | URL unchanged |
| Manage payment method | navigates sub-tab | unchanged |
| Retry loads | refetch only | unchanged |

**No invoice payment execution or credit-note mutation in this surface.**

---

## PART F — Money / Tax / Status / Provider Freeze

### Money precedence

All list/detail money uses `TenantMoneyDto.formatted` directly (or `formatOpenAmount` which prefers formatted).  
**Fixture:** `1.234,56 € PROVIDER-X7` must display exactly when `.formatted` present.  
Fallback locale formatting only when formatted absent (via existing `resolveTenantBillingMoneyDisplay` pattern).

### Financial / tax / payment hard freeze

| Domain | P256 rule |
|--------|-----------|
| Subtotal/net/tax/gross/due/remaining/paid | **display only** — no recalculation |
| Tax rates/amounts | backend `.formatted` only |
| Payment status predicates | machine `FAILED`, `amountRemaining.cents` — unchanged |
| Overdue display | `resolveTenantInvoiceStatusLabel` may derive overdue from `OPEN` + `dueDate` — **frozen behavior** |

### Status machines

| Machine | Filter | Fallback label (utils) |
|---------|--------|------------------------|
| `DRAFT` | yes | Entwurf |
| `OPEN` | yes | Offen |
| `OVERDUE` | yes (server filter) | Überfällig |
| `PAID` | yes | Bezahlt |
| `VOID` | yes | Storniert |
| `UNCOLLECTIBLE` | no filter | Uneinbringlich |

**Label precedence:** `statusLabel` from API wins when non-empty; else machine fallback map.

### Critical presentation debt — `tenantInvoiceStatusTone`

Current tone logic matches **German substrings in display labels** (`bezahlt`, `überfällig`, etc.).  
P256 **must migrate tone to machine-status-based mapping in adapter** while preserving DE visual outcomes.  
**Do not** use translated label strings for filter predicates (already machine-safe).

### P253 line-item reuse

Tenant billing drawer uses **simple inline line rendering**, not `InvoiceLineItems.tsx`.  
Reuse P253 keys for **labels only**:

| P253 key | Reuse for tenant drawer |
|----------|-------------------------|
| `invoiceLineItem.summary.net/tax/gross` | field labels — **EXACT** |
| `invoiceLineItem.summary.outstanding` | "Offen" field — **EXACT** |
| `invoiceLineItem.section.title` | "Positionen" — **ACCEPTABLE** |
| `invoiceLineItem.mobile.qtyTimesPrice` | qty × price pattern — **WEAK** (gross not net) |

Line descriptions remain **raw provider text**.

---

## PART G — Reuse / Key Budget

### Canonical reuse candidates

| Key / family | Quality | Use |
|--------------|---------|-----|
| `common.retry` | EXACT | all retry buttons |
| `common.back` / `common.next` | EXACT | pagination |
| `tenantBilling.tariff.pagination.pageOf` | EXACT | page indicator |
| `invoices.list.filters.allStatuses` | ACCEPTABLE | "Alle Status" |
| `invoices.list.col.invoiceNumber/date/dueDate` | ACCEPTABLE | table columns |
| `invoiceLineItem.summary.*` | EXACT | money field labels |
| `tenantBilling.tab.invoices` | EXACT | already used in tab bar |
| `tenantBilling.invoice.fallbackNumber` | EXACT | existing fallback |

### Projected new keys (ACTIVE P256 only)

| Group | Count |
|-------|------:|
| `tenantBilling.invoices.list.*` (title, count, search, empty, columns not reused, doc badges) | ~10 |
| `tenantBilling.invoices.status.*` (machine fallbacks DRAFT/OPEN/PAID/VOID/OVERDUE/UNCOLLECTIBLE) | ~6 |
| `tenantBilling.invoices.paymentStatus.*` (machine fallbacks) | ~6 |
| `tenantBilling.invoices.detail.*` (drawer chrome, sections, actions, errors) | ~8 |
| `tenantBilling.invoices.document.*` (hook errors) | ~2 |

**Projected total: ~22 new keys** (ideal ≤24 gate)  
With conservative reuse: **18–24**; worst case without reuse: **~30** (still acceptable).

### Hidden debt (not in scanner today)

| File | Hidden strings |
|------|----------------|
| `tenant-invoices.utils.ts` | 6 invoice + 6 payment status fallbacks + 3 fallbacks |
| `useBillingInvoiceDetail.ts` | 2 document errors |
| `TenantInvoicesSection.tsx` | ~30 host strings (scanner deduped to dead file) |

---

## PART H — Scanner Baseline (Active Paths)

| File | Scanner findings | Active? |
|------|-----------------:|---------|
| `TenantInvoiceDetailDrawer.tsx` | **9** | YES |
| `TenantInvoicesSection.tsx` | **0** (deduped to dead file) | YES — **hidden** |
| `tenant-invoices.utils.ts` | **0** | YES — **hidden** |
| `useBillingInvoiceDetail.ts` | **0** | YES — **hidden** |
| `BillingInvoiceSection.tsx` | 7 | **DEAD — exclude** |
| `BillingInvoiceDetailDrawer.tsx` | 5 | **DEAD — exclude** |

**Active enforce-clean target debt:** ~9 scanner + ~35 hidden ≈ **44 host strings** across 4 active files.

**Projected global scanner delta (active only):** **−9** guaranteed; up to **−16** if dead-file dedup resolves after list localization.

---

## PART I — Split Decision

| Option | Assessment |
|--------|------------|
| A — List only | Leaves drawer with 9 findings + coupled UX |
| B — Detail only | List remains primary entry; poor isolation |
| C — List + Detail combined | **Matches P255B pattern; shared utils/hook** |
| D — Shared prerequisite | Already have `rental-tenant-billing-i18n.ts` adapter |
| E — Legacy cleanup first | Not required for bounded P256 |

**Decision:** **ONE SLICE — TENANT BILLING INVOICES LIST + DETAIL**

---

## PART J — Implementation Boundary

### In scope (production)

1. `TenantInvoicesSection.tsx`
2. `TenantInvoiceDetailDrawer.tsx`
3. `tenant-invoices.utils.ts` (remove German maps; retain machine predicates)
4. `useBillingInvoiceDetail.ts` (document error strings only)
5. `rental-tenant-billing-i18n.ts` (extend — status/payment label + tone helpers)

### Out of scope

- Dead `BillingInvoiceSection` / `BillingInvoiceDetailDrawer`
- Payment Method / Add-ons tabs (P257+)
- Rental customer `invoices/*` module
- Backend / Stripe / PDF generation
- `BillingTab` shell (already localized)

### Adapter strategy

**Extend `rental-tenant-billing-i18n.ts`** (consistent with P254–P255).  
Add: `resolveTenantInvoiceStatusLabel`, `resolvePaymentStatusLabel`, `tenantInvoiceStatusTone` (machine-based), date wrapper usage.  
**Forbidden:** financial computation, overdue predicate changes, URL mutation, action eligibility changes.

### Enforce-clean boundary (future)

```
TenantInvoicesSection.tsx
TenantInvoiceDetailDrawer.tsx
tenant-invoices.utils.ts
useBillingInvoiceDetail.ts
rental-tenant-billing-i18n.ts (P256 exports only)
```

### Category E feasibility

**FEASIBLE = 0** with machine-based tone migration and formatted-money precedence preserved.

### Test plan (future)

**File:** `rental-tenant-billing-invoices-localization.test.tsx`

| Contract | Coverage |
|----------|----------|
| DE/EN chrome | list + drawer |
| Raw fixtures | `INV-X7-2026-0042`, `Provider Invoice Status X7`, `1.234,56 € PROVIDER-X7` |
| Filter/search/page preservation | same-mount `BillingTab` `billingSubTab=invoices` |
| Drawer open + selected ID | survives DE→EN→DE |
| Zero `onQueryChange` on locale switch | required |
| Download actions | URL fetch mocked, labels only change |
| P255 regression | existing tariff-vehicles tests unchanged |

### Main drift (`e1fa84ec` vs `origin/main`)

| Path | Drift |
|------|-------|
| `rental-tenant-billing-i18n.ts` | **HIGH** — deleted on main |
| `TenantInvoicesSection.tsx` | **COSMETIC** (minor) |
| Other P256 paths | **NONE** |

**Baseline strategy:** **DIRECT FROM P255 MERGE BASELINE** (`e1fa84ec`)

### Collision

| Work | Risk |
|------|------|
| Energy Events / workflows PRs | **NONE** on invoice paths |
| Open invoice i18n PR #1337 | **UNRELATED** (rental customer invoices) |
| P255 audit PR #1369 | audit-only |

**HIGH/DIRECT collision:** **NONE**

### Progress / next target

| Metric | Value |
|--------|-------|
| Global actionable | 1421 |
| Post-P256 projection | ~1405–1412 |
| Remaining Tenant Billing after P256 | Payment Method (~11), Add-ons (~2), dead legacy (~12), misc (~8) |
| Completion (conservative – optimistic) | **86.0% – 86.6%** |
| Central estimate | **~86.2%** |
| Next after P256 | **P2.2.57 — Tenant Billing Payment Method** (then Add-ons) |

---

## Final Verdict

**A — GO — P2.2.56 TENANT BILLING INVOICES LIST + DETAIL SELECTED**

```
P2.2.56:
Tenant Billing Invoices — TenantInvoicesSection + TenantInvoiceDetailDrawer
(+ tenant-invoices.utils, useBillingInvoiceDetail document errors, adapter extension)

CAMPAIGN:
RENTAL

P255 STATUS:
FROZEN

GLOBAL I18N COMPLETION:
86.0% – 86.6%
Central estimate: 86.2%

REMAINING ACTIONABLE DEBT:
~1405 (global); ~26 active Tenant Billing after P256

IMPLEMENTATION NOT STARTED.
```
