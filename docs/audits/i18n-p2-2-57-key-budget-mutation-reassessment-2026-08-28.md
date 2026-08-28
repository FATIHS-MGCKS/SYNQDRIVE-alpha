# P2.2.57 — Key Budget / Reuse / Mutation-Safety Reassessment

**Date:** 2026-08-28  
**Mode:** STRICT READ-ONLY REASSESSMENT  
**Implementation PR:** [#1377](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1377)  
**Baseline:** `9b466c4ac930afe752dcd14a872b320f240537f3`  
**Implementation HEAD:** `b0b23fddca5856a5ee0e5686004a506704db9b82`  
**Pre-flight:** PR #1376

---

## PART A — Provenance

| Check | Result |
|-------|--------|
| PR #1377 open | **YES** |
| Draft | **YES** |
| Merged | **NO** |
| Mergeable | **YES** (`MERGEABLE`) |
| Base OID | `9b466c4ac930afe752dcd14a872b320f240537f3` ✓ |
| Head OID | `b0b23fddca5856a5ee0e5686004a506704db9b82` ✓ |
| Commit count | **1** |
| Parent | `9b466c4ac930afe752dcd14a872b320f240537f3` ✓ |
| #1376 ancestry | **NO** |

---

## PART B — Changed-path inventory (20 paths)

| Path | Class |
|------|-------|
| `TenantPaymentMethodsSection.tsx` | A |
| `TenantBillingPaymentMethodTab.tsx` | A |
| `tenant-payment-methods.utils.ts` | B |
| `billing-stripe-ui.ts` | C |
| `useBillingPaymentMethodActions.ts` | D |
| `useBillingStripeActions.ts` | D |
| `BillingTab.tsx` | E |
| `rental-tenant-billing-i18n.ts` | F |
| `en.ts` / `de.ts` | G |
| `hardcoded-copy-guard.test.ts` / `hardcoded-copy-inventory.json` | H |
| `*.test.tsx` / `*.test.ts` (4 files) | I |
| `docs/audits/...implementation...md` / `architecture/...md` / ChangesView / ArchitekturView | J |

**K/L/M/N/O/P = 0** — no mutation semantic, permission, provider URL, P256 invoice, dead legacy, or unrelated production changes.

---

## PART C — BillingTab special audit

**Hunk (only change):**

```diff
+import { resolveStripePortalActionErrorMessage } from '../../lib/rental-tenant-billing-i18n';
+const portalErrorMessage = resolveStripePortalActionErrorMessage(stripeActions.error, t);
-portalError={stripeActions.error}
+portalError={portalErrorMessage}
```

**Analysis:**

- Only affects `TenantBillingPaymentMethodTab` `portalError` prop (payment-method sub-tab).
- `TenantBillingProblemPanel` does **not** consume `stripeActions.error` — only `portalLoading`.
- No tab routing, permission, portal availability, overview, or invoice changes.

**Verdict:** **BILLINGTAB CHANGE — PRESENTATION-ONLY SAFE**

---

## PART D — Complete 27-key inventory

| # | Key | EN | DE | Callsite | Purpose | Mounted? | Reuse candidate | Verdict |
|---|-----|----|----|----------|---------|----------|-----------------|---------|
| 1 | `section.title` | Payment methods | Zahlungsmethoden | TenantPaymentMethodsSection | Section H3 | YES | `tab.paymentMethod` | **NOT REUSABLE** (plural vs singular) |
| 2 | `section.subtitle` | Manage card/SEPA… | Verwalten Sie Karte… | TenantPaymentMethodsSection | Section subtitle | YES | — | NEW KEY JUSTIFIED |
| 3 | `header.defaultConfigured` | Default on file | Standard hinterlegt | TenantPaymentMethodsSection | Header badge when default exists | YES | `badge.default` | **NOT REUSABLE** (different copy) |
| 4 | `empty.title` | No payment method on file | Keine Zahlungsmethode… | TenantPaymentMethodsSection | Empty state title | YES | — | NEW KEY JUSTIFIED |
| 5 | `empty.body` | Add in portal… | Hinterlegen Sie… | TenantPaymentMethodsSection | Empty state body | YES | — | NEW KEY JUSTIFIED |
| 6 | `action.add` | Add payment method | Zahlungsmethode hinzufügen | TenantPaymentMethodsSection | Add CTA | YES | `problem.updatePayment` | **NOT REUSABLE** (add vs update) |
| 7 | `action.setDefault` | Set as default | Als Standard setzen | TenantPaymentMethodsSection | Set-default button | YES | — | NEW KEY JUSTIFIED |
| 8 | `badge.default` | Default | Standard | TenantPaymentMethodsSection | Per-card badge | YES | `header.defaultConfigured` | **NOT REUSABLE** (shorter label) |
| 9 | `attention.updateRequired` | Needs update… | Diese Zahlungsmethode… | TenantPaymentMethodsSection | Attention line | YES | — | NEW KEY JUSTIFIED |
| 10 | `loadErrorTitle` | Payment methods could not be loaded | Zahlungsmethoden konnten… | TenantBillingPaymentMethodTab | Tab load error | YES | invoices `list.loadErrorTitle` | **WEAK** — domain-specific; KEEP NEW |
| 11 | `state.ready` | On file | Hinterlegt | adapter → section | billingState READY | YES | — | NEW KEY JUSTIFIED |
| 12 | `state.missing` | Not on file | Nicht hinterlegt | adapter | billingState MISSING | YES | — | NEW KEY JUSTIFIED |
| 13 | `state.requiresAction` | Confirmation required | Bestätigung erforderlich | adapter | REQUIRES_ACTION | YES | — | NEW KEY JUSTIFIED |
| 14 | `state.failed` | Invalid or expired | Ungültig oder abgelaufen | adapter | FAILED | YES | — | NEW KEY JUSTIFIED |
| 15 | `stripe.configured.label` | Payments active | Zahlungen aktiv | billing-stripe-ui via adapter | Stripe UI state | YES | — | NEW KEY JUSTIFIED |
| 16 | `stripe.prepared.label` | Online payment being prepared | Online-Zahlung wird vorbereitet | adapter | Stripe UI state | YES | — | NEW KEY JUSTIFIED |
| 17 | `stripe.notConfigured.label` | Online payment not active | Online-Zahlung nicht aktiv | adapter | Stripe UI state | YES | — | NEW KEY JUSTIFIED |
| 18 | `stripe.configured.hint` | Managed in portal… | Zahlungsmethoden und Rechnungen… | adapter | Stripe hint | YES | — | NEW KEY JUSTIFIED |
| 19 | `stripe.prepared.hint` | Being prepared… | Die Online-Zahlung wird… | adapter | Stripe hint | YES | — | NEW KEY JUSTIFIED |
| 20 | `stripe.notConfigured.hint` | Not enabled… | Online-Zahlungen sind… | adapter | Stripe hint | YES | — | NEW KEY JUSTIFIED |
| 21 | `display.expiryPrefix` | Valid until  | Gültig bis  | adapter | CARD expiry wrapper | YES | — | NEW KEY JUSTIFIED |
| 22 | `display.mandatePrefix` | Mandate:  | Mandat:  | adapter | SEPA mandate wrapper | YES | — | NEW KEY JUSTIFIED |
| 23 | `display.fallback.card` | Card | Karte | adapter | Missing brand fallback | YES | — | NEW KEY JUSTIFIED |
| 24 | `display.fallback.bankAccount` | Bank account | Bankkonto | adapter | Missing bank fallback | YES | — | NEW KEY JUSTIFIED |
| 25 | `error.detachFailed` | Could not be removed | Konnte nicht entfernt werden | adapter/hook | Detach host fallback | YES | — | NEW KEY JUSTIFIED |
| 26 | `error.portalNotConfigured` | Stripe not available | Stripe-Zahlungen nicht verfügbar | adapter/hook | Portal not-configured | YES | — | NEW KEY JUSTIFIED |
| 27 | `error.portalOpenFailed` | Portal could not open | Zahlungsportal konnte nicht… | adapter/hook | Portal generic failure | YES | — | NEW KEY JUSTIFIED |

**Already reused (not counted as new):** `common.retry`, `common.loading`, `common.remove`, `tenantBilling.problem.openPortal`, `tenantBilling.tab.paymentMethod`

**27/27 accounted. All used. Zero duplicates. Zero unused.**

---

## PART E — Reuse deep audit summary

| Candidate | Result |
|-----------|--------|
| `tenantBilling.tab.paymentMethod` vs `section.title` | **NOT REUSABLE** — tab singular / section plural |
| `header.defaultConfigured` vs `badge.default` | **NOT REUSABLE** — "Default on file" vs "Default" |
| `action.add` vs `problem.updatePayment` | **NOT REUSABLE** — add vs update semantics |
| `common.remove` | **EXACT REUSE** ✓ (already used) |
| `common.loading` | **EXACT REUSE** ✓ (portal button loading) |
| `tenantBilling.problem.openPortal` | **EXACT REUSE** ✓ (portal CTA) |
| `bookingPayment.*` / `customerPayments.*` | **INCORRECT** — not used |
| Billing state vs invoice status keys | **INCORRECT** — different machines |

---

## PART F — Key budget reconciliation

| Metric | Value |
|--------|-------|
| Current new keys | **27** |
| Exact reuse reductions available | **0** (all applicable exact reuses already taken) |
| Safe semantic reuse reductions | **0** |
| Duplicate removals | **0** |
| **Irreducible new keys (N)** | **27** |

**Pre-flight gate:** 27 ∈ [27–32] → exception requires explicit justification.

**Justification:** The +1 above the 21–26 acceptable band is caused by six distinct Stripe state strings (3 label + 3 hint) that cannot collapse without losing meaning, plus two distinct default-related host strings (`header.defaultConfigured` vs `badge.default`) that baseline already used as different German copy. No exact canonical key covers section plural title, billingState machine (4), display wrappers (4), or portal error pair without semantic loss.

---

## PART G — Key budget verdict

**27 KEYS IRREDUCIBLE — EXCEPTION JUSTIFIED**

Not **KEY REDUCTION REQUIRED** — independent audit found zero missed exact reuse.

---

## PART H — Mutation / error ownership

### Raw data — preserved ✓

Fixtures `pm_provider_X7`, `visa`, `4242`, provider type/bank/mandate labels — unchanged in display logic.

### Display formatter parity ✓

`formatPaymentMethodDisplayLocalized` preserves baseline structure:
- ` •••• ` separator, raw brand/bank/last4/typeLabel/mandate
- Expiry `MM/YYYY` with localized prefix only
- Fallback precedence equivalent (German host → localized host)

### billingState machine/tone ✓

`paymentMethodBillingStateTone` unchanged. Labels localized via machine mapping only.

### Default / detach eligibility ✓

`loadingId === method.id` OR (`isDefault && paymentMethods.length === 1`) — **unchanged**.

### Set-default mutation ✓

`POST .../set-default`, `{}` payload, same IDs, loading, onChanged — **ZERO semantic diff**.

### Detach mutation ✓

`DELETE .../payment-methods/{id}` — **ZERO semantic diff** except host fallback localization path.

### Set-default error ownership

`PaymentMethodActionError { source: 'setDefault', message: string }` where `message = mapBillingLoadError(caught)` — may be raw API string or mapped host German string (same as baseline). Resolver passes through unchanged. **Equivalent to baseline.**

### Detach error ownership

- `Error('Provider Detach Error X7')` → `{ kind: 'raw', message }` — **raw preserved DE/EN**
- `throw {}` → `{ kind: 'host', code: 'detachFailed' }` → localized host fallback
- **Improved vs baseline** for empty-message case (host fallback now locale-aware); raw path unchanged.

### Stripe portal baseline policy

Baseline **intentionally flattens** all non-`not_configured` errors to generic German portal-open failure. `getErrorMessage` result is read but **discarded** for non-not_configured paths.

### Stripe new error ownership

**Verdict A** — `StripePortalActionError` includes unused `{ kind: 'raw' }` variant, but runtime emits **only host** codes (`notConfigured` | `openFailed`). Behavior **exactly matches baseline flattening policy**.

### Raw Stripe variant classification

**HARMLESS FUTURE-PROOF TYPE** — does not mislead runtime; could be removed for style but not a blocker.

### Portal URL / return URL ✓

`window.location.assign(res.url)` exact; `returnUrl = origin + pathname + ?settingsTab=billing` — unchanged.

### Capability / permissions ✓

`stripeState === 'configured' && orgId && canWrite` — unchanged.

### Problem-panel blast radius ✓

`TenantBillingProblemPanel` does not read `stripeActions.error`. **No impact.**

### billing-stripe-ui compatibility ✓

Mounted P257 passes `t` → localized. Dead legacy (`BillingPaymentMethodCard`, `BillingStatusHero`) call without `t` → legacy German path preserved. **No active EN fallback to German.**

---

## PART I — Test quality

| Area | Verdict |
|------|---------|
| Same-mount component test | Mocks hooks — **ACCEPTABLE** combined with real hook tests |
| Real set-default/detach hook tests | **STRONG** — exact IDs, raw/host detach, loading lifecycle |
| Real Stripe hook tests | **STRONG** — exact URL assign, host error classification, loading |
| Locale callback side effects | **0** mutations on DE→EN→DE (component test asserts) |

---

## PART J — Freeze certifications

| Surface | Diff |
|---------|------|
| P256 invoice components | **ZERO** (TenantInvoicesSection, TenantInvoiceDetailDrawer unchanged) |
| P256 invoice adapter functions | **ZERO** (only appended payment-method exports) |
| P255/P254 | **ZERO** |
| Dead legacy payment cards | **ZERO** |
| CustomerPaymentsTab | **ZERO** |

---

## PART K — Enforce-clean boundary

**Six-path enforce-clean** covers all scanner-visible hardcoded-debt surfaces.

**Excluded with justification:**

| Path | Reason |
|------|--------|
| `BillingTab.tsx` | Single resolver line; no new hardcoded strings |
| `rental-tenant-billing-i18n.ts` | Adapter uses `t(key)` — not scanner debt |

**Verdict:** **BOUNDARY SUFFICIENT** — no hidden hardcoded debt in excluded paths.

---

## PART L — Scanner / dictionary

| Metric | Baseline | Implementation |
|--------|----------|----------------|
| Global | 1413 | **1407** (−6) |
| Rental | 316 | **310** (−6) |
| Finance/Billing | 33 | **27** (−6) |
| P257 enforce-clean | ~21 active | **0** |
| EN/DE | 8915 | **8942** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |

Hidden debt (~15 strings in utils/stripe-ui/hooks) — **migrated**. No suppressions.

---

## PART M — Category E

**Category E = 0** — all semantic domains frozen per implementation audit.

---

## PART N — Validation

| Check | Result |
|-------|--------|
| P257 + hook + P256 tests | **PASS** (24 targeted + full suite 507) |
| `npm run i18n:check` | **PASS** |
| `npm run check:surface` | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check` | **FAIL** — trailing whitespace in implementation audit/architecture markdown only (non-production hygiene) |

---

## PART O — Collision

No HIGH/DIRECT production collision on P257 paths. Only #1376 (audit) and #1377 (implementation).

---

## PART P — Progress metric reconciliation

| Metric | Value | Denominator | What it measures |
|--------|-------|-------------|------------------|
| Legacy scanner-debt | **~31.2%** cleared | ~2044 (P2.2.8 global baseline) | Total hardcoded-finding reduction including Master/Operator/dead code |
| Mounted-production weighted | **~93.8%** | Active rental production slices completed | Campaign slice completion on mounted surfaces |

**Discrepancy cause:** Legacy metric counts all scanner findings (majority Master); campaign hardening targets mounted rental production slices.

**Recommended canonical metric:** **Mounted-production weighted** — stable across slices, aligns with enforce-clean gates, not inflated by unrelated Master debt.

---

## PART Q — Next target

**P2.2.58 — Tenant Billing Add-ons** (revalidate after P257 merge).

---

## FINAL VERDICT

**A — 27-KEY EXCEPTION JUSTIFIED — READY FOR FULL FINAL RE-AUDIT**

27-key P257 exception is independently justified.

PR #1377 remains unmerged and may proceed to full final re-audit.

**Note for final re-audit:** Fix trailing whitespace in implementation markdown (`git diff --check` hygiene) before merge — non-blocking for key-budget exception.
