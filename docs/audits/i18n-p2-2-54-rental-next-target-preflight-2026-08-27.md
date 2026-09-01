# P2.2.54 — Rental Next-Target Pre-Flight
## Tenant Billing Localization / Production Hardening

**Date:** 2026-08-27  
**Mode:** STRICT READ-ONLY PRE-FLIGHT  
**Authoritative baseline:** `52837f3a19e2f1ef8ed3b4c81d05e69ea9f12323`  
**Baseline origin:** Merged PR #1355 (P2.2.53)  
**Merged implementation HEAD:** `2ed7ba49c3a84853720e24b1ddb72a318d84757c`  
**Current main SHA:** `05b4b13dbb27c0c4d8a12af4afe9af6324feec3f`  
**Campaign:** RENTAL  
**Frozen:** P216–P253

---

## PART A — P253 Post-Merge Baseline

### 1. P253 Merge Provenance

| Check | Result |
|-------|--------|
| PR #1355 merged | **YES** (`mergedAt: 2026-08-27T19:41:24Z`) |
| PR #1355 closed | **YES** (`state: MERGED`) |
| Merge commit | `52837f3a19e2f1ef8ed3b4c81d05e69ea9f12323` |
| Merged implementation HEAD | `2ed7ba49c3a84853720e24b1ddb72a318d84757c` |
| Merge strategy | **Squash merge** (single merge commit on campaign baseline) |
| Implementation commits in PR | **2** (`7194fe262` implementation + `2ed7ba49c` doc whitespace) |
| Campaign baseline branch | `p239-p238-merge-baseline-3c10` |
| Main relationship | Campaign baseline is **intentionally separate** from `main`; #1356 connectivity work merged on `main` only — **not absorbed** |

**Topology:** VALID

### 2. Baseline Health (verified on `52837f3a`)

| Metric | Result |
|--------|--------|
| EN | **8802** |
| DE | **8802** |
| Parity | **100%** |
| Orphans | **0** |
| P253 enforce-clean | **0** |
| P252–P216 enforce-clean | **0** |
| Global enforce-clean | **0** |
| Scanner total | **1453** |
| Rental scanner findings | **356** |
| `npm run i18n:check` | **PASS** |
| `npm run check:surface` | **PASS** |
| Category E baseline | **0** |

### 3. P253 Freeze Verification

Frozen paths (P253 = 0, must not reopen):

- `frontend/src/rental/components/invoices/InvoiceLineItems.tsx`
- `frontend/src/rental/components/invoices/invoiceLineItems.mapper.ts`
- `frontend/src/rental/lib/rental-invoice-line-items-i18n.ts`

---

## PART B — Rental Residual Ranking

### Scanner summary (RENTAL = 356)

| Category | Count |
|----------|------:|
| TEXT | 225 |
| TITLE | 97 |
| PLACEHOLDER | 15 |
| ARIA | 10 |
| LABEL | 6 |
| FORMAT_LOCALE | 3 |

### Top-7 Rental Target Ranking

| Rank | Surface | Findings | Vis | Debt | Bounded | Biz Safe | Fin Safe | Separable | Testable | Collision | Leverage | **Score** |
|:----:|---------|----------|:---:|:----:|:-------:|:--------:|:--------:|:---------:|:--------:|:---------:|:--------:|:---------:|
| 1 | **Tenant Billing** | 74 | 4 | 4 | 3 | 3 | 2 | 3 | 4 | 4 | 5 | **32** |
| 2 | Damages | 93 | 4 | 5 | 4 | 4 | 5 | 4 | 3 | 4 | 3 | **32** |
| 3 | Data Analyse | 72 | 3 | 4 | 2 | 4 | 3 | 2 | 3 | 4 | 3 | **24** |
| 4 | Users & Roles | 67 | 3 | 4 | 3 | 3 | 5 | 4 | 4 | 4 | 3 | **29** |
| 5 | Invoice Docs residual | 8 | 2 | 1 | 5 | 5 | 5 | 5 | 4 | 5 | 2 | **29** |
| 6 | Help Center | 6 | 2 | 1 | 5 | 5 | 5 | 5 | 5 | 5 | 1 | **29** |
| 7 | Vehicle DocumentsView | 22 | 3 | 3 | 3 | 4 | 4 | 3 | 3 | 4 | 2 | **26** |

