# P2.2.58 — Tenant Billing Add-ons — Final Independent Re-Audit

**Date:** 2026-08-28  
**Auditor mode:** Strict read-only independent verification  
**Implementation PR:** #1386  
**Implementation HEAD:** `b497eacc250f850c88822d3dcd28123a72f3704e`  
**Baseline:** `2a8a1bd1c88d302dee1a5aa9c97a5dccd9ad419f` (P2.2.57 merge)  
**Pre-flight reference:** PR #1382 (not in ancestry)

## Final verdict

**B — READY WITH NON-BLOCKING OBSERVATIONS**

PR #1386 may be marked ready and merged.

P2.2.58 is ready for freeze.

**ACTIVE MOUNTED TENANT BILLING IS COMPLETE.**

**DEAD LEGACY / OTHER FINANCE-BILLING DEBT REMAINS SEPARATE.**

**NEXT CANDIDATE: P2.2.59 — Rental Damages (vehicle damages surfaces)**

---

## 1. Provenance

| Check | Result |
|-------|--------|
| PR #1386 open | YES |
| Draft | YES |
| Merged | NO |
| Mergeable | YES |
| Base OID | `2a8a1bd1c88d302dee1a5aa9c97a5dccd9ad419f` |
| HEAD OID | `b497eacc250f850c88822d3dcd28123a72f3704e` |
| Implementation commits | **1** (`b497eacc2`) |
| Parent | `2a8a1bd1c88d302dee1a5aa9c97a5dccd9ad419f` |
| #1382 ancestry | **NO** (`merge-base --is-ancestor` exit 1) |
| Main drift absorption | **NO** |

---

## 2. Complete diff forensics (15 paths)

| Path | Class |
|------|-------|
| `TenantBillingAddOnsTab.tsx` | A — active Add-ons presentation |
| `rental-tenant-billing-i18n.ts` | B — frontend adapter |
| `billing.types.ts` | C — frontend DTO type |
| `tenant-subscription-overview.dto.ts` | D — backend additive DTO |
| `tenant-subscription-overview.mapper.ts` | E — backend mapper |
| `en.ts` / `de.ts` | F — dictionary |
| `hardcoded-copy-guard.test.ts` / `hardcoded-copy-inventory.json` | G — scanner/governance |
| `rental-tenant-billing-addons-localization.test.tsx` | H — tests |
| `tenant-subscription-overview.mapper.spec.ts` | H — tests |
| `docs/...-implementation-...md` / `architecture/I18N_...md` | I — documentation |
| `ChangesView.tsx` / `ArchitekturView.tsx` | J — bookkeeping |

**Forbidden classes K–R:** all **0**.

---

## 3. Active mount

```
Settings → Billing → billingSubTab=addons → TenantBillingAddOnsTab
  ← useBillingSubscriptionOverview(orgId)
  ← api.billing.orgSubscriptionOverview
  ← resolveAddOnDtos(entitlements)
  ← overview.addOns
```

Single active Add-ons surface confirmed in `BillingTab.tsx`.

---

## 4. Hidden child / mutation surface

`TenantBillingAddOnsTab` has no child hooks, no activation/deactivation, no quantity mutation, no Stripe checkout, no provider portal, no write permission path. Read-only presentation only.

---

## 5. Backend status source — PRIMARY GATE

**EXACT EXISTING MACHINE EXPOSURE**

Baseline `resolveAddOnDtos`:

```ts
statusLabel: ADDON_STATUS_LABELS[addon.status] ?? addon.status
```

Implementation adds only:

```ts
status: addon.status
```

`addon.status` is `BillingEntitlementAccessStatus` from entitlement snapshot. No derivation, conversion, text parsing, or new taxonomy.

---

## 6–7. DTO additive contract & consumers

| Field | Baseline | Final | Changed |
|-------|----------|-------|---------|
| key | ✓ | ✓ | NO |
| name | ✓ | ✓ | NO |
| statusLabel | ✓ | ✓ | NO |
| active | ✓ | ✓ | NO |
| status | — | ✓ additive | NEW |

**Consumers of `overview.addOns` / `TenantSubscriptionAddOnDto`:**
- **Mounted:** `TenantBillingAddOnsTab.tsx` only
- **Tests/fixtures:** localization tests, overview fixtures, mapper spec, overview utils test
- **Backend:** `tenant-subscription-overview.service.ts` (assembly only)

No existing consumer behavior altered by additive field.

---

## 8. Backend mapper filtering

Baseline already had:

```ts
return entitlements.addons.filter((addon) => addon.active).map(...)
```

P258 adds `status` inside `.map` only. **ADD-ON INCLUSION/FILTERING DIFF = ZERO.**

---

## 9–16. Add-on keys, name/status mapping, fallbacks

