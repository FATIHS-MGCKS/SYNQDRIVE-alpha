# I18N-INTEGRATION-2A — Canonical Runtime Provider Activation

**Date:** 2026-09-08  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Base SHA:** `c9d9ea2d0f54be7797884201b68066f7a489fad5` (includes merged PR #1569)

---

## 1. Mission

Activate one canonical platform `LanguageProvider` at the application root and bridge the transitional Rental i18n API to the same runtime state.

**Out of scope:** broad copy migration, dictionary cleanup, legal-text changes, governance/baseline regeneration, backend changes.

---

## 2. Pre-implementation audit

### LanguageProvider mounts (before)

| Location | Provider | State |
|----------|----------|-------|
| `frontend/src/App.tsx` | **None** | — |
| `frontend/src/rental/App.tsx` | Rental `LanguageProvider` | Independent 8-locale context |
| Test files | Local wrappers | Isolated per test |

### React language contexts (before)

| Module | Context | Locales |
|--------|---------|---------|
| `frontend/src/i18n/LanguageContext.tsx` | Canonical platform | 9 (`de, en, pl, fr, cs, nl, es, tr, it`) |
| `frontend/src/rental/i18n/LanguageContext.tsx` | Independent Rental | 8 (no `tr`) |

### Persistence keys (before)

| Key | Writers |
|-----|---------|
| `synqdrive.locale` | Canonical `writePersistedLocale()` **and** Rental `LanguageContext` |

Both modules used the same key but with different validation rules (Rental rejected `tr`).

### Import surfaces

- **Canonical:** `frontend/src/i18n/LanguageContext` — platform tests, `LanguageSelector`, auth-error helpers
- **Rental shim:** `frontend/src/rental/i18n/LanguageContext` — ~100+ Rental components, Operator AI upload, communication tests

### Language selectors

| Surface | Mechanism | Runtime dependency |
|---------|-----------|-------------------|
| `LanguageSelector` (canonical) | `SUPPORTED_LOCALES` + `useLanguage()` | Canonical context |
| `TopBar` | Inline 8-locale list + `useLanguage()` | Rental shim (was independent) |
| `LoginPage` | Local `useState<'en' \| 'de'>` | **Not yet connected** (Integration 2B deferral) |

### Safest canonical placement

`frontend/src/App.tsx` inside `AppThemeProvider`, wrapping `BrowserRouter` — covers Login, Master, Rental, and Operator routes with one provider.

### Consumers not yet on compatibility bridge

- `LoginPage` — still uses isolated login copy state (documented deferral)
- `TopBar` — uses Rental shim hook but inline locale list omits Turkish in UI (runtime accepts `tr` via canonical state)

---

## 3. Implementation summary

### Provider topology (after)

```
AppThemeProvider
└── LanguageProvider (canonical)          ← frontend/src/i18n/LanguageContext.tsx
    └── BrowserRouter
        ├── LoginPage
        ├── MasterApp
        ├── RentalApp (no nested provider)
        └── OperatorApp
```

### Rental compatibility bridge

`frontend/src/rental/i18n/LanguageContext.tsx`:

- Re-exports canonical `LanguageProvider`
- `useLanguage()` delegates `locale` / `setLocale` to canonical runtime
- `t()` prefers canonical dictionary lookup, falls back to legacy Rental dictionaries for unmigrated keys
- Preserves Rental `TranslationKey` typing for existing consumers

### Persistence (after)

Single writer: canonical `writePersistedLocale()` via `setLocale()`.  
Single key: `synqdrive.locale` with 9-locale validation.

---

## 4. Changed paths

| Path | Change |
|------|--------|
| `frontend/src/App.tsx` | Mount canonical `LanguageProvider` |
| `frontend/src/rental/App.tsx` | Remove nested Rental provider |
| `frontend/src/rental/i18n/LanguageContext.tsx` | Compatibility bridge |
| `frontend/src/i18n/runtime-integration-2a.test.tsx` | Active Integration 2A tests (10) |
| `frontend/src/i18n/LanguageContext.test.tsx` | Unskip rental shim test |
| `frontend/src/i18n/i18n-structural-check.test.ts` | Unskip rental shim structural test |
| `frontend/src/rental/components/trips/trips-energy-timeline.test.tsx` | Add `tr` to locale fixture map (type alignment) |
| `docs/audits/i18n-integration-2a-runtime-provider-2026-09-08.md` | This audit |

**Authority-protected files changed:** **NONE**

---

## 5. Validation

| Command | Result |
|---------|--------|
| `runtime-integration-2a.test.tsx` | 10 passed |
| `LanguageContext.test.tsx` | 7 passed |
| `LanguageSelector.test.tsx` | 1 passed, 1 skipped |
| `locales.test.ts` | passed |
| `translation-registry.test.ts` | 11 passed |
| `i18n-structural-check.test.ts` | 8 passed |
| `npm run i18n:check:ci` | PASS |
| `npm run i18n:scanner:test` | 43 passed, 2 skipped |
| `npm run i18n:pr-gate:test` | 113 passed |
| `npm run build` | PASS |
| Authority harness | 15/15 |

### Remaining skipped i18n tests

| File | Skipped | Reason |
|------|--------:|--------|
| `i18n-governance-scanner.test.ts` | 2 | Legacy P2.3.1 compatibility block |
| `LanguageSelector.test.tsx` | 1 | Login/TopBar shared selector wiring — Login still local state |
| `hardcoded-copy-guard.test.ts` | (suite inactive) | Integration 2+ enforce-clean deferral |

---

## 6. Remaining compatibility debt

1. `LoginPage` local `en/de` state — wire to canonical provider (Integration 2B)
2. `TopBar` inline selector — migrate to shared `LanguageSelector` + 9 locales
3. Legacy Rental dictionary fallback in shim — remove after key parity migration
4. Rental `i18n/translations/*` duplicate dictionaries — retire after migration

---

## 7. Governance classification

Product/runtime-only PR. No governance-authority label required.

`AUTHORITY_CHANGED=NO` · `PRODUCT_OR_PRESENTATION_CHANGED=YES` (runtime wiring only, no copy migration)
