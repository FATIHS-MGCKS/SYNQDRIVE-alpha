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
| Branch | `cursor/i18n-integration-2c-rental-bridge-retirement-3c10` |
| Commit SHA | _(see PR after push)_ |
| PR | _(see PR URL after open)_ |

---

## 3. Pre-change consumer matrix (summary)

### Inventory method

Repository-wide search for:

- `frontend/src/rental/i18n/LanguageContext.tsx`
- `frontend/src/rental/i18n/translations/**`
- Rental `useLanguage` / `LanguageProvider` / `Locale` / `TranslationKey` / `translateKey` / `LOCALE_STORAGE_KEY`
- Legacy dictionary imports
- Canonical `frontend/src/i18n/**` imports

### Before counts

| Consumer class | Count | Replacement |
|----------------|-------|-------------|
| Rental production/test files importing via rental-relative `../i18n/` shim path | **376** | Depth-correct `../../i18n/` (etc.) → canonical runtime |
| Explicit `rental/i18n` import paths (cross-surface + tests) | **8** | `frontend/src/i18n/**` |
| Rental bridge implementation files | **12** | Deleted |
| Production `t()` keys depending on bridge fallback | **389** | Migrated into canonical catalogs via `rental-legacy-gap.*` |

### Representative consumer rows

| Importing file | Imported symbol | Kind | Canonical replacement | Adjustment |
|----------------|-----------------|------|----------------------|------------|
| `rental/components/TopBar.tsx` | `useLanguage` | production | `../../i18n/LanguageContext` | Direct canonical import |
| `rental/components/Sidebar.tsx` | `useLanguage` | production | `../../i18n/LanguageContext` | Direct canonical import |
| `rental/lib/legal-documents-i18n.ts` | `TranslationKey` | production | `../../i18n/translations/en` | Type path to canonical dictionary |
| `lib/email-i18n.ts` | `useLanguage` | production | `../i18n/LanguageContext` | Cross-surface canonical import |
| `rental/i18n/LanguageContext.tsx` | re-export shim | bridge | _(deleted)_ | Compatibility layer removed |

**Translation-key compatibility:** 640 rental-only English keys absent from canonical `en.ts` were merged into canonical dictionaries (`rental-legacy-gap.{locale}.ts` spreads). English/German wording preserved from legacy rental catalogs. Partial locales received only keys not already owned by their partial dictionaries (11 duplicate nav/fines keys deduped per locale).

---

## 4. Canonical-key closure evidence

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

## 5. Provider topology

### Before

```
App.tsx
└── LanguageProvider (canonical)
    └── BrowserRouter
        ├── LoginPage → canonical useLanguage (2B)
        ├── RentalApp → useLanguage via rental/i18n shim re-export
        └── OperatorApp
```

Rental shim delegated to canonical runtime and fell back to `rental/i18n/translations/*` on `missing-key`.

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

## 6. Deleted paths

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

## 7. Added / changed paths (high level)

**Added**

- `frontend/src/i18n/runtime-integration-2c.test.tsx`
- `frontend/src/i18n/translations/rental-legacy-gap.{en,de,fr,nl,es,it,pl,cs}.ts`
- `docs/audits/i18n-integration-2c-rental-bridge-retirement-2026-09-08.md`

**Changed**

- ~376 Rental (+ cross-surface) files: import paths → canonical `frontend/src/i18n/**`
- Canonical locale dictionaries `en.ts`, `de.ts`, partial locales: spread `rentalLegacyGap*`
- Integration tests `runtime-integration-2a.test.tsx`, `runtime-integration-2b.test.tsx`, `LanguageContext.test.tsx` (shim references removed)
- `translation-coverage-baseline.json` + `translation-coverage.test.ts` (mechanical sync to 10,431 canonical keys)

**Not changed (protected)**

- `frontend/src/i18n/i18n-structural-check.test.ts` (INTEGRATION-2 skip remains)
- `i18n-governance-scanner.test.ts`, `i18n-pr-gate.test.ts`, workflows, `AGENTS.md`, `.cursor/rules/i18n.mdc`

---

## 8. Legacy-consumer count

| Metric | Before | After |
|--------|--------|-------|
| Production imports of `rental/i18n/**` | 376 + 8 explicit | **0** |
| Rental shim files | 12 | **0** |
| Remaining references | — | 2 non-production: `i18n-structural-check.test.ts` (protected skip), `ArchitekturView.tsx` (historical prose) |

---

## 9. Test commands and results

| Command | Result |
|---------|--------|
| `npx vitest run src/i18n/runtime-integration-2c.test.tsx` | **8/8 pass** |
| `npx vitest run src/i18n/` | **242 pass**, 3 skipped (`i18n-structural-check` INTEGRATION-2 skip) |
| `npx vitest run src/pages/login-localization.test.tsx` | **7/7 pass** |
| `npx vitest run src/i18n/components/LanguageSelector.test.tsx` | **2/2 pass** |
| Sample Rental i18n tests (legal-docs, communication-center, connectivity) | **399/399 pass** |
| `npm run i18n:scanner:test` | **43 pass**, 2 skipped |
| `npm run i18n:pr-gate:test` | **113/113 pass** |
| `npm run i18n:check:ci` | **PASS** |
| `npm run build` | **PASS** |

### Repository search evidence (post-change)

```bash
rg 'rental/i18n' frontend/src --glob '!**/*.test.*'
# → only master/components/ArchitekturView.tsx (documentation prose)

rg "from '.*/rental/i18n" frontend/src
# → only i18n-structural-check.test.ts (protected, unchanged)
```

---

## 10. Governance classification

| Field | Value |
|-------|-------|
| Classification | `PRODUCT_RUNTIME_I18N_INTEGRATION` |
| Protected-path count in diff | **2** (`translation-coverage-baseline.json`, `translation-coverage.test.ts`) — mechanical canonical key-count sync only; no scanner/policy/workflow edits |
| Authority label | **None** (no governance manifest/scanner/pr-gate/structural-check edits) |
| Remaining protected structural-test skip | `i18n-structural-check.test.ts` INTEGRATION-2 rental-shim test **still skipped** — activation deferred to authority-only PR |
| `GOVERNANCE_AUTHORITY_CHANGED` (local pr-gate unit suite) | NO |

---

## 11. Residual risks

1. **Large catalog merge (+628 keys):** Low risk — values copied from proven rental dictionaries; registry reports de/en 100%.
2. **Partial-locale nav keys:** Some rental-only nav keys remain English in partial locales (pre-existing rental behavior for unmigrated nav subset).
3. **Protected structural test:** Shim deletion not yet asserted by CI until separate authority PR activates INTEGRATION-2 skip removal.
4. **ArchitekturView prose:** Still mentions `frontend/rental/i18n/translations` in historical documentation text (non-functional).

---

## 12. Rollback instructions

```bash
git revert <commit-sha>
# or
git checkout origin/main -- frontend/src/rental/i18n frontend/src/i18n/translations/rental-legacy-gap.*
# restore consumer imports from merge-base
```

Redeploy frontend build from reverted branch. No backend/DB migration involved.

---

## 13. PR status

**Draft PR — not merged.**
