# P2.2.54 — Final Independent Read-Only Re-Audit
## Rental Tenant Billing Read-Only Overview + Shell

**Date:** 2026-08-27  
**Mode:** STRICT READ-ONLY INDEPENDENT VERIFICATION  
**Implementation PR:** [#1359](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1359)  
**Authoritative baseline:** `52837f3a19e2f1ef8ed3b4c81d05e69ea9f12323`  
**Implementation HEAD:** `1667b4a9782d0928dc3043cbf0b8f802644db411`  
**Pre-flight:** PR #1358 (not merged; no ancestry in #1359)

---

## 1. Provenance

| Check | Result |
|-------|--------|
| PR #1359 open | **YES** |
| Draft | **YES** |
| Merged | **NO** |
| Mergeable | **YES** (`MERGEABLE`) |
| Base branch | `p239-p238-merge-baseline-3c10` @ `52837f3a` |
| HEAD | `1667b4a9782d0928dc3043cbf0b8f802644db411` |
| Implementation commits | **1** (`1667b4a97`) |
| Parent commit | `52837f3a19e2f1ef8ed3b4c81d05e69ea9f12323` |
| #1358 ancestry | **NO** (`merge-base --is-ancestor` exit 1) |
| #1357 / #1356 ancestry | **NO** |
| Current-main-only commits | **NO** |

**Topology:** VALID

---

## 2. Diff forensics (17 paths)

| Path | Class | Notes |
|------|-------|-------|
| `BillingTab.tsx` | A — shell | Localized chrome; `overviewHeaderBadge(overview, t)` |
| `TenantSubscriptionTabBar.tsx` | A — shell | `resolveTenantBillingTabLabel` |
| `TenantBillingOverviewTab.tsx` | B — overview | Read-only presentation |
| `TenantBillingProblemPanel.tsx` | B — overview | Host copy only; raw warnings preserved |
| `tenant-billing-navigation.ts` | C — navigation | IDs frozen; deprecated export label→id |
| `rental-tenant-billing-i18n.ts` | D — adapter | New presentation adapter |
| `billing.utils.ts` | D — adapter glue | Locale-threaded formatters only |
| `tenant-billing-overview.utils.ts` | B/D | Optional `t` for badge/invoice fallback |
| `en.ts` / `de.ts` | E — dictionary | +35 `tenantBilling.*` |
| `hardcoded-copy-inventory.json` | F — scanner | −15 findings |
| `rental-tenant-billing-overview-localization.test.tsx` | G — tests | P254 focused |
| `tenant-billing-navigation.test.ts` | G — tests | Updated for ID contract |
| `ChangesView.tsx` / `ArchitekturView.tsx` | I — bookkeeping | |
| Implementation + architecture docs | H — docs | |

**J/K/L/M/N/O/P/Q:** **0** (no pricing, subscription business, provider, mutation, permission, deferred-file, frozen-invoice, or unrelated production changes)

**Untouched (correct):** `billing-stripe-ui.ts`, `billing-overview.adapter.ts` — no diff; no active scanner debt in P254 scope post-implementation.

---

## 3. Deferred / frozen / legacy gates

| Gate | Result |
|------|--------|
| Tariff/Vehicles tab + children | **ZERO file diff** |
| Add-ons / Invoices / PM tabs + children | **ZERO file diff** |
| P253 Line Items | **ZERO diff** |
| P252 Payments | **ZERO diff** |
| P251/P250/P249 | **ZERO diff** |
| `CustomerPaymentsTab` | **ZERO diff** |
| Legacy unmounted billing | **ZERO diff** |

**Deferred tab labels:** Tab bar localizes all five tab *labels* via `resolveTenantBillingTabLabel`; deferred tab *content* files unchanged. This is intended shell scope per pre-flight split.

---

## 4. Subtab consumer inventory (PRIMARY GATE)

**Search:** `TENANT_SUBSCRIPTION_SUB_TABS` — **2 hits**

| Consumer | Mounted? | Usage | Classification |
|----------|----------|-------|----------------|
| `tenant-billing-navigation.ts` | — | Definition; `label: id` | MACHINE ID ONLY |
| `tenant-billing-navigation.test.ts` | Test | Asserts `label === id` | TEST ONLY |

**No production consumer renders `TENANT_SUBSCRIPTION_SUB_TABS[*].label`.**

Active UI uses `TENANT_SUBSCRIPTION_SUB_TAB_IDS` + `resolveTenantBillingTabLabel(tab, t)` in `TenantSubscriptionTabBar.tsx`.

### Subtab API compatibility verdict

**SUBTAB COMPATIBILITY — SAFE**

Deprecated export label change (German → machine id) affects no mounted production consumer. If a future consumer relied on German `.label`, smallest fix would be restoring legacy German values on deprecated export while keeping localized path on IDs + resolver (not required today).

---

## 5. Tab / URL / same-mount

| Check | Result |
|-------|--------|
| Machine IDs | `overview`, `tariff-vehicles`, `addons`, `invoices`, `payment-method` — **UNCHANGED** |
| `billingSubTab` param | **UNCHANGED** |
| Query build/parse | **UNCHANGED** |
| Same-mount test | **STRONG** — single `BillingTab` mount; DE→EN→DE preserves `aria-selected`, URL `billingSubTab=overview`, raw plan/status in DOM |

---

## 6. Raw provider / money / status

| Field | Fixture | Production behavior |
|-------|---------|---------------------|
| `plan.name` | `SynqDrive Enterprise X7` | Rendered raw in overview metric |
| `contract.statusLabel` | `Provider Status X7` | Header prefers `statusLabel` over badge fallback (`BillingTab` L121) |
| `billingIntervalLabel` | `Provider Interval X7` | Rendered raw |
| `warning.message` | `Provider Warning X7` | Rendered raw |
| `availableActions[].label` | `Provider Action X7` | Rendered raw on buttons |
| `money.formatted` | `123,45 € PROVIDER-X7` | Overview breakdown uses `pricing.*.formatted` directly |

**Money fallback:** `formatMoneyCents`/`formatRentalTenantBillingMoney` locale-threaded; cents/currency unchanged. **Test gap:** adapter fallback tested; rendered overview does not explicitly assert `PROVIDER_FORMATTED` in DOM — **NON-BLOCKING EVIDENCE GAP** (fixture values flow through unchanged code paths).

### `resolveOverviewHeaderBadge` truth table (localized path vs `headerBadgeFromSummary`)

| subscriptionStatus | calculationStatus | Baseline label/tone | Impl label/tone (EN path) | Equivalent? |
|--------------------|-------------------|---------------------|----------------------------|-------------|
| PRICE_NOT_CONFIGURED | * | Preis nicht konfiguriert / warning | Price not configured / warning | **YES** (locale) |
| PAST_DUE | OK | Überfällig / critical | Past due / critical | **YES** |
| TRIALING | OK | Testphase / info | Trial / info | **YES** |
| CANCELLED | OK | Gekündigt / neutral | Prepared / warning | **NO** (fallback only) |
| CANCEL_SCHEDULED | OK | Kündigung geplant / warning | Prepared / warning | **NO** (fallback only) |
| ACTIVE | OK | Aktiv / success | Active / success | **YES** |
| other | OK | Vorbereitet / warning | Prepared / warning | **YES** |

**Mitigation:** Backend `resolveContractDto` always sets `statusLabel: STATUS_LABELS[status] ?? status`. Header UI uses `statusLabel ?? headerBadge.label`, so production displays backend label for CANCELLED/CANCEL_SCHEDULED. Gap is fallback-only when `t` is passed and `statusLabel` absent — **non-blocking**.

**Status ownership:** **PRESENTATION MAPPING ONLY** (no new predicates/eligibility).

**Problem predicates:** **UNCHANGED** (`PAST_DUE`, critical warnings, payment-message heuristics).

---

## 7. Adapter classification

| Export | Classification |
|--------|----------------|
| `resolveRentalTenantBillingLocale` | LOCALE RESOLUTION |
| `formatRentalTenantBillingMoney` | MONEY PRESENTATION |
| `formatRentalTenantBillingDate` | DATE PRESENTATION |
| `resolveTenantBillingTabLabel` | TAB LABEL PRESENTATION |
| `resolvePricingModelDisplayLabel` | PRICING MODEL PRESENTATION |
| `resolveInvoiceNumberFallbackLabel` | FALLBACK PRESENTATION |
| `resolveOverviewHeaderBadge` | STATUS PRESENTATION |

**Adapter verdict:** **ACCEPTABLE** (presentation-only; minor fallback parity gap noted above).

---

## 8. +35 key inventory & budget

**Count verified:** exactly **35** `tenantBilling.*` keys in EN (8837−8802).

| Bucket | Keys | Count |
|--------|------|------:|
| Tabs (shell — all 5 sub-tabs) | `tab.*` | 5 |
| Shell chrome | `shell.*`, `a11y.subTabs` | 4 |
| Overview metrics/breakdown | `overview.*` | 15 |
| Problem panel | `problem.*` | 3 |
| Status badge fallbacks | `status.*` | 5 |
| Pricing model display | `pricingModel.*` | 2 |
| Invoice number fallback | `invoice.fallbackNumber` | 1 |

**Reused (not in +35):** `invoiceLineItem.summary.{net,tax,gross}`, `tenantBilling.tab.paymentMethod` (overview metric), `billing.customerPayments.orgMissingTitle`, `common.{retry,loading,noData}`.

### Reuse quality

| Reuse | Verdict |
|-------|---------|
| `billing.customerPayments.orgMissingTitle` | **ACCEPTABLE** — identical org-missing semantics |
| `invoiceLineItem.summary.*` for Net/Tax/Gross | **ACCEPTABLE** — exact financial row labels |
| `billing.section.tablistAria` vs `tenantBilling.a11y.subTabs` | **WEAK** — could have reused; different copy ("Billing sections" vs "SynqDrive subscription sections") |
| `billing.section.subscription` vs `tenantBilling.shell.title` | **WEAK** — different strings/context |

### Key budget reconciliation

| | |
|--|--|
| Pre-flight estimate | ~25–28 (active **scanner findings** in overview scope) |
| Implementation | **35 keys** |
| Delta | **+7 to +10** |

**Explanation:** Pre-flight counted scanner debt strings (~25–28), not full shell key surface. Implementation correctly added **5 tab labels** for entire subscription shell (including deferred tabs), **4 shell keys**, **5 status fallbacks**, and **15 overview keys**. Scanner dropped **15** findings (not 35) because: (1) one key covers multiple call sites, (2) 7 strings reused existing keys, (3) overview intro removed, (4) remaining billing debt lives in deferred tabs (~59 Finance/Billing findings remain).

### Key budget final verdict

**35 KEYS JUSTIFIED — ORIGINAL ESTIMATE TOO LOW**

At gate boundary (≤35 NO-GO not triggered; >32 reassessment passed — all keys map to mounted shell/overview/problem surfaces; no deferred-tab content keys).

---

## 9. Scanner & governance

| Metric | Baseline | Implementation | Δ |
|--------|----------|----------------|---|
| Global | 1453 | **1438** | −15 |
| Rental | 356 | **341** | −15 |
| Finance/Billing | 74 | **59** | −15 |
| P254 enforce-clean (8 paths) | ~16 active | **0** | −16 |

**Scanner weakening:** **NONE** (no ignores/allowlists/exemptions added).  
**Category E:** **0**

---

## 10. Tests & CI

| Suite | Result |
|-------|--------|
| P254 focused (`rental-tenant-billing-overview-localization.test.tsx`) | **PASS** (6) |
| Billing navigation | **PASS** (6) |
| Billing overview utils | **PASS** (11) |
| P253 regression | **PASS** (8) |
| P252 regression | **PASS** (6) |
| `npm run i18n:check` | **PASS** (8837/8837) |
| `npm run check:surface` | **PASS** |
| `npm run build` (frontend) | **PASS** |
| `git diff --check` baseline→HEAD | **PASS** |

**Test quality:** **ACCEPTABLE** (strong same-mount/tab/raw-field coverage; money DOM precedence gap noted).

**CI (#1359):** 4 failed jobs — backend `tsc` errors in `billing.controller.security.characterization.spec.ts`, `vehicles-security-negative.spec.ts`, `vehicles.controller.status-patch.spec.ts`. **Not P254 files. P254-caused CI failures = 0.** Frontend component tests, lint, production build: **PASS**.

**Portal callback:** Zero diff on `useBillingStripeActions` wiring — **sufficient indirect protection**.

---

## 11. Collision & drift

| Check | Result |
|-------|--------|
| Active Billing/Stripe collision | **NONE / LOW** |
| Main drift (#1356 connectivity) on P254 paths | **No HIGH/DIRECT drift** |

---

## 12. Claim reconciliation (selected)

| Claim | PR | Independent | PASS |
|-------|-----|-------------|------|
| 1 commit | YES | YES | ✓ |
| Direct P253 ancestry | YES | YES | ✓ |
| No #1358 ancestry | YES | YES | ✓ |
| Overview/Shell only | YES | YES | ✓ |
| 35 keys | YES | YES (35 exact) | ✓ |
| 8837/8837 | YES | YES | ✓ |
| Scanner −15 | YES | YES | ✓ |
| P254 = 0 | YES | YES | ✓ |
| Tab IDs/query frozen | YES | YES | ✓ |
| Raw provider fields | YES | YES | ✓ |
| money.formatted precedence | YES | YES (code); test gap | ✓* |
| Deferred tabs zero diff | YES | YES | ✓ |
| Adapter acceptable | YES | YES | ✓ |

---

## 13. Progress

| Metric | Value |
|--------|-------|
| Remaining Tenant Billing active debt (approx.) | **~33–38** (deferred tabs) |
| Remaining Rental scanner | **341** |
| Remaining global scanner | **1438** |
| Conservative completion | **~85.3%** |
| Central completion | **~85.5%** |
| Optimistic completion | **~85.7%** |

---

## 14. P255 forecast

**P2.2.55 — Tenant Billing Tariff & Vehicles:** `TenantBillingTariffVehiclesTab`, `TenantTariffSummarySection`, `TenantPricingBreakdownSection`, `TenantBillableVehiclesTable`, `TenantVehicleChangesSection`, `BillingPriceTierLadder`, shared `pricingModelLabel` / tier formatters.

---

## 15. Non-blocking observations

1. **Header-badge fallback:** Localized `resolveOverviewHeaderBadge` omits CANCELLED/CANCEL_SCHEDULED branches present in `headerBadgeFromSummary`; mitigated by API `statusLabel` precedence.
2. **Money DOM test:** Add explicit assert that overview renders provider `formatted` unchanged.
3. **Key budget ceiling:** 35/35 — future slices should prefer reuse aggressively.
4. **CI red:** Backend typecheck failures on branch are pre-existing/unrelated to P254.

---

## 16. Final verdict

# **B — READY WITH NON-BLOCKING OBSERVATIONS**

PR #1359 may be marked ready and merged after optional follow-up on observations (not blocking).

**RENTAL CAMPAIGN STATUS: CONTINUES.**

**NEXT CANDIDATE:**  
**P2.2.55 — Tenant Billing Tariff & Vehicles.**