**Notes:**
- Damages ties Tenant Billing on total score but has **lower campaign leverage** and was not forecasted as P254.
- Invoice Documents **panel** is enforce-clean (P223); residual 8 is shared upload infrastructure.
- Customer Payments (`CustomerPaymentsTab`) is **already i18n-complete** via `billing.customerPayments.*` — separate from Tenant SaaS billing scope.

### Tenant Billing finding breakdown

| Bucket | Scanner findings | In P254 scope? |
|--------|-----------------:|:--------------:|
| Active mounted Tenant SaaS UI | **~49** | **YES** |
| Legacy unmounted components | **~25** | **NO** (dead code) |
| CustomerPayments (Finance) | **0** (already keyed) | **NO** |

Legacy unmounted (exclude from P254): `BillingStatusHero`, `BillingSubscriptionCard`, `BillingPaymentMethodCard`, `BillingInvoiceSection`, `BillingInvoiceDetailDrawer`, `BillableVehiclesDrawer`.

---

## PART C — Tenant Billing Runtime / Domain Map

### Exact production ownership

**Route:** `Settings` → `settingsTab=billing` → `billingSubTab={overview|tariff-vehicles|addons|invoices|payment-method}`

| Layer | Path / symbol |
|-------|---------------|
| Router | `frontend/src/rental/App.tsx` |
| Mount | `frontend/src/rental/components/SettingsView.tsx` → `BillingTab` |
| Shell | `billing/BillingTab.tsx` |
| Sub-tab nav | `billing/tenant-billing-navigation.ts`, `TenantSubscriptionTabBar.tsx` |
| Overview | `TenantBillingOverviewTab.tsx`, `TenantBillingProblemPanel.tsx` |
| Tariff/vehicles | `TenantBillingTariffVehiclesTab.tsx`, `TenantTariffSummarySection.tsx`, `TenantPricingBreakdownSection.tsx`, `TenantBillableVehiclesTable.tsx`, `TenantVehicleChangesSection.tsx`, `BillingPriceTierLadder.tsx` |
| Add-ons | `TenantBillingAddOnsTab.tsx` |
| Invoices | `TenantBillingInvoicesTab.tsx`, `TenantInvoicesSection.tsx`, `TenantInvoiceDetailDrawer.tsx` |
| Payment method | `TenantBillingPaymentMethodTab.tsx`, `TenantPaymentMethodsSection.tsx` |
| Utils/adapters | `billing.utils.ts`, `billing-stripe-ui.ts`, `billing-load.utils.ts`, `tenant-billing-overview.utils.ts`, `tenant-invoices.utils.ts`, `tenant-payment-methods.utils.ts`, `tenant-tariff-vehicles.utils.ts`, `billing-overview.adapter.ts` |
| Hooks | `useBillingSubscriptionOverview`, `useBillingTariffVehicles`, `useBillingInvoices`, `useBillingPaymentMethods`, `useBillingStripeActions`, `useBillingPaymentMethodActions`, `useBillingInvoiceDetail` |
| API client | `frontend/src/lib/api.ts` → `api.billing.*` |
| Domain types | `frontend/src/rental/types/billing.types.ts`, `frontend/src/lib/billing-domain.ts` |
| Permissions | `billing.read`, `billing.write` via `useRentalOrg().hasPermission` |

**Separate product (NOT Tenant Billing P254):** Finance → `customer-payments` → `CustomerPaymentsTab` (Stripe Connect for rental customer payouts; already localized).

### Sub-surface map

