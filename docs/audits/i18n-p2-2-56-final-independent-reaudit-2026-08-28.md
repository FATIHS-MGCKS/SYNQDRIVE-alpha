# P2.2.56 — Final Independent Read-Only Re-Audit

**Date:** 2026-08-28
**Implementation PR:** [#1372](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1372)
**Pre-flight:** PR #1371
**Baseline:** `e1fa84ec5cd5cb765acddc972607b4658d85da87`
**Implementation HEAD:** `bdca90f245873b517787cb9b1f03fe915d80429f`
**Auditor mode:** Strict read-only independent verification

---

## 1. Provenance

| Check | Result |
|-------|--------|
| PR open | **YES** |
| Draft | **YES** |
| Merged | **NO** |
| Mergeable | **YES** (`MERGEABLE`) |
| Base OID | `e1fa84ec5cd5cb765acddc972607b4658d85da87` |
| Head OID | `bdca90f245873b517787cb9b1f03fe915d80429f` |
| Commit count | **1** (`bdca90f24`) |
| Parent | `e1fa84ec5cd5cb765acddc972607b4658d85da87` ✓ |
| #1371 ancestry | **NO** (exit 1) |

---

## 2. Complete diff forensics (14 paths)

| Path | Class |
|------|-------|
| `TenantInvoicesSection.tsx` | **A** — active list presentation |
| `TenantInvoiceDetailDrawer.tsx` | **B** — active detail presentation |
| `rental-tenant-billing-i18n.ts` | **C** — status/payment presentation adapter |
| `tenant-invoices.utils.ts` | **D** — utility presentation cleanup |
| `useBillingInvoiceDetail.ts` | **E** — document error localization (**semantic regression — see §30–33**) |
| `en.ts` / `de.ts` | **F** — dictionary |
| `hardcoded-copy-inventory.json` | **G** — scanner |
| `rental-tenant-billing-invoices-localization.test.tsx` | **H** — tests |
| `tenant-invoices.utils.test.ts` | **H** — tests |
| `docs/audits/...implementation...md` | **I** — docs |
| `architecture/I18N_TENANT_BILLING_INVOICES...md` | **I** — docs |
| `ChangesView.tsx` / `ArchitekturView.tsx` | **I** — bookkeeping |

**Forbidden classes J–S:** **0** (except E contains document-action semantic regression; status-tone migration is approved presentation correction).

**Wrapper:** `TenantBillingInvoicesTab.tsx` — **zero diff** ✓

**Dead legacy:** `BillingInvoiceSection.tsx`, `BillingInvoiceDetailDrawer.tsx` — **zero diff** ✓ (**DEAD AND UNAFFECTED**)

**P255 freeze:** `TenantBillableVehiclesTable`, `TenantVehicleChangesSection`, tariff surfaces — **zero diff** ✓

**P254–P249:** No production-path semantic changes detected in diff.

---

## 3. DOCUMENT ERROR OWNERSHIP AUDIT (PRIMARY GATE)

### Baseline behavior

`useInvoiceDocumentAction()` in baseline (`e1fa84ec5`):

```typescript
if (!url) {
  setError('Dokument ist derzeit nicht verfügbar.');
  return;
}
// ...
catch (caught) {
  setError(getErrorMessage(caught, 'Dokument konnte nicht geöffnet werden.'));
}
```

`TenantInvoiceDetailDrawer` rendered `{documents.error}` **directly** as visible text.

### `getErrorMessage` contract

```typescript
export function getErrorMessage(err: unknown, fallback = 'An unexpected error occurred'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}
```

API `request()` throws `new Error(formatHttpErrorMessage(body, status, path))` on non-2xx responses. Backend document endpoints throw `NotFoundException` with **backend-owned German messages**, e.g.:

- `Hosted-Rechnung ist für diese Rechnung nicht verfügbar.`
- `PDF ist für diese Rechnung nicht verfügbar.`

(`tenant-billing-invoices.service.ts` lines 83–88, 100–105)

### P256 behavior

```typescript
if (!url) setError('unavailable');
catch { setError('openFailed'); }
```

Drawer maps codes to static translations:

- `unavailable` → `tenantBilling.invoices.document.unavailable`
- `openFailed` → `invoices.list.error.openFailed`

### Baseline error fixture matrix

| Fixture | Baseline visible error | P256 visible error | Equivalent? |
|---------|------------------------|--------------------|-------------|
| A: `throw new Error('Provider Document Error X7')` | `Provider Document Error X7` | Generic `openFailed` translation | **NO** |
| B: API body message `Backend Document Error X7` | `Backend Document Error X7` (via `formatHttpErrorMessage`) | Generic `openFailed` translation | **NO** |
| C: unknown/non-Error | `Dokument konnte nicht geöffnet werden.` | Generic `openFailed` translation | **Partial** (host fallback only) |
| D: `null` URL | `Dokument ist derzeit nicht verfügbar.` | Localized `document.unavailable` | **YES** (host-owned static) |

### Error ownership classification (baseline)

**MIXED: RAW WHEN AVAILABLE, HOST FALLBACK OTHERWISE**

- Catch path surfaced dynamic `Error.message` (including backend API text).
- Null-URL path used static host German string.

### `catch { setError('openFailed') }` verdict

**CORRECTION REQUIRED — DYNAMIC BACKEND/PROVIDER ERROR WAS LOST**

Backend document failures that previously displayed API error text now always show a generic static translation. This is a user-visible semantic change, not presentation-only i18n of host copy.

### Document control flow (unchanged parts)

`loadingHosted`/`loadingPdf`, `clearError`, fetcher invocation, `window.open(url, '_blank', 'noopener,noreferrer')` — **unchanged**. Only error **payload and rendering** changed.

### Error codes never visible raw

P256 codes (`unavailable`, `openFailed`) are mapped in drawer — **PASS** (codes not shown to user).

### Test evidence gap

`rental-tenant-billing-invoices-localization.test.tsx` **does not** test document action errors (dynamic throw, null URL, or mapped translations). Given the production regression, this is a **BLOCKING evidence gap** for merge readiness.

---

## 4. STATUS-TONE / OVERDUE AUDIT

### Overdue derivation

Baseline (`tenant-invoices.utils.ts`):

```typescript
if (status === 'OPEN' && invoice.dueDate && new Date(invoice.dueDate) < new Date()) {
  return 'Überfällig'; // fallback label only when statusLabel empty
}
```

P256 `resolveTenantInvoiceMachineStatus` uses **identical predicate** for machine `OVERDUE`.

**OVERDUE BUSINESS SEMANTIC DIFF = ZERO** (display fallback path; filter/query backend unchanged).

### Status tone truth table (fallback / machine paths)

| Machine | Baseline fallback label | Baseline tone | P256 tone | Equivalent? |
|---------|-------------------------|---------------|-----------|-------------|
| DRAFT | Entwurf | neutral | neutral | **YES** |
| OPEN | Offen | warning | warning | **YES** |
| OVERDUE | Überfällig | critical | critical | **YES** |
| PAID | Bezahlt | success | success | **YES** |
| VOID | Storniert | neutral | neutral | **YES** |
| UNCOLLECTIBLE | Uneinbringlich | critical | critical | **YES** |

### Provider `statusLabel` tone (non-German text)

Baseline used `tenantInvoiceStatusTone(statusLabel)` (German substring heuristics on **display label**).

Example: `status=OPEN`, past `dueDate`, `statusLabel='Provider Invoice Status X7'`:

| | Baseline | P256 |
|---|----------|------|
| Display | Provider Invoice Status X7 | Provider Invoice Status X7 |
| Tone | warning (no German keywords) | critical (machine OVERDUE) |

### Status-tone migration verdict

**PRESENTATION IMPROVEMENT WITH INTENTIONAL NON-BLOCKING DIFFERENCE**

Machine+fallback paths are semantically equivalent. Raw provider labels with overdue machine state now get correct critical tone instead of locale-unsafe German substring matching. **Non-blocking** per campaign-approved tone migration, but documented difference exists.

---

## 5. UNKNOWN STATUS AUDIT

| Case | Baseline | P256 | Equivalent? |
|------|----------|------|-------------|
| `status='PROVIDER_X7'`, `statusLabel=''` | `'Offen'` | `t('tenantBilling.invoices.status.open')` | **YES** |
| `status='PROVIDER_PAYMENT_X7'`, `statusLabel=''` | `'Zahlung'` | `t('tenantBilling.invoices.paymentStatus.fallback')` | **YES** |

No new misleading classification beyond baseline default-to-open/payment behavior.

---

## 6. `resolveTenantInvoiceMachineStatus` ownership

Predicate duplicates pre-existing utils logic; used for tone/fallback display only, not query mutation.

**Verdict: ACCEPTABLE PRESENTATION CLASSIFICATION OF EXISTING STATE**

---

## 7. 30-KEY BUDGET AUDIT

### Inventory (all 30 new `tenantBilling.invoices.*` keys)

| # | Key | Used | Scope fit |
|---|-----|------|-----------|
| 1–7 | `list.*` (title, updating, loadError, search, empty×2, doc.online) | YES | list chrome |
| 8–9 | `status.open`, `status.uncollectible` | YES | status fallback |
| 10–17 | `paymentStatus.*` (8) | YES | payment fallback |
| 18–29 | `detail.*` (12) | YES | detail chrome |
| 30 | `document.unavailable` | YES | document null-URL |

**unused = 0**, **duplicates = 0**, **provider-data keys = 0**

### +8 over central ≈22 estimate

| Bucket | Keys | Notes |
|--------|------|-------|
| Payment status fallbacks | 8 | Isolated tenant-billing payment history surface |
| Detail payments subsection | 4 | load error, empty, refunded, title |
| Detail actions | 2 | opening, hostedInvoice |
| Document | 1 | unavailable |
| List-specific | 7 | Could not all reuse `invoices.list.*` |
| Status open/uncollectible | 2 | `OPEN`/`UNCOLLECTIBLE` could reuse `invoices.list.status.*` (missed reuse) |

### Missed reuse candidates (non-blocking)

- `tenantBilling.invoices.status.open` → could reuse `invoices.list.status.OPEN`
- `tenantBilling.invoices.status.uncollectible` → no exact existing key (acceptable)

### Key budget verdict

**30 KEYS JUSTIFIED — PASS** (at 25–30 acceptable ceiling; 2 keys reducible via reuse but not a design failure)

---

## 8. P253 label reuse quality

| Key | Verdict |
|-----|---------|
| `invoiceLineItem.summary.net` | **EXACT** |
| `invoiceLineItem.summary.tax` | **EXACT** |
| `invoiceLineItem.summary.gross` | **EXACT** |
| `invoiceLineItem.summary.outstanding` | **EXACT** |
| `invoiceLineItem.section.title` | **ACCEPTABLE** |

---

## 9. Scanner accounting

| Metric | Baseline | Final | Δ |
|--------|----------|-------|---|
| Global | 1421 | **1413** | −8 |
| Rental | 324 | **316** | −8 |
| Finance/Billing (byRentalModule) | 42 | **33** | −9 |

**P256 enforce-clean (4 paths): 0** ✓

**Finance/Billing −9 vs global −8:** one cleared finding was categorized under Finance/Billing module while global total deduplicated one cross-file occurrence differently; no suppression.

**Dead legacy debt:** 17 findings remain visible (`BillingInvoice*` rental 7+5 + master billing invoice surfaces).

**Scanner weakening:** **NONE**

---

## 10. Dictionary accounting

| Metric | Value |
|--------|-------|
| Baseline EN/DE | 8885 / 8885 |
| Final EN/DE | **8915 / 8915** |
| New | **30** |
| Removed | 0 |
| Changed existing | 0 |
| Parity | **100%** |
| Orphans | **0** |
| Unused | **0** |

---

## 11. Test quality

| Area | Grade | Notes |
|------|-------|-------|
| Provider raw DOM | **STRONG** | invoice number, statusLabel, money, line, payment fields |
| Same-mount list | **ACCEPTABLE** | BillingTab mount; `setQuery` not called; raw fields; mock query has page=2/search/status |
| Same-mount detail | **ACCEPTABLE** | Portal body assertions; locale switch; drawer content |
| Document error | **WEAK / MISSING** | No dynamic error preservation test — **blocking** |
| P255 regression | **PASS** | 11/11 tariff-vehicles localization tests |

---

## 12. Validation (independent)

| Check | Result |
|-------|--------|
| P256 focused tests | **7/7 PASS** |
| Utils tests | **4/4 PASS** |
| P255 regressions | **11/11 PASS** |
| `npm run i18n:check` | **PASS** |
| `npm run check:surface` | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check` | **PASS** (zero output) |

### CI triage (#1372 HEAD)

| Failure | Classification |
|---------|----------------|
| Backend Typecheck (`billing.controller.security`, `vehicles-security-negative`, `vehicles.controller.status-patch`) | **Pre-existing / unrelated** |
| Backend unit tests / Playwright E2E | **Pre-existing / unrelated** (no P256 path changes) |

**P256-caused required failures: 0**

---

## 13. Claim reconciliation

| Claim | #1372 | Independent | PASS/FAIL |
|-------|-------|-------------|-----------|
| 1 commit | YES | YES | **PASS** |
| Direct ancestry | YES | YES | **PASS** |
| Active-only scope | YES | YES | **PASS** |
| Dead legacy untouched | YES | YES | **PASS** |
| 30 keys | YES | YES (30) | **PASS** |
| 8915/8915 | YES | YES | **PASS** |
| Scanner 1413/316/33 | YES | YES | **PASS** |
| P256 enforce-clean = 0 | YES | YES | **PASS** |
| Raw identity | YES | YES | **PASS** |
| Raw statusLabel | YES | YES | **PASS** |
| Status tone (fallback paths) | YES | YES | **PASS** |
| Status tone (provider labels) | — | Non-blocking diff | **OBSERVE** |
| Overdue derivation | YES | YES | **PASS** |
| Filters/search/pagination | YES | YES | **PASS** |
| Money precedence | YES | YES | **PASS** |
| Payment provider data | YES | YES | **PASS** |
| Document URLs | YES | YES | **PASS** |
| **Document error semantics** | Preserved | **Dynamic API text lost** | **FAIL** |
| P255 freeze | YES | YES | **PASS** |
| Category E | 0 | 0 except document error display | **FAIL** |
| Tests/build/diff-check | PASS | PASS | **PASS** |

---

## 14. Smallest correction set (DO NOT IMPLEMENT)

### Correction 1 — preserve dynamic document errors

| Field | Value |
|-------|-------|
| **File** | `useBillingInvoiceDetail.ts` |
| **Symbol** | `useInvoiceDocumentAction` / `openUrl` catch |
| **Baseline** | `setError(getErrorMessage(caught, 'Dokument konnte nicht geöffnet werden.'))` |
| **P256** | `setError('openFailed')` |
| **Problem** | Backend API messages (`Hosted-Rechnung ist...`, `PDF ist...`, formatted HTTP errors) no longer shown |
| **Smallest safe correction** | Discriminated union: `{ kind: 'host'; code: 'unavailable' \| 'openFailed' } \| { kind: 'raw'; message: string }`. In catch: `const message = getErrorMessage(caught, ''); setError(message ? { kind: 'raw', message } : { kind: 'host', code: 'openFailed' });`. Null URL: `{ kind: 'host', code: 'unavailable' }`. |
| **Drawer mapping** | If `kind === 'raw'`, render `message` verbatim; if `kind === 'host'`, map code → translation key. |
| **Required test** | Throw `new Error('Provider Document Error X7')` via mocked fetcher; assert DOM contains exact string in DE and EN. Null URL → localized unavailable only. |

### Optional correction 2 — key reuse (non-blocking)

Replace `tenantBilling.invoices.status.open` with `invoices.list.status.OPEN` (−1 key per locale).

---

## 15. Progress (post-correction projection)

| Debt | Count |
|------|-------|
| Global scanner | 1413 |
| Rental | 316 |
| Finance/Billing | 33 |
| Active tenant billing (excl. legacy) | ~21 |
| Dead legacy invoice | 12 |

**Completion:** conservative ~78% / central ~82% / optimistic ~85% (unchanged from implementation claim)

**Next target:** P2.2.57 — Tenant Billing Payment Method

---

## 16. Final verdict

### **C — CORRECTIONS REQUIRED**

Primary blocker: **document error ownership regression** — baseline surfaced dynamic backend/API `Error.message` text in the drawer; P256 replaces all catch-path errors with static `openFailed` translation.

P2.2.56 is **not** ready for freeze until document error semantics are corrected and regression-tested.

**DEAD LEGACY BILLING INVOICE COMPONENTS REMAIN OUT OF SCOPE.**

**NEXT CANDIDATE: P2.2.57 — Tenant Billing Payment Method**

**DO NOT MERGE #1372 until correction 1 is applied.**
