# P2.2.56 — Final Delta Re-Audit After Document Error Correction

**Date:** 2026-08-28
**Implementation PR:** [#1372](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1372)
**Full re-audit:** PR #1374 (verdict C — corrections required)
**Baseline:** `e1fa84ec5cd5cb765acddc972607b4658d85da87`
**Original audited HEAD:** `bdca90f245873b517787cb9b1f03fe915d80429f`
**Corrected HEAD:** `1da5df457f7783a4e9e93798005538a0f071497b`
**Correction commit:** `1da5df457`

---

## 1. Topology

| Check | Result |
|-------|--------|
| PR #1372 open | **YES** |
| Draft | **YES** |
| Merged | **NO** |
| Mergeable | **YES** |
| Base OID | `e1fa84ec5cd5cb765acddc972607b4658d85da87` |
| Corrected HEAD | `1da5df457f7783a4e9e93798005538a0f071497b` |
| Total commits | **2** |
| Chain | `e1fa84ec` → `bdca90f24` → `1da5df457` |
| Correction parent | `bdca90f24` ✓ |
| #1374 ancestry | **NO** |

---

## 2. Correction delta paths (6)

| Path | Classification |
|------|----------------|
| `useBillingInvoiceDetail.ts` | Document error ownership fix |
| `TenantInvoiceDetailDrawer.tsx` | Resolver wiring |
| `useBillingInvoiceDetail.test.ts` | Real-hook regression (new) |
| `rental-tenant-billing-invoices-localization.test.tsx` | Mock partial import for resolver export |
| `docs/audits/...implementation...md` | Documentation |
| `architecture/I18N_TENANT_BILLING_INVOICES...md` | Documentation |

**Unrelated production delta:** **NO**

Dictionary (`en.ts`/`de.ts`): **ZERO DIFF** between `bdca90f24` and `1da5df457`
Scanner inventory: **ZERO DIFF** between `bdca90f24` and `1da5df457`

---

## 3. Error ownership truth table

| Fixture | Error state | Visible output | Locale |
|---------|-------------|----------------|--------|
| `throw new Error('Provider Document Error X7')` | `{ kind: 'raw', message: 'Provider Document Error X7' }` | `Provider Document Error X7` | DE/EN exact |
| `throw 'Backend Document Error X7'` | `{ kind: 'raw', message: 'Backend Document Error X7' }` | `Backend Document Error X7` | DE/EN exact |
| `throw {}` | `{ kind: 'host', code: 'openFailed' }` | Localized open-failed | DE ≠ EN |
| `fetcher → null` | `{ kind: 'host', code: 'unavailable' }` | Localized unavailable | DE ≠ EN |
| Success URL | `null` | `window.open(url, '_blank', 'noopener,noreferrer')` | URL exact |

**Host codes (`unavailable`, `openFailed`) never visible raw** — resolver maps to translation keys only.

**`getErrorMessage` restored** from `../../../lib/api` on catch path.

---

## 4. #1374 blocker resolution

| Blocker | Status |
|---------|--------|
| DYNAMIC BACKEND/PROVIDER ERROR WAS LOST | **RESOLVED** |

Baseline mixed ownership (raw when available, host fallback otherwise) is restored. API/backend `Error.message` text (e.g. `Hosted-Rechnung ist...`, `PDF ist...`) surfaces verbatim again via `{ kind: 'raw', message }`.

---

## 5. Real hook test audit

**File:** `useBillingInvoiceDetail.test.ts`
**Grade:** **STRONG**

Exercises real `useInvoiceDocumentAction()` via `renderHook` (not mocked). Coverage:

- Error.message raw preservation
- String exception raw preservation
- Unknown exception → host openFailed (localized DE/EN)
- Null URL → host unavailable (localized DE/EN)
- Exact provider URL to `window.open`
- Raw error locale invariance
- Resolver: raw verbatim, no code leakage

Combined with drawer wiring (`resolveInvoiceDocumentActionErrorMessage` → `<p>{documentErrorMessage}</p>`), UI rendering evidence is sufficient.

---

## 6. Negative gates (correction delta)

| Gate | Delta |
|------|-------|
| Status/overdue adapters | **ZERO** |
| Financial/money/tax | **ZERO** |
| Filter/search/pagination | **ZERO** |
| Provider fields (except restored raw doc errors) | **ZERO** |
| Dead legacy (`BillingInvoice*`) | **ZERO** |
| P255A/B | **ZERO** |
| Document URL/control flow | **UNCHANGED** (loading, finally, window.open) |

**Category E:** **0** (document error ownership regression resolved)

---

## 7. Full HEAD health (`1da5df457`)

| Metric | Value |
|--------|-------|
| EN / DE | **8915 / 8915** |
| Parity | **100%** |
| Orphans | **0** |
| New P256 keys | **30** |
| Global scanner | **1413** |
| Rental scanner | **316** |
| Finance/Billing | **33** |
| P256 enforce-clean | **0** |
| P255A/B | **0** |
| Global enforce-clean | **0** |

---

## 8. Validation (independent)

| Check | Result |
|-------|--------|
| P256 localization tests | **7/7 PASS** |
| `useBillingInvoiceDetail.test.ts` | **7/7 PASS** |
| Utils tests | **4/4 PASS** |
| P255 regression | **11/11 PASS** |
| `npm run i18n:check` | **PASS** |
| `npm run check:surface` | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check` baseline→final | **PASS** |
| `git diff --check` original→corrected | **PASS** |

### CI (#1372 corrected HEAD)

Failures: backend Typecheck (`billing.controller.security`, `vehicles-security-negative`, `vehicles.controller.status-patch`), backend unit tests, Playwright E2E — **pre-existing / unrelated** (no P256 path changes in correction delta).

**P256-caused required failures: 0**

Frontend component tests, production build, lint: **PASS**

---

## 9. #1374 certification inheritance

| Certification | Status |
|---------------|--------|
| Provenance / active-only scope | **INHERITED** |
| Dead legacy untouched | **INHERITED** |
| 30-key budget | **INHERITED** |
| 8915/8915 parity | **INHERITED** |
| Scanner 1413/316/33 | **INHERITED** |
| P256 enforce-clean = 0 | **INHERITED** |
| Raw invoice/provider data | **INHERITED** |
| Status machine / overdue | **INHERITED** |
| Status tone migration | **INHERITED** |
| Filters/search/pagination | **INHERITED** |
| Money/tax/payment | **INHERITED** |
| Document URLs | **INHERITED** |
| Document error ownership | **RESTORED** (was INVALIDATED, now fixed) |
| P255 freeze | **INHERITED** |
| Category E = 0 | **INHERITED** (restored) |
| No collision | **INHERITED** |

**All prior passing certifications: INHERITED**

---

## 10. Final verdict

### **A — READY FOR P2.2.56 FREEZE / MERGE**

PR #1372 may now be marked ready and merged.

P2.2.56 is ready for freeze.

**DO NOT MERGE #1374.**

**NEXT CANDIDATE: P2.2.57 — Tenant Billing Payment Method**
