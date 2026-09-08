# I18N-INTEGRATION-2C — Rental i18n Compatibility Bridge Retirement

**Date:** 2026-09-08  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha

---

## 1. Mission

Retire the temporary Rental i18n compatibility bridge (`frontend/src/rental/i18n/**`) after migrating all production consumers onto the canonical platform runtime (`frontend/src/i18n/**`) with proven translation-key closure.

**Prerequisite merged:** PR #1575 (`c7bb4df4022122c662f07fc23fafc427733263cf`) — Integration 2B.

---

## 2. Baseline verification

| Item | Value |
|------|-------|
| Starting `origin/main` SHA | `68495041974135f7c6565fd5b836b3e2f9176fae` |
| PR #1575 merge commit present | Yes (`c7bb4df4022122c662f07fc23fafc427733263cf`) |
| Product branch | `cursor/i18n-integration-2c-rental-bridge-retirement-3c10` |
| Product HEAD | `2d23c4744` (pending doc correction commit) |
| Product PR | **#1578** — https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1578 |
| Product PR base (stacked) | `cursor/i18n-integration-2c-legal-docs-lint-authority-3c10` (#1579) |
| Authority prerequisite PR | **#1579** — https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1579 |
| Authority prerequisite HEAD | `023648e8a` (`frontend/package.json` lint path substitution only) |
| Post-product governance PR | **#1580** (planned) — `cursor/i18n-integration-2c-governance-closure-3c10` stacked on #1578 |

---

## 3. Translation-key reconciliation matrix

Measured at product HEAD against `origin/main` @ `684950419`.

| Metric | Count | Method / meaning |
|--------|------:|------------------|
| Pre-migration committed canonical English keys (`translation-coverage-baseline.json`) | **9,803** | Protected baseline on `main` |
| Post-migration canonical English keys (`translation-registry.test.ts`) | **10,431** | `Object.keys(en)` after `rental-legacy-gap.*` spreads |
| **Net-new canonical keys** (post − pre baseline) | **628** | `10,431 − 9,803` |
| Rental English catalog keys absent from pre-migration canonical `en.ts` | **640** | Dictionary diff (`main` rental `en.ts` ∖ `main` canonical `en.ts`) |
| Keys copied into `rental-legacy-gap.en.ts` / `.de.ts` | **640** | `rg` key-line count in gap modules |
| Pre-existing canonical overlap (not net-new) | **12** | `640 − 628` — already owned in canonical before gap spread |
| Production `t('…')` keys that depended on bridge `missing-key` fallback | **389** | Static scan of `frontend/src/{rental,operator,lib,pages}/**` production sources for keys in rental-only catalog |
| Rental-only keys referenced in production but not in gap | **0** | Subset check: all 389 fallback keys ⊆ gap module |

### Partial-locale gap file counts (`rental-legacy-gap.{locale}.ts`)

| Locale | Gap keys in module | Pre-migration owned | Post-migration owned | Delta |
|--------|-------------------:|--------------------:|---------------------:|------:|
| fr | 252 | 786 | 1,038 | +252 |
| pl | 252 | 493 | 745 | +252 |
| cs | 234 | 493 | 727 | +234 |
| nl | 252 | 493 | 745 | +252 |
| es | 252 | 493 | 745 | +252 |
| it | 252 | 493 | 745 | +252 |

**Deduplication note:** Partial-locale gap modules were built with **11 nav/fines keys per locale** omitted because those keys were already owned by the partial dictionary before spread. The counts above are **post-dedup** module sizes (not 263 per locale).

### Why 640 ≠ 628

- **640** counts the full rental-only catalog slice merged into gap modules.
- **628** counts keys that actually increased the canonical dictionary size.
- **12** rental-only catalog keys were already present in pre-migration canonical `en.ts` (overlap); spreading them did not increase `CANONICAL_KEY_COUNT`.

---

## 4. Pre-change consumer matrix (summary)

### Before counts

| Consumer class | Count | Replacement |
|----------------|-------|-------------|
| Rental production/test files importing via rental-relative `../i18n/` shim path | **376** | Depth-correct `../../i18n/` (etc.) → canonical runtime |
| Explicit `rental/i18n` import paths (cross-surface + tests) | **8** | `frontend/src/i18n/**` |
| Rental bridge implementation files | **12** | Deleted |
| Production `t()` keys depending on bridge fallback | **389** | Migrated into canonical catalogs via `rental-legacy-gap.*` |

---

## 5. Canonical-key closure evidence

| Check | Result |
|-------|--------|
| Production keys in canonical English dictionary | **10,431** keys (`translation-registry.test.ts`) |
| de/en completeness | **100%** |
| Legacy English values preserved | Yes (byte-copied via gap modules) |
| Legal-document ownership | Canonical `legal-documents.{en,de}.ts` (rental copies were identical) |
| Interpolation | Unchanged (`{name}` placeholders preserved) |
| Turkish | `fallback-en` only (`usesLocaleDictionary('tr') === false`) |
| Partial locales | Truthful partial coverage; no invented TR/machine translations |
| Persistence key | `synqdrive.locale` only (`LOCALE_STORAGE_KEY`) |

---

## 6. Provider topology

### After

```
App.tsx
└── LanguageProvider (canonical, single mount)
    └── BrowserRouter
        ├── LoginPage → canonical useLanguage
        ├── RentalApp → canonical useLanguage (direct imports)
        └── OperatorApp
```

`rental/App.tsx` contains **no** `LanguageProvider`. Rental consumers import `frontend/src/i18n/**` directly.

---

## 7. Deleted paths

```
frontend/src/rental/i18n/LanguageContext.tsx
frontend/src/rental/i18n/translations/cs.ts
frontend/src/rental/i18n/translations/de.ts
frontend/src/rental/i18n/translations/en.ts
frontend/src/rental/i18n/translations/es.ts
frontend/src/rental/i18n/translations/fr.ts
frontend/src/rental/i18n/translations/it.ts
frontend/src/rental/i18n/translations/legal-documents.de.ts
frontend/src/rental/i18n/translations/legal-documents.en.ts
frontend/src/rental/i18n/translations/nl.ts
frontend/src/rental/i18n/translations/pl.ts
frontend/src/rental/i18n/                    (directory removed)
```

---

## 8. Added / changed paths (product PR #1578 only)

**Added**

- `frontend/src/i18n/runtime-integration-2c.test.tsx`
- `frontend/src/i18n/translations/rental-legacy-gap.{en,de,fr,nl,es,it,pl,cs}.ts`
- `docs/audits/i18n-integration-2c-rental-bridge-retirement-2026-09-08.md`

**Changed (product)**

- ~376 Rental (+ cross-surface) files: import paths → canonical `frontend/src/i18n/**`
- Canonical locale dictionaries `en.ts`, `de.ts`, partial locales: spread `rentalLegacyGap*`
- Integration tests `runtime-integration-2a.test.tsx`, `runtime-integration-2b.test.tsx`, `LanguageContext.test.tsx` (shim references removed)

**Not changed in #1578 (protected — deferred)**

| Path | Deferred to |
|------|-------------|
| `frontend/package.json` `lint:legal-documents` | **PR #1579** (authority prerequisite) |
| `frontend/src/i18n/translation-coverage-baseline.json` | **PR #1580** (governance closure) |
| `frontend/src/i18n/translation-coverage.test.ts` | **PR #1580** (expected owned-count sync) |
| `frontend/src/i18n/i18n-structural-check.test.ts` | **PR #1580** (activate INTEGRATION-2C bridge-removal assertion) |
| `i18n-governance-scanner.test.ts`, `i18n-pr-gate.test.ts`, workflows, `AGENTS.md`, `.cursor/rules/i18n.mdc` | Out of scope |

**Protected-path count in #1578 diff vs stacked base:** **0**

---

## 9. Legacy-consumer count

| Metric | Before | After |
|--------|--------|-------|
| Production imports of `rental/i18n/**` | 376 + 8 explicit | **0** |
| Rental shim files | 12 | **0** |
| Remaining references | — | 2 non-production: `i18n-structural-check.test.ts` (protected skip until #1580), `ArchitekturView.tsx` (historical prose) |

---

## 10. Test commands and results (product PR #1578)

| Command | Result |
|---------|--------|
| `npx vitest run src/i18n/runtime-integration-2c.test.tsx` | **8/8 pass** |
| `npx vitest run src/i18n/` | **239 pass**, 3 skipped; **3 fail** in `translation-coverage.test.ts` (baseline not synced — fixed in #1580) |
| `npm run i18n:scanner:test` | **43 pass**, 2 skipped |
| `npm run i18n:pr-gate:test` | **113/113 pass** |
| `npm run i18n:check:ci` | **PASS** |
| `npm run build` | **PASS** |
| `npm run lint:legal-documents` | **PASS** (via stacked #1579 base) |

---

## 11. Governance classification (#1578)

| Field | Value |
|-------|-------|
| Classification | `PRODUCT_RUNTIME_I18N_INTEGRATION` |
| Protected-path count in diff | **0** |
| Authority label | **None** |
| `GOVERNANCE_AUTHORITY_CHANGED` (local pr-gate on product diff) | **NO** |

---

## 12. Stacked PR chain and merge order (document only)

1. Independently audit and merge corrected **#1579** to `main`.
2. Rebase **#1578** onto updated `main`.
3. Retarget **#1578** base from `#1579` branch to `main`.
4. Re-run and independently audit **#1578**; merge **#1578**.
5. Rebase/retarget **#1580** governance-closure PR onto `main`.
6. Re-run authority CI; merge **#1580**.

**Do not merge until each PR is independently audited.**

---

## 13. PR status

| PR | Branch | Role | State |
|----|--------|------|-------|
| #1579 | `cursor/i18n-integration-2c-legal-docs-lint-authority-3c10` | Authority: `lint:legal-documents` path substitution | Draft, unmerged |
| #1578 | `cursor/i18n-integration-2c-rental-bridge-retirement-3c10` | Product: bridge retirement | Draft, unmerged |
| #1580 | `cursor/i18n-integration-2c-governance-closure-3c10` | Authority: coverage baseline + structural closure | Draft, unmerged |

### CI remediation (Legal Documents Lint)

Deleting `frontend/src/rental/i18n/**` broke `npm run lint:legal-documents` because `frontend/package.json` still globbed the removed rental translation path. `frontend/package.json` is an i18n governance authority path; changing it in the same PR as ~400 product files triggers `MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE`.

**Resolution:** **#1579** performs only the required path substitution (`src/rental/i18n/translations/legal-documents*.ts` → `src/i18n/translations/legal-documents*.ts`) with **no** `--no-error-on-unmatched-pattern`. **#1578** is stacked on #1579 so lint passes without mixing governance paths.