| Bucket | Components | Visible copy | Machine values | Financial risk | Mutation risk |
|--------|------------|--------------|----------------|----------------|---------------|
| A — Overview/header | `BillingTab`, `TenantSubscriptionTabBar`, `TenantBillingOverviewTab` | Heavy DE hardcode | contract status, counts, amounts | **HIGH** (display) | LOW (nav only) |
| B — Plan/subscription | Overview metrics, `TenantTariffSummarySection` | DE + API `plan.name` | `planId`, `status`, `billingInterval` | HIGH | NONE |
| C — Usage/metering | Billable vehicles table, vehicle changes | DE labels | `billableVehicleCount`, tiers | HIGH | NONE |
| D — Pricing summary | `TenantPricingBreakdownSection`, tier ladder | DE + `formatted` money | `cents`, `pricingModel` | HIGH | NONE |
| E — Payment method | `TenantBillingPaymentMethodTab` | DE | brand, last4, billing state | MED | **HIGH** |
| F — Invoice history | `TenantBillingInvoicesTab`, detail drawer | DE status fallbacks | invoice IDs, amounts, dates | MED | LOW (PDF open) |
| G — Tax/address | Minimal in tenant billing UI | — | tax from API `formatted` | MED | NONE |
| H — Plan change/cancel | **Not present** in rental UI | — | — | — | — |
| I — Trial/renewal/past-due | Problem panel, status badges | DE + API `statusLabel` | `PAST_DUE`, `TRIALING` | MED | LOW |
| J — Provider data | Stripe portal, PM display | DE chrome | Stripe IDs, last4, brand | MED | **HIGH** |

### Subscription status inventory

| Machine status | Source | Business use | Visible today | Existing key |
|----------------|--------|--------------|-------------|--------------|
| `ACTIVE` | API / domain | Header badge, problem panel | `Aktiv` (utils) | **NONE** (needs `tenantBilling.status.*`) |
| `TRIALING` | API | Badge | `Testphase` | NONE |
| `PAST_DUE` | API | Problem panel trigger | `Überfällig` | NONE |
| `CANCELLED` | API | Badge | `Gekündigt` | NONE |
| `CANCEL_SCHEDULED` | domain | Badge | `Kündigung geplant` | NONE |
| `PAUSED` | domain | Badge | `Pausiert` | NONE |
| `INCOMPLETE` | domain | Badge | `Unvollständig` | NONE |
| `DRAFT` | domain | — | — | NONE |
| `NONE` | fallback | Empty state | `Kein Abo` | NONE |

**Required direction:** machine status → TranslationKey → visible label. Localized labels must **never** feed entitlements or eligibility.

### Billing intervals

| Machine | Display today | Localize? |
|---------|---------------|-----------|
| `MONTH` / `YEAR` (domain) | API `billingIntervalLabel` (dynamic) | Map machine only if API label absent; prefer API label raw |
| API `contract.billingIntervalLabel` | Shown as-is | **RAW** (backend-owned) |

### Money fields (all frozen — display only)

| Field | Source | Unit | Owner | May localize? |
|-------|--------|------|-------|:-------------:|
| `TenantMoneyDto.cents` | API | cents | backend | NO |
| `TenantMoneyDto.formatted` | API | string | backend | NO (prefer API formatted; locale-thread fallback only) |
| `TenantMoneyDto.currency` | API | ISO | backend | NO |
| `unitPriceCents` (tiers) | API | cents | backend | NO |
| `grossAmount`, `netAmount`, `taxAmount`, `amountDue`, `amountPaid` | API | cents | backend | NO |

**Fixed-locale debt:** `formatMoneyCents` → `Intl.NumberFormat('de-DE')`; `formatDateDe` → `de-DE`. **UNSAFE** for i18n — must delegate to locale-aware adapter.

### Pricing formulas

Tier selection, vehicle counts, proration, tax aggregation are **backend-owned**. Frontend displays API-computed `TenantMoneyDto` values. **P254 must not alter any formula.**

### Provider / dynamic data (remain RAW)