| Item | Result |
|------|--------|
| Machine keys | `VOICE_AGENT`, `AI_PACKAGE`, `WHATSAPP` — unchanged |
| Known name mapping | `addon.key` → `tenantBilling.addons.key.*` — no backend `name` lookup |
| Unknown name | `PROVIDER_ADDON_X7` / `Provider Add-on X7` → exact raw both locales |
| Raw name `.trim()` | **Harmless presentation sanitation** for unknown keys only; baseline rendered `addon.name` without trim for known keys now bypassed via key mapping. Non-blocking. |
| Status union | `ACTIVE`, `TRIALING`, `GRACE_PERIOD`, `SCHEDULED_CANCEL`, `PAUSED`, `INACTIVE` |
| Known status mapping | `addon.status` → `tenantBilling.addons.status.*` — no `statusLabel` matching |
| Unknown statusLabel | `PROVIDER_STATUS_X7` / `Provider Add-on Status X7` → exact raw |
| Unknown empty label | `statusLabel: ''` → falls back to raw `addon.status` string — does NOT map to ACTIVE/INACTIVE |

---

## 17–20. Active filter, ordering, entitlement

| Item | Result |
|------|--------|
| Active authority | `overview.addOns.filter((addon) => addon.active)` — **identical predicate to baseline** |
| Backend `addon.active` | Unchanged entitlement source |
| Ordering | No sort added; filter→map preserved |
| Entitlement files | **Zero diff** in `billing-entitlements` and snapshot generation |

---

## 21–27. Negative gates & error ownership

| Gate | Result |
|------|--------|
| Commercial | 0 additions |
| Mutation | 0 additions |
| Provider flow | 0 additions |
| Permissions | 0 diff |
| Load error | Title localized; `overviewQuery.error` raw pass-through (`Backend Add-ons Error X7` preserved) |
| Retry | `common.retry` label only; `onRetry` callback unchanged |
| Empty state | Title/body presentation only; same `activeAddOns.length === 0` condition |

---

## 28–30. 12-key inventory & dictionary

All 12 keys present EN+DE, used, in-scope:

1. `tenantBilling.addons.loadErrorTitle` — ErrorState title
2. `tenantBilling.addons.empty.title` — EmptyState title
3. `tenantBilling.addons.empty.body` — EmptyState description
4–6. `tenantBilling.addons.key.{VOICE_AGENT,AI_PACKAGE,WHATSAPP}`
7–12. `tenantBilling.addons.status.{ACTIVE,TRIALING,GRACE_PERIOD,SCHEDULED_CANCEL,PAUSED,INACTIVE}`

Reused: `common.retry`, `tenantBilling.tab.addons` (tab bar, not new).

| Metric | Value |
|--------|-------|
| Baseline EN/DE | 8942 / 8942 |
| Final EN/DE | 8954 / 8954 |
| New | 12 |
| Removed | 0 |
| Changed existing | 0 |
| Unused | 0 |
| Duplicates | 0 |
| Orphans | 0 |
| Parity | 100% |

---

## 31–34. Enforce-clean, adapter, scanner, hidden debt

| Item | Result |
|------|--------|
| P258 enforce-clean (`TenantBillingAddOnsTab.tsx`) | **0** |
| Adapter boundary (`rental-tenant-billing-i18n.ts`) | **BOUNDARY SUFFICIENT** — translation maps + raw fallbacks only |
| Scanner | Global 1407→**1405**, Rental 310→**308**, Finance/Billing 27→**25** (−2 genuine) |
| Scanner weakening | NO |
| Hidden active debt | Migrated (load-error title, empty state); known keys/status no longer use backend German labels in mounted UI |

---

## 35–38. Same-mount test forensics — PRIMARY TEST GATE

### Actual behavior (confirmed)

Test `"preserves active filter and order across DE→EN→DE"` uses `renderAddonsTab()` which:
1. Creates a **new** `document.createElement('div')` and `createRoot`
2. Renders `LanguageProvider` + `TenantBillingAddOnsTab`
3. Calls `cleanup()` → `root.unmount()` + `container.remove()`
4. Repeats for each locale

**Verdict: B — remount-based, NOT true same-mount.**

### Same-mount requirement assessment

**NON-BLOCKING EVIDENCE GAP**

`TenantBillingAddOnsTab` is stateless:
- No `useState` / `useEffect` / `useRef`
- Props only: `overview`, `loading`, `error`, `onRetry`
- Locale affects only `t()` and adapter output

Parent evidence exists:
- P254 `rental-tenant-billing-overview-localization.test.tsx` — true same-mount `BillingTab` + `setLocale`
- P257 `rental-tenant-billing-payment-method-localization.test.tsx` — true same-mount `BillingTab` + `setLocale`, URL `billingSubTab=payment-method` stable

No addons-specific BillingTab same-mount test exists, but sibling tab pattern is proven and P258 component has no local/query/mutation state.

### Optional correction (NOT implemented)

Smallest test-only improvement for #1386 follow-up (non-blocking):

```tsx
// Mount once; switch locale via setLocale; assert addon.key nodes persist
function SameMountAddons() {
  const { setLocale } = useLanguage();
  return (
    <>
      <button data-testid="locale-en" onClick={() => setLocale('en')} />
      <button data-testid="locale-de" onClick={() => setLocale('de')} />
      <TenantBillingAddOnsTab overview={...} ... />
    </>
  );
}
```

