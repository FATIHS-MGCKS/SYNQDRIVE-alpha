# P2.2.57 — Tenant Billing Payment Method — Read-Only Pre-Flight

**Date:** 2026-08-28  
**Mode:** STRICT READ-ONLY PRE-FLIGHT  
**Campaign:** RENTAL  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Authoritative baseline:** `9b466c4ac930afe752dcd14a872b320f240537f3` (merged PR #1372 — P2.2.56)  
**P256 implementation HEAD (branch tip):** `1da5df457f7783a4e9e93798005538a0f071497b` (squash-equivalent content; zero diff vs merge on P256 paths)  
**Audit branch:** `cursor/p2257-tenant-billing-payment-method-preflight-3c10`  
**Current `origin/main` at audit:** `ba0bdd621ba96e42abbda8fee442c36849dd5905`

---

## PART A — Post-P256 baseline

### A.1 P256 merge provenance

| Check | Result |
|-------|--------|
| PR #1372 merged | **YES** (`state: MERGED`, `closed: true`) |
| Merge commit SHA | `9b466c4ac930afe752dcd14a872b320f240537f3` |
| Merge strategy | **GitHub squash merge** (single parent `e1fa84ec5cd5cb765acddc972607b4658d85da87`; committer GitHub) |
| Implementation HEAD | `1da5df457f7783a4e9e93798005538a0f071497b` |
| P256 frozen file diff (merge vs impl HEAD) | **ZERO** on `TenantInvoicesSection.tsx`, `TenantInvoiceDetailDrawer.tsx`, `tenant-invoices.utils.ts`, `useBillingInvoiceDetail.ts`, `rental-tenant-billing-i18n.ts` |

### A.2 Baseline health (recomputed @ `9b466c4ac`)

Commands: `npm run i18n:check`, `npm run check:surface` — **PASS**

| Metric | Expected | Actual |
|--------|----------|--------|
| EN keys | 8915 | **8915** |
| DE keys | 8915 | **8915** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| Global scanner | 1413 | **1413** |
| Rental scanner | 316 | **316** |
| Finance/Billing scanner | 33 | **33** |
| P256 enforce-clean | 0 | **0** (inherited) |
| P255A / P255B | 0 | **0** (inherited) |
| P254–P216 | 0 | **0** (inherited) |
| Global enforce-clean remaining | 0 | **0** |
| Category E (baseline) | 0 | **0** |

**Regression:** NONE — proceed.

### A.3 P256 hard freeze certification

Future P257 must produce **zero semantic diff** in:

- `TenantInvoicesSection.tsx`
- `TenantInvoiceDetailDrawer.tsx`
- `tenant-invoices.utils.ts`
- `useBillingInvoiceDetail.ts` (document error ownership: raw provider + host codes)
- `rental-tenant-billing-i18n.ts` invoice adapters only — extend, do not alter invoice semantics
- P256 tests / governance scopes

---

## PART B — Payment Method mount topology

### B.1 Production route (verified)

```
Settings (settingsTab=billing)
  → BillingTab
    → TenantSubscriptionTabBar (billingSubTab=payment-method)
      → TenantBillingPaymentMethodTab
        → useBillingPaymentMethodActions (setDefault, detach)
        → TenantPaymentMethodsSection (presentation + inline actions)
  Data: useBillingPaymentMethods → api.billing.orgPaymentMethods
  Portal: BillingTab → useBillingStripeActions → api.billing.orgStripeCustomerPortal → window.location.assign(url)
  Refresh: onChanged → paymentMethods.reload()
```

**Tab param:** `billingSubTab=payment-method` (`tenant-billing-navigation.ts`)

### B.2 Component classification

| Path | Class |
|------|-------|
| `TenantBillingPaymentMethodTab.tsx` | **ACTIVE MOUNTED** (load error, skeleton, wires actions) |
| `TenantPaymentMethodsSection.tsx` | **ACTIVE MOUNTED** (primary UI) |
| `useBillingPaymentMethodActions.ts` | **MUTATION OWNER** (set default, detach) |
| `useBillingPaymentMethods.ts` | **DATA HOOK** (read-only fetch) |
| `tenant-payment-methods.utils.ts` | **PRESENTATION ADAPTER** (billingState labels, display formatting) |
| `billing-stripe-ui.ts` | **SHARED ACTIVE** (stripe UI state labels/hints; mounted only via `TenantPaymentMethodsSection` in production) |
| `useBillingStripeActions.ts` | **SHARED MUTATION/NAV** (customer portal; owned by `BillingTab`, consumed by payment tab + problem panel) |
| `rental-tenant-billing-i18n.ts` | **ADAPTER EXTENSION TARGET** |
| `BillingPaymentMethodCard.tsx` | **LEGACY DEAD** (0 production imports) |
| `BillingStatusHero.tsx` | **LEGACY DEAD** |
| `BillingSubscriptionCard.tsx` | **LEGACY DEAD** |
| `CustomerPaymentsTab.tsx` | **UNRELATED** (customer rental payments, not tenant SaaS billing) |

---

## PART C — Provider / payment-method DTO

### C.1 `TenantPaymentMethodDto` (actual fields)

| Field | Classification |
|-------|----------------|
| `id` | **IDENTITY** — React key, mutation payload; freeze `pm_provider_X7` |
| `type` (`CARD` / `SEPA_DEBIT` / `OTHER`) | **MACHINE** |
| `typeLabel` | **RAW PROVIDER / HOST API LABEL** — render verbatim |
| `brand` | **RAW PROVIDER DATA** — freeze `visa`; never translate brand |
| `last4` | **RAW PROVIDER DATA** — freeze `4242` digits |
| `expMonth`, `expYear` | **RAW PROVIDER DATA** — freeze; host may wrap with localized “valid until” label only |
| `bankName` | **RAW PROVIDER DATA** |
| `mandateStatusLabel` | **RAW PROVIDER LABEL** — render verbatim after host prefix |
| `isDefault` | **MACHINE** — drives badge + detach eligibility |
| `statusLabel` | **RAW PROVIDER LABEL** — present on DTO but **not rendered** in mounted UI (billingState used instead) |
| `billingState` (`READY` / `MISSING` / `REQUIRES_ACTION` / `FAILED`) | **MACHINE** — drives tone + host label mapping |

`TenantPaymentMethodsDto`: `configured`, `defaultMethodId`, `paymentMethods[]` — machine only.

### C.2 Display ownership (`formatPaymentMethodDisplay`)

| Output | Ownership |
|--------|-----------|
| `title` = `{brand}{ •••• last4}` or `{bankName}{ •••• last4}` | **RAW** concatenation |
| `subtitle` = `typeLabel` | **RAW** |
| `detail` = `Gültig bis MM/YYYY` | **HOST wrapper** around raw expiry — localize wrapper only |
| `detail` = `Mandat: {mandateStatusLabel}` | **HOST prefix** + **RAW** mandate label |
| Fallbacks `Karte`, `Bankkonto` | **HOST** when provider fields null |

### C.3 Raw fixture set (required unchanged)

| Fixture | Baseline behavior |
|---------|-------------------|
| `id` = `pm_provider_X7` | Stable React key; mutation target |
| `brand` = `visa` | Shown raw in title |
| `last4` = `4242` | Shown raw with ` •••• ` prefix |
| `holder` = `Provider Holder X7` | Not in DTO / not rendered |
| `statusLabel` = `Provider Payment Status X7` | Not displayed today |
| `mandateStatusLabel` | Raw after `Mandat:` prefix |
| Portal URL | Opaque; `window.location.assign(res.url)` — never localize |
| Provider error | `getErrorMessage` / `mapBillingLoadError` raw path preserved |

---

## PART D — Mutation / action inventory

### D.1 Action matrix

| Action | Class | Callback | Endpoint | Payload | Permission |
|--------|-------|----------|----------|---------|------------|
| Load payment methods | READ-ONLY | `paymentMethods.reload` | `GET /billing/payment-methods` | org query | `billing.read` |
| Set default | **MUTATION** | `actions.setDefault(id)` | `POST /billing/payment-methods/{id}/set-default` | `{}` + path `paymentMethodId` | `billing.write` |
| Detach / remove | **MUTATION** | `actions.detach(id)` | `DELETE /billing/payment-methods/{id}` | path `paymentMethodId` | `billing.write` |
| Add / update method | **PROVIDER NAV** | `stripeActions.openCustomerPortal()` | `POST /billing/stripe/customer-portal` | `{ returnUrl }` | `billing.write` + stripe configured |
| Open customer portal | **PROVIDER NAV** | same | same | `returnUrl = origin + pathname + ?settingsTab=billing` | same |
| Refresh after mutation | READ-ONLY | `onChanged` → reload | GET payment-methods | — | `billing.read` |

**No confirmation dialog** for detach — direct button click.

**Detach eligibility (frozen):** disabled when `loadingId === method.id` OR (`method.isDefault && paymentMethods.length === 1`).

**Add/update flow:** Stripe Customer Portal only (no SetupIntent UI, no embedded form in this tab). `orgStripeSetupIntent` exists in API but is **not called** from mounted payment-method path.

### D.2 Set-default semantics

- Sets `loadingId` to target `paymentMethodId`
- On success: `onChanged()` refresh; `loadingId` cleared in `finally`
- On error: `mapBillingLoadError(caught)` — may return **raw** API message when not mapped to host codes

### D.3 Detach semantics

- Same `loadingId` pattern
- Error: `getErrorMessage(caught, 'Zahlungsmethode konnte nicht entfernt werden.')` — **raw wins** when present

### D.4 Stripe portal semantics (hard freeze)

| Item | Value |
|------|-------|
| Endpoint | `POST /billing/stripe/customer-portal` |
| Redirect | `window.location.assign(res.url)` |
| Return URL | `${origin}${pathname}?settingsTab=billing` |
| Host errors (no URL / not configured) | German strings in hook today — localize host fallbacks only |
| Locale switch | Must not trigger portal call |

### D.5 Confirmation flow

**None** — no detach confirmation inventory required for P257.

---

## PART E — Raw / error / provider freeze

### E.1 Error ownership

| Surface | Owner | Strategy |
|---------|-------|----------|
| Tab load error (`paymentMethods.error`) | Mixed via `mapBillingLoadError` | Preserve raw when unmapped; host codes for org/permission/network |
| `actionError` (set default) | `mapBillingLoadError` | Same as P256 load errors |
| `actionError` (detach) | `getErrorMessage` + German fallback | Raw API message precedence; localize host fallback only |
| `portalError` | `useBillingStripeActions` | Host fallbacks for not-configured; flatten other errors to host string today — **do not flatten raw** if baseline exposes dynamic text |
| Stripe not configured panel | `billing-stripe-ui` | Host labels/hints only |

### E.2 Empty states

| State | Owner |
|-------|-------|
| No methods configured | Host copy in `TenantPaymentMethodsSection` |
| Stripe `not_configured` | Host `stripeStateLabel` + `stripeStateHint` |
| Setup via portal | Host CTA “Zahlungsmethode hinzufügen” |

### E.3 Status machines

**billingState union:** `READY`, `MISSING`, `REQUIRES_ACTION`, `FAILED`  
→ host label via `paymentMethodBillingStateLabel` + tone via `paymentMethodBillingStateTone` (machine-based, not `statusLabel`).

**Stripe UI state:** `configured` | `prepared` | `not_configured` — machine only.

---

## PART F — Permission / state / same-mount freeze

### F.1 Permissions (repository truth)

| Permission | Usage |
|------------|-------|
| `billing.read` | `BillingTab` gate; without it → `tenantBilling.shell.noAccessTitle` |
| `billing.write` | `canWrite`; controls action buttons, portal, `useBillingPaymentMethodActions` |

`TenantBillingPaymentMethodTab` passes `canUseStripePayments && canWrite` to section for stripe actions.

### F.2 State freeze matrix

| State | Freeze |
|-------|--------|
| `subTab` / URL | `payment-method` preserved on DE→EN→DE |
| `paymentMethods[].id` | unchanged |
| `loadingId` | preserved during locale switch mid-action |
| `portalLoading` | preserved |
| `actionError` / `portalError` | preserved (content may display in new locale only if host-owned) |
| `isDefault` / default badge | machine-driven |
| Selected method for loading | by `method.id` |

### F.3 Same-mount contracts

**Read-only:** Mount `BillingTab` at `billingSubTab=payment-method`; switch DE→EN→DE. Preserve subTab, URL, method IDs, brand, last4, expiry, typeLabel, mandateStatusLabel, isDefault, billingState, permissions, React keys (`key={method.id}` only).

**Mutation:** Start set-default or detach loading (or open portal loading); switch locale. Preserve selected `paymentMethodId`, loading flags, no duplicate requests, no mutation fired by locale alone.

**Callback side-effect gate:** Locale switch must trigger **0** set-default, detach, portal, setup, or refresh calls.

**React identity:** No `key={locale}`, `key={t(...)}`, or `key={translatedLabel}` in P257 paths.

---

## PART G — Key / reuse / split

### G.1 Host copy inventory (active mounted)

**TenantPaymentMethodsSection:** section title/subtitle, header default badge, stripe not-configured panel (label+hint), empty title/body, add button, per-card default badge, billingState badge, attention line, set-default, remove, add/portal buttons, portal loading label.

**TenantBillingPaymentMethodTab:** load error title; reuse `common.retry`.

**tenant-payment-methods.utils.ts:** 4 billingState labels, expiry prefix, mandate prefix, card/bank fallbacks.

**billing-stripe-ui.ts:** 3 stripe state labels + 3 hints (mounted via payment section).

**useBillingPaymentMethodActions.ts:** detach host fallback (1).

**useBillingStripeActions.ts:** 3 portal host error strings (**shared** with problem panel — presentation-only extension).

### G.2 Canonical reuse audit

| Candidate | Classification |
|-----------|----------------|
| `tenantBilling.tab.paymentMethod` | **EXACT** (tab already keyed) |
| `common.retry` | **EXACT** |
| `common.loading` | **EXACT** (portal opening) |
| `common.remove` | **ACCEPTABLE** for “Entfernen” |
| `tenantBilling.problem.openPortal` | **ACCEPTABLE** for “Kundenportal öffnen” |
| `tenantBilling.problem.updatePayment` | **WEAK** for add-method CTA |
| `tenantBilling.invoices.detail.managePaymentMethod` | **WEAK** (invoice context) |
| `bookingPayment.*` | **INCORRECT** (customer booking payments) |
| `customerPayments.*` | **INCORRECT** (payout surface) |

**CustomerPayments reuse risk:** HIGH if `bookingPayment`/`customerPayments` keys used for tenant SaaS billing — use `tenantBilling.paymentMethod.*` namespace only.

### G.3 Scanner debt

| Bucket | Count | Notes |
|--------|------:|-------|
| Visible scanner (active) | **6** | 5× `TenantPaymentMethodsSection`, 1× `TenantBillingPaymentMethodTab` |
| Hidden debt (active) | **~15** | `billing-stripe-ui.ts` (6), `tenant-payment-methods.utils.ts` (~8), hook fallbacks, unscanned JSX strings (title, buttons, empty title, etc.) |
| Dead legacy scanner | **4** | `BillingPaymentMethodCard.tsx` — **exclude from P257** |

### G.4 Projected new keys

| Category | Est. |
|----------|-----:|
| Section chrome + empty + actions | 12–14 |
| billingState machine labels | 4 |
| stripeState labels + hints | 6 |
| Display wrappers (expiry, mandate prefix, fallbacks) | 3–4 |
| Load/action host errors | 2–3 |
| **Total new (after reuse)** | **~20–22** |

**Key budget gate:** ≤20 ideal; 21–26 acceptable — **within acceptable band**.

### G.5 Split options

| Option | Keys | Mutation risk | Verdict |
|--------|------|---------------|---------|
| A — Full Payment Method surface | ~22 | Medium but label-only | **Recommended** |
| B — Read-only presentation first | ~14 | Defers button/error parity | Unnecessary split |
| C — Mutations separate | +split overhead | Low incremental risk | Unnecessary |
| D — Set-default / detach separate | Fragmented UX | High coordination cost | Rejected |
| E — Architectural prerequisite | N/A | Portal hook shared | Manageable in one slice |

### G.6 Split decision

**ONE SLICE — PAYMENT METHOD COMPLETE**

Rationale: Mutations are inline button labels + existing error channels (no confirmation, no payload changes). P256 precedent covers mixed error ownership + action chrome in one bounded slice. Key budget ≤26.

---

## PART H — Implementation boundary

### H.1 Enforce-clean boundary (future P257 exact paths)

```
rental/components/billing/TenantBillingPaymentMethodTab.tsx
rental/components/billing/TenantPaymentMethodsSection.tsx
rental/components/billing/tenant-payment-methods.utils.ts
rental/components/billing/billing-stripe-ui.ts
```

**Touch with care (shared):**

```
rental/components/billing/useBillingPaymentMethodActions.ts  (host fallback only)
rental/components/billing/useBillingStripeActions.ts         (host portal errors only)
rental/lib/rental-tenant-billing-i18n.ts                   (extend adapter)
```

**Explicitly excluded:** `BillingPaymentMethodCard.tsx`, `BillingStatusHero.tsx`, `BillingSubscriptionCard.tsx`, `CustomerPaymentsTab.tsx`, dead invoice components.

No scanner ignores. No allowlists. No exemptions.

### H.2 Adapter strategy

Extend `rental-tenant-billing-i18n.ts`:

- `resolvePaymentMethodBillingStateLabel(state, t)`
- `resolveStripeStateLabel(state, t)` / `resolveStripeStateHint(state, t)`
- Optional `formatPaymentMethodDisplayLocalized(method, t)` — **must keep raw brand/last4/typeLabel/mandateStatusLabel**

**Forbidden in adapter:** permission logic, mutation eligibility, portal URL construction, default selection, detach rules.

### H.3 Category E feasibility

**FEASIBLE = 0** when implementation follows freeze matrices:

- Payment method identity, provider fields, default machine, detach eligibility, mutation payloads, permissions, portal URL, loading state, error ownership — all frozen.

### H.4 Test plan (future implementation)

**Read-only:** DE/EN host copy; raw brand/last4/typeLabel/mandate; billingState machine; same-mount tab; permission visibility; React identity; stripe not-configured panel.

**Mutations:** set-default/detach callback IDs; loadingId preservation; no locale-triggered API calls; raw provider error preservation; portal redirect freeze; shared portal error localization does not alter P254 shell semantics.

**P256 negative:** zero diff on invoice paths.

---

## PART I — Progress / drift / verdict

### I.1 Main drift (baseline → `origin/main` on P257 paths)

| File | Drift |
|------|-------|
| `TenantBillingPaymentMethodTab.tsx` | **LOW** — cosmetic `SkeletonCard` className |
| `TenantPaymentMethodsSection.tsx` | **LOW** — cosmetic surface className |
| `rental-tenant-billing-i18n.ts` | **HIGH on main** (file gutted) — **not on P256 baseline** |

**Classification:** **LOW** for P257 target paths on baseline; main has unrelated regression risk outside baseline.

### I.2 Active collision

Open PRs touching payment-method production paths: **none HIGH/DIRECT**. Recent billing PRs are audit-only (#1371) or merged P256 (#1372). Stale master-admin billing drafts unrelated.

### I.3 Baseline strategy

**DIRECT FROM P256 MERGE BASELINE** (`9b466c4ac930afe752dcd14a872b320f240537f3`)

### I.4 Progress accounting

| Metric | Value |
|--------|------:|
| Global scanner | 1413 |
| Rental scanner | 316 |
| Finance/Billing scanner | 33 |
| Active P257 visible debt | 6 |
| Active P257 hidden debt | ~15 |
| Dead legacy Finance/Billing (excluded) | ~25 |
| Remaining mounted Tenant Billing after P257 | **~2** (`TenantBillingAddOnsTab`) |
| Remaining Rental actionable (post-P257) | **~310** |
| Remaining global actionable (post-P257) | **~1407** |

### I.5 Global completion (methodology: mounted production-slice weighted; not key-count-derived)

| Estimate | Range |
|----------|-------|
| Conservative | **93.0%** |
| Central | **93.5%** |
| Optimistic | **94.0%** |
| Confidence | **HIGH** |

### I.6 Next target forecast

**P2.2.58 — Tenant Billing Add-ons** (`TenantBillingAddOnsTab.tsx`, 2 scanner findings + hidden empty-state copy). Revalidate mount after P257 merge.

---

## FINAL VERDICT

**A — GO — P2.2.57 TENANT BILLING PAYMENT METHOD COMPLETE SELECTED**

**P2.2.57:** Tenant Billing Payment Method — full mounted surface (presentation + inline set-default/detach + portal navigation chrome)

**CAMPAIGN:** RENTAL

**P256 STATUS:** FROZEN

**GLOBAL I18N COMPLETION:** 93.0% – 94.0%  
**Central estimate:** 93.5%

**REMAINING ACTIONABLE DEBT:** ~1407 global / ~310 rental / ~2 tenant-billing mounted (post-P257)

**IMPLEMENTATION NOT STARTED.**

---

## Changes / Architektur

Audit-only pre-flight — **Changes and Architektur not updated** (no implementation).