- `plan.name` from API (dynamic product name)
- `statusLabel`, `billingIntervalLabel`, `availableActions[].label` from API
- `warning.message` from API
- Stripe `brand`, `last4`, `expMonth`/`expYear`
- Invoice numbers, hosted/PDF URLs
- Provider error messages from `mapBillingLoadError`

### Mutation action matrix

| Action | Hook | Endpoint | Gated by | P254.1 scope |
|--------|------|----------|----------|:------------:|
| Open Stripe portal | `useBillingStripeActions` | `POST /billing/stripe/customer-portal` | `billing.write` | Labels only (callback frozen) |
| Set default PM | `useBillingPaymentMethodActions` | `POST .../set-default` | `billing.write` | **EXCLUDE slice 1** |
| Detach PM | `useBillingPaymentMethodActions` | `DELETE .../detach` | `billing.write` | **EXCLUDE slice 1** |
| Open invoice PDF/hosted | `useBillingInvoiceDetail` | GET hosted/pdf | `billing.read` | **EXCLUDE slice 1** |

**No plan change / cancel subscription UI** in rental tenant billing.

---

## PART D — Financial / Subscription / Provider / Mutation Freeze

### Financial freeze matrix (representative)

| Field | Source | Unit | Calc owner | Precision | Rounding | Currency | Localize? | Frozen? |
|-------|--------|------|------------|-----------|----------|----------|:---------:|:-------:|
| `billableVehicleCount` | API | count | backend | int | n/a | n/a | display only | YES |
| `pricing.grossAmount.cents` | API | cents | backend | int | backend | EUR | format only | YES |
| `tier.unitPriceCents` | API | cents | backend | int | backend | EUR | format only | YES |
| `contract.currentPeriodStart` | API | ISO | backend | ms | n/a | n/a | date format only | YES |

### Status / plan / interval freeze

Machine values unchanged. Only host-owned static labels and locale formatters may change.

### Provider / dynamic freeze

IDs, last4, brand, API labels, URLs, provider errors → **RAW** unless host-owned static chrome.

### Mutation freeze

Payload shapes, endpoints, plan codes, price IDs, subscription IDs, redirect targets → **UNCHANGED**.

### Date / period freeze

All timestamps retain raw ISO values; locale may alter `Intl` display only.

---

## PART E — Key / Reuse / Split Decision

### Existing i18n inventory

| Namespace | Keys in EN | Wired in Tenant SaaS UI |
|-----------|----------:|-------------------------|
| `billing.*` | 45 | **1** (`billing.saasOnlyHint`) |
| `billing.customerPayments.*` | 38 | CustomerPayments only (Finance) |
| `billing.section.*` | 4 | **0** (dead — test refs only) |
| `tenantBilling.*` | **0** | — |
| `subscription.*` | **0** in rental billing | — |

**Reuse opportunity:** `billing.section.*` keys exist but are unused — evaluate semantic fit vs new `tenantBilling.*` namespace (prefer new bounded `tenantBilling.*` for SaaS subscription to avoid collision with Connect keys).

### Key budget estimate

| Bucket | New keys (full Tenant SaaS) | Slice 1 (overview+shell) |
|--------|----------------------------:|-------------------------:|
| Shell / tabs / header | 8 | 8 |
| Overview metrics / copy | 20 | 18 |
| Status labels | 12 | 10 |
| Stripe UI chrome | 6 | 4 |
| Problem panel | 5 | 4 |
| Error/empty/loading | 8 | 5 |
| Utils tier labels | 4 | 0 (defer) |
| Tariff tab | 15 | 0 |
| Invoices tab | 12 | 0 |
| Payment method tab | 10 | 0 |
| **Total** | **~50** | **~25–28** |

**Split gate:** Full surface >35 keys + mutation coupling → **SPLIT REQUIRED**.

### Split decision

**SPLIT REQUIRED — OVERVIEW/READ-ONLY FIRST**

Slice 1 (P2.2.54): **Tenant Billing read-only overview + shell**  
Slice 2 (forecast P255): Tariff & vehicles + pricing display  
Slice 3: Invoices history  
Slice 4: Payment method (mutations + portal)

