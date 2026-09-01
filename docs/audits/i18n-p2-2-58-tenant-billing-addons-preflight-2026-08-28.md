# P2.2.58 — Tenant Billing Add-ons Pre-Flight

**Date:** 2026-08-28
**Mode:** STRICT READ-ONLY PRE-FLIGHT
**Campaign baseline:** `2a8a1bd1c88d302dee1a5aa9c97a5dccd9ad419f` (merged PR #1377 / P2.2.57)
**P257 final HEAD:** `5d82c71271593c2cecd019e0c4468f731b64faba`
**Current main:** `ba0bdd621ba96e42abbda8fee442c36849dd5905`
**P257 final audit:** PR #1381 — verdict A

---

## PART A — Post-P257 Baseline

| Check | Result |
|-------|--------|
| PR #1377 merged | **YES** (`2026-08-28T13:29:50Z`) |
| Merge commit | `2a8a1bd1c88d302dee1a5aa9c97a5dccd9ad419f` ✓ |
| P257 final HEAD | `5d82c71271593c2cecd019e0c4468f731b64faba` ✓ |
| Merge strategy | Squash/merge to campaign base `p239-p238-merge-baseline-3c10` |
| Working tree | **clean** |

### Baseline health (independently verified)

| Metric | Expected | Actual |
|--------|----------|--------|
| EN keys | 8942 | **8942** ✓ |
| DE keys | 8942 | **8942** ✓ |
| Parity | 100% | **100%** ✓ |
| Orphans | 0 | **0** ✓ |
| Global scanner | 1407 | **1407** ✓ |
| Rental scanner | 310 | **310** ✓ |
| Finance/Billing scanner | 27 | **27** ✓ |
| P257 enforce-clean | 0 | **0** ✓ |
| `npm run i18n:check` | PASS | **PASS** |
| `npm run check:surface` | PASS | **PASS** |

No post-P257 regression detected.

---

## PART B — Add-ons Mount Topology

```
Settings → Billing (BillingTab)
  → billingSubTab=addons (tenant-billing-navigation)
  → TenantSubscriptionTabBar (tab label via tenantBilling.tab.addons — already localized)
  → TenantBillingAddOnsTab
      ← overview from useBillingSubscriptionOverview(orgId)
      ← api.billing.orgSubscriptionOverview(orgId)
      ← backend tenant-subscription-overview.service + resolveAddOnDtos(entitlements)
```

| Layer | Component / module | Role |
|-------|-------------------|------|
| Route shell | `BillingTab.tsx` | mounts tab when `subTab === 'addons'` |
| Tab chrome | `TenantSubscriptionTabBar.tsx` | already localized |
| Active tab | `TenantBillingAddOnsTab.tsx` | **sole mounted Add-ons surface** |
| Data hook | `useBillingSubscriptionOverview.ts` | shared read-only overview query |
| API | `api.billing.orgSubscriptionOverview` | GET overview |
| Backend mapper | `resolveAddOnDtos` | maps entitlement snapshot → DTO |

**No dedicated add-on hooks, mutations, or child card components exist.**

---

## PART C — DTO / Commercial Ownership

### Frontend DTO (`billing.types.ts`)

```ts
addOns: Array<{ key: string; name: string; statusLabel: string; active: boolean }>
```

### Backend source (`resolveAddOnDtos`)

| Field | Source | Owner |
|-------|--------|-------|
| `key` | `addon.addonKey` | **MACHINE** (`VOICE_AGENT`, `AI_PACKAGE`, `WHATSAPP`) |
| `name` | `ADDON_LABELS[key] ?? key` | **Backend German host labels** (not provider raw) |
| `statusLabel` | `ADDON_STATUS_LABELS[status] ?? status` | **Backend German host labels** |
| `active` | `addon.active` | **MACHINE boolean** |

### Stable add-on codes (repository truth)

| Machine key | Backend DE label |
|-------------|------------------|
| `VOICE_AGENT` | Sprachassistent |
| `AI_PACKAGE` | KI-Paket |
| `WHATSAPP` | WhatsApp |

### Status machine (backend internal, **not exposed in DTO**)

`ACTIVE`, `TRIALING`, `GRACE_PERIOD`, `SCHEDULED_CANCEL`, `PAUSED`, `INACTIVE`

**DTO gap:** `status` machine is dropped before API response; only German `statusLabel` reaches frontend. P258 adapter should map from machine — **recommend additive DTO field `status`** (exposes existing machine, zero semantic change).

### Not present in mounted Add-ons UI

- price / amount / currency / formattedPrice
- billing interval / quantity / unit
- activation / deactivation CTAs
- provider URLs / checkout / portal
- confirmation dialogs
- search / filter / pagination

**Slice type: READ-ONLY PRESENTATION**

---

## PART D — Pricing / Tax / Currency

**Not applicable** to mounted Add-ons tab. No price or tax display. Category E commercial fields = N/A for P258 scope.

---

## PART E — Status / Entitlement

| Domain | Mounted behavior |
|--------|------------------|
| Entitlement resolution | Backend `billing-entitlements.ts` — unchanged by i18n |
| Frontend filter | `addOns.filter((addon) => addon.active)` — machine boolean |
| Feature flags | Not surfaced in Add-ons tab UI |
| Permissions | Inherited from `BillingTab` `billing.read` gate only; Add-ons tab receives no `canWrite` |

Add-ons tab is visible when user has `billing.read`. No write-gated actions on this tab.

---

## PART F — Mutation / Provider Flows

| Action | Present? |
|--------|----------|
| Activate add-on | **NO** |
| Deactivate / cancel | **NO** |
| Update quantity | **NO** |
| Stripe checkout / portal | **NO** (portal exists on Payment Method tab only) |
| Provider navigation | **NO** |

**Mutation count for P258 = 0**

---

## PART G — Error Ownership

| Error | Source | Classification |
|-------|--------|----------------|
| Load failure title | Host hardcoded DE | **HOST** → localize |
| Load failure description | `overviewQuery.error` string | **RAW BACKEND** → pass through |
| Retry label | Host hardcoded DE | **EXACT REUSE** → `common.retry` |
| Empty state | Host hardcoded DE | **HOST** → localize |

No add-on-specific mutation errors exist.

---

## PART H — Host Copy / Reuse / Key Budget

### Visible scanner debt (`TenantBillingAddOnsTab.tsx`)

| Line | String | Category |
|------|--------|----------|
| 22 | Zusatzmodule konnten nicht geladen werden | TITLE |
| 37 | Noch keine Zusatzmodule aktiv | TITLE |

### Hidden active debt (same file)

| Line | String | Notes |
|------|--------|-------|
| 25 | Erneut versuchen | reuse `common.retry` |
| 38 | Optionale Erweiterungen wie Sprachassistent… | empty body — not in scanner |

### Backend-displayed debt (not scanner-visible)

| Field | Issue |
|-------|-------|
| `addon.name` | German backend labels shown in EN |
| `addon.statusLabel` | German backend labels shown in EN |

### Projected new keys

| Key group | Count |
|-----------|-------|
| `tenantBilling.addons.loadErrorTitle` | 1 |
| `tenantBilling.addons.empty.title` | 1 |
| `tenantBilling.addons.empty.body` | 1 |
| `tenantBilling.addons.key.VOICE_AGENT` (+ AI_PACKAGE, WHATSAPP) | 3 |
| `tenantBilling.addons.status.ACTIVE` (+ 5 others) | 6 |
| **Projected total** | **12** |

**Gate: ≤18 ideal** ✓

### Canonical reuse

| Candidate | Verdict |
|-----------|---------|
| `common.retry` | **EXACT REUSE** |
| `tenantBilling.tab.addons` | **EXACT REUSE** (already used) |
| `bookingPayment.*` / `customerPayments.*` | **INCORRECT** |
| `tenantBilling.paymentMethod.*` | **INCORRECT** |

---

## PART I — Split Decision

| Option | Assessment |
|--------|------------|
| A — FULL ADD-ONS SURFACE | **SELECTED** — single read-only component, no mutations |
| B–F — mutation splits | **NOT REQUIRED** — no mutations exist |
| G — architectural prerequisite | Minor: expose `status` machine in DTO recommended, not blocking |

**SPLIT DECISION: ONE SLICE — ADD-ONS COMPLETE**

---

## PART J — Freeze / Test Strategy

### Enforce-clean boundary (projected)

1. `rental/components/billing/TenantBillingAddOnsTab.tsx`

Adapter additions in `rental-tenant-billing-i18n.ts` (not scanner debt).

### P257 negative certification

P258 must prove zero semantic diff on all P257 paths (payment method, portal, detach, set-default).

### Category E feasibility

**FEASIBLE** — presentation-only; no commercial/mutation/provider semantics in mounted surface.

### Test plan

- DE/EN host copy (load error, empty state)
- Raw `addon.key` preserved; localized name via adapter from machine key
- Raw `overviewQuery.error` pass-through
- Same-mount DE→EN→DE: subTab, order, keys, active filter unchanged
- Locale side effects = 0 (no mutations)
- No `key={locale}` patterns
- P257 enforce-clean regression = 0

---

## PART K — Main Drift / Collision

### Baseline vs main (`2a8a1bd` → `ba0bdd6`)

| Path | Drift |
|------|-------|
| `TenantBillingAddOnsTab.tsx` | **LOW** — CSS class only (`rounded-xl` removed) |
| `BillingTab.tsx` | **HIGH** — reverts P254–P257 shell/payment-method i18n |
| `rental-tenant-billing-i18n.ts` | **HIGH/DIRECT** — **deleted on main** |

**Drift classification: HIGH/DIRECT** (main regresses entire Tenant Billing i18n campaign)

### Baseline strategy

**DIRECT FROM P257 MERGE BASELINE** (`2a8a1bd1c88d302dee1a5aa9c97a5dccd9ad419f`)

Do **not** branch from current main.

### Collision

No HIGH/DIRECT open PR touches `TenantBillingAddOnsTab.tsx`. PR #1378/#1380 connectivity work is unrelated.

---

## PART L — Tenant Billing Completion / Progress

### Active mounted debt per sub-tab (before P258)

| Sub-tab | Status |
|---------|--------|
| Overview | Localized (P254) |
| Tariff & Vehicles | Localized (P255) |
| Invoices | Localized (P256) |
| Payment Method | Localized (P257) |
| **Add-ons** | **~4 host strings + backend DE labels** |

### After P258 (projected)

Mounted active Tenant Billing debt = **0** (dead legacy cards excluded).

### Progress metrics

| Metric | Value |
|--------|-------|
| A. Legacy scanner-debt | ~31.2% cleared (1407 / ~2044 baseline) → **~31.3%** after P258 (−2) |
| B. Mounted-production weighted | ~93.8% → **~100%** of mounted Tenant Billing tabs after P258 |

**Recommended canonical metric:** **B — mounted-production weighted**

### Likely P259

First non–Tenant-Billing mounted Rental surface with highest remaining debt (e.g. Documents, Tasks, or next campaign-ranked module — TBD at P258 closeout).

---

## Active Path Classification

| Path | Classification |
|------|----------------|
| `TenantBillingAddOnsTab.tsx` | **ACTIVE MOUNTED** |
| `BillingTab.tsx` (addons branch) | **SHARED ACTIVE** (mount only; no Add-ons-specific changes needed) |
| `useBillingSubscriptionOverview.ts` | **SHARED ACTIVE** (read-only data) |
| `rental-tenant-billing-i18n.ts` | **COMMERCIAL ADAPTER** (extend) |
| `tenant-billing-navigation.ts` | **SHARED ACTIVE** (tab id only) |
| `BillingPaymentMethodCard.tsx` etc. | **LEGACY DEAD** |
| `ExtrasStep.tsx` / booking extras | **CUSTOMER-PAYMENT RELATED / UNRELATED** |
| `master/BillingPricingTab.tsx` | **UNRELATED** (Master admin catalog) |

---

## FINAL VERDICT

**A — GO — P2.2.58 TENANT BILLING ADD-ONS COMPLETE SELECTED**

P2.2.58: Tenant Billing Add-ons (read-only presentation slice)

CAMPAIGN: RENTAL

P257 STATUS: FROZEN

BASELINE STRATEGY: DIRECT FROM P257 MERGE BASELINE (`2a8a1bd1c88d302dee1a5aa9c97a5dccd9ad419f`)

PROJECTED NEW KEYS: 12

ACTIVE TENANT BILLING AFTER P258: complete (mounted surfaces)

GLOBAL I18N COMPLETION:
- Legacy metric: ~31.3%
- Mounted-production metric: ~100% Tenant Billing tabs

RECOMMENDED CANONICAL METRIC: mounted-production weighted

LIKELY NEXT TARGET: highest-value remaining Rental surface outside Tenant Billing (TBD at implementation closeout)

IMPLEMENTATION NOT STARTED.