Rename existing test to `"preserves active filter and order across locale remounts"` for accuracy.

---

## 39–44. Identity, types, test grades

| Item | Result |
|------|--------|
| React key | `key={addon.key}` — stable |
| Raw DTO identity | `key`, `status`, `active`, raw `name`, raw `statusLabel` unchanged in data |
| Frontend type | `status: string` added consistently |
| Backend DTO type | `status: string` — **STRING IS ACCEPTABLE API DTO BOUNDARY** (non-blocking enum tightening possible) |
| Backend spec grade | **ACCEPTABLE** — proves machine status + field preservation + inactive filter |
| Frontend test grade | **ACCEPTABLE** — known/unknown mapping, raw error, active filter, order, React identity, governance; same-mount naming imprecise |

---

## 45–49. Category E & frozen surfaces

**Category E = 0**

| Freeze scope | Semantic diff |
|--------------|---------------|
| P257 Payment Method | **ZERO** (no paths touched) |
| P256 Invoices | **ZERO** |
| P255 / P254–P216 | **ZERO** |
| Other billing sub-tabs | **ZERO** |

---

## 50–54. Drift, collision, validation, CI

| Item | Result |
|------|--------|
| Main drift | NO |
| Collision (#1383–1385) | NO HIGH/DIRECT overlap on P258 paths |
| P258 frontend tests | PASS (8/8) |
| Backend mapper spec | PASS (2/2) |
| P257 regression | PASS (8/8) |
| P256 regression | PASS (7/7) |
| `npm run i18n:check` | PASS (8954/8954, orphans 0) |
| `npm run check:surface` | PASS |
| Frontend typecheck/build | PASS |
| Backend typecheck (local mapper) | PASS |
| `git diff --check` | PASS (zero output) |
| CI on #1386 | Legal Documents CI + Vehicle Detail CI failed on **unrelated** backend typecheck errors (`vehicles-security-negative.spec.ts`, `billing.controller.security.characterization.spec.ts`) — **P258-caused required failures = 0** |

---

## 55–58. Tenant Billing completion & metrics

### Active mounted sub-tabs (all enforce-clean = 0)

| Sub-tab | Enforce-clean |
|---------|---------------|
| Overview | 0 |
| Tariff & Vehicles | 0 |
| Invoices | 0 |
| Payment Method | 0 |
| Add-ons | 0 |

**ACTIVE MOUNTED TENANT BILLING COMPLETE**

### Dead legacy separation

`rental/components/billing/` scanner: **25 findings**
- **20** in dead legacy cards (`BillingPaymentMethodCard`, `BillingStatusHero`, `BillingSubscriptionCard`, `BillingInvoiceSection`, `BillingInvoiceDetailDrawer`)
- **5** other unmounted billing files

Finance/Billing scanner = 25 is compatible with active mounted Tenant Billing debt = 0 because remaining findings are dead legacy and non-mounted billing surfaces, not active mounted sub-tabs.

### Canonical progress wording

Report **two metrics**:
1. **Active Tenant Billing mounted coverage = 100%** (5/5 sub-tabs)
2. **Global/Rental scanner debt = separate** (1405 global, 308 rental)

Do NOT call Finance/Billing scanner = 0 or global Rental = 100%.

---

## 59–60. P259 discovery

| Rank | Candidate | Findings | Rationale |
|------|-----------|----------|-----------|
| 1 | Rental Damages module | 91 | Core vehicle ops; highest mounted-relevant Rental debt |
| 2 | Users & Roles (Settings) | 67 | Mounted settings surface; medium scope |
| 3 | DocumentsView | 22 | Mounted documents list; bounded single-view scope |

**Selected P2.2.59:** Rental Damages (vehicle damages surfaces)

---

## 61. Claim reconciliation

| Claim | #1386 | Independent | PASS/FAIL |
|-------|-------|-------------|-----------|
| 1 commit | YES | YES | PASS |
| Direct P257 ancestry | YES | YES | PASS |
| 12 keys | YES | YES | PASS |
| 8954/8954 | YES | YES | PASS |
| Scanner 1405/308/25 | YES | YES | PASS |
| P258 enforce-clean = 0 | YES | YES | PASS |
| Machine status additive | YES | YES | PASS |
| Active filter unchanged | YES | YES | PASS |
| Order unchanged | YES | YES | PASS |
| Unknown raw fallbacks | YES | YES | PASS |
| No mutation/provider/commercial | YES | YES | PASS |
| Category E = 0 | YES | YES | PASS |
| Tenant Billing active complete | YES | YES | PASS |
| Tests/build/diff-check | YES | YES | PASS |
| Same-mount wording | implied true same-mount | **remount-based; non-blocking gap** | **OBSERVATION** |

---

## 62–63. Correction threshold

No blocking corrections required. Optional non-blocking: rename remount test; add true same-mount addons test in follow-up.