### Read-only vs mutation boundary (P254.1)

**IN SCOPE:**
- `BillingTab` shell (read paths + tab navigation)
- `tenant-billing-navigation.ts` tab labels
- `TenantSubscriptionTabBar`
- `TenantBillingOverviewTab` (display)
- `TenantBillingProblemPanel` (read navigation; portal CTA labels only)
- Presentation adapters: `billing.utils.ts` formatters + status label functions (extract to `rental-tenant-billing-i18n.ts`)
- `billing-stripe-ui.ts` static labels
- `tenant-billing-overview.utils.ts` host-owned labels

**OUT OF SCOPE (P254.1):**
- Legacy unmounted components
- `CustomerPaymentsTab` (already done)
- `TenantBillingTariffVehiclesTab` and children
- `TenantBillingAddOnsTab`
- `TenantBillingInvoicesTab` / detail drawer
- `TenantBillingPaymentMethodTab` / PM mutations
- P253 invoice line items (frozen)

### Financial risk score (0–5)

| Sub-surface | Money | Tax | Tier | Metering | Sub logic | Mutation | Provider |
|-------------|------:|----:|-----:|---------:|----------:|---------:|---------:|
| Overview shell | 3 | 1 | 2 | 2 | 2 | 1 | 2 |
| Tariff/vehicles | 4 | 2 | 4 | 4 | 3 | 0 | 1 |
| Invoices | 3 | 2 | 0 | 0 | 1 | 1 | 2 |
| Payment method | 2 | 0 | 0 | 0 | 1 | **5** | **5** |

### Adapter strategy

**NEW BOUNDED TENANT BILLING PRESENTATION ADAPTER**

Proposed: `frontend/src/rental/lib/rental-tenant-billing-i18n.ts`

Must **not** own: pricing formulas, tier selection, entitlements, status derivation, mutation payloads, provider logic, permissions, metering.

### Formatter strategy

Delegate money/date to locale-aware helpers (pattern: `rental-invoice-line-items-i18n.ts` → `formatInvoiceListAmount`). Replace `formatMoneyCents`/`formatDateDe` fixed `de-DE` with locale-threaded wrappers. Prefer API `TenantMoneyDto.formatted` when present; adapter fallback only.

### Same-mount state inventory

| State | Location | Must preserve on locale switch |
|-------|----------|-------------------------------|
| `subTab` | `BillingTab` | YES |
| Overview query data | hooks | YES |
| Portal loading | `useBillingStripeActions` | YES (if CTA in scope) |
| Invoice drawer | `TenantBillingInvoicesTab` | N/A slice 1 |
| PM action loading | `useBillingPaymentMethodActions` | N/A slice 1 |

### Future same-mount contract

Mount `BillingTab` once; switch DE↔EN. Preserve: subscription ID, plan machine ID, billing interval, cents, currency, vehicle counts, entitlements, callbacks, `subTab`, React identity. Only presentation changes.

### Category E feasibility

**FEASIBLE** for read-only overview slice: presentation-only changes; financial/tax/pricing/metering/subscription/mutation/provider/permission semantics frozen. Payment-method mutations deferred to later slice.

### Collision map

| Source | Classification |
|--------|----------------|
| Open billing/Stripe PRs | **NONE** (preflight/audit only) |
| #1356 connectivity (merged main) | **LOW** — unrelated; cosmetic drift on legacy billing files only |
| #1357 P253 audit | Audit-only; do not merge |
| Active implementation on billing | **NONE** |

**Collision:** **NONE**

### Main drift (baseline vs `origin/main`)

Billing paths: cosmetic Tailwind class changes on **legacy unmounted** files only (`rounded-2xl`, `shadow-*` removed). **Active Tenant* mounted files: ZERO drift.** Do not absorb.

### Baseline strategy

**DIRECT FROM P253 MERGE BASELINE** (`52837f3a`)

---

## PART F — P254 Selection

### Selected target

**P2.2.54 — Rental Tenant Billing Localization / Production Hardening**  
**Slice 1:** Read-only overview + shell (Settings → `billingSubTab=overview`)

### Exact P254.1 production boundary

| Path | Role |
|------|------|
| `billing/BillingTab.tsx` | Shell, permissions, tab routing |
| `billing/tenant-billing-navigation.ts` | Sub-tab IDs + labels |
| `billing/TenantSubscriptionTabBar.tsx` | Tab bar UI |
| `billing/TenantBillingOverviewTab.tsx` | Overview display |
| `billing/TenantBillingProblemPanel.tsx` | Past-due/problem chrome |
| `billing/billing.utils.ts` | Extract presentation helpers |
| `billing/billing-stripe-ui.ts` | Stripe state labels |
| `billing/tenant-billing-overview.utils.ts` | Overview label helpers |
| `billing/billing-overview.adapter.ts` | Adapter glue (if needed) |
| **NEW** `lib/rental-tenant-billing-i18n.ts` | Locale + formatter delegation |

**Estimated:** ~25–28 new `tenantBilling.*` keys, ~8–10 production files, 1 focused localization test.

### P253 / P252–P249 negative contracts

Future implementation must prove zero diff on frozen invoice surfaces (P249–P253).

---

## PART G — Rental / Global Progress

### Remaining Rental findings (post-P253)

| Surface | Findings |
|---------|----------:|
| Tenant Billing (active mounted) | ~49 |
| Damages | 93 |
| Data Analyse | 72 |
| Users & Roles | 67 |
| Invoice Docs residual | 8 |
| Help Center | 6 |
| Other / uncovered | 61 |
| **Total Rental** | **356** |

### Projected slices

| Slice | Est. findings cleared |
|-------|----------------------:|
| P254.1 Tenant Billing overview | ~25–28 |
| P254.2 Tariff & vehicles | ~15 |
| P254.3 Invoices | ~13 |
| P254.4 Payment method | ~8 |
| Remaining Rental (non-billing) | ~290 |

### Global i18n completion (methodology unchanged)

| Metric | Value |
|--------|-------|
| Scanner debt (denominator proxy) | 1453 |
| Hidden actionable debt | 0 (enforce-clean) |
| Closed campaign units | P216–P253 |
| Conservative | **~84.5%** |
| Central estimate | **~85.0%** |
| Optimistic | **~85.5%** |
| Confidence | **HIGH** |

**Delta vs pre-P253:** Marginal (+0.0–0.5% central). P253 closed 3 enforce-clean paths; scanner total unchanged at 1453. No large jump — consistent with reference.

### P255 forecast (do not implement)

After P254.1 overview: **P254.2 Tenant Billing — Tariff & Vehicles** (pricing display, tier ladder, billable vehicles table).

Alternatives if blocked: Invoice Documents residual (8 findings, low risk), Help Center (6 findings, self-contained).

---

## Final Verdict

**B — GO, BUT SPLIT — P2.2.54 TENANT BILLING READ-ONLY OVERVIEW SELECTED**

**P2.2.54:** Rental Tenant Billing — Read-Only Overview & Shell (`Settings` → `settingsTab=billing` → `billingSubTab=overview`)

**CAMPAIGN:** RENTAL

**P253 STATUS:** FROZEN

**GLOBAL I18N COMPLETION:** 84.5% – 85.5%  
**Central estimate:** 85.0%

**REMAINING ACTIONABLE DEBT:** 1453 scanner findings (356 Rental; ~49 Tenant Billing active mounted)

**IMPLEMENTATION NOT STARTED.**

---

## Audit metadata

- **Artifact:** `docs/audits/i18n-p2-2-54-rental-next-target-preflight-2026-08-27.md`
- **Branch:** `cursor/p2254-rental-next-target-preflight-3c10`
- **Base:** `52837f3a19e2f1ef8ed3b4c81d05e69ea9f12323`
- **Changes / Architektur updated:** NO (read-only pre-flight)
