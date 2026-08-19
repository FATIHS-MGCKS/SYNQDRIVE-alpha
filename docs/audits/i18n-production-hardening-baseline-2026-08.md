# SynqDrive i18n Production Hardening Baseline

**Date:** 2026-08-18  
**Phase:** P0.1 — Governance & Baseline  
**Repository:** SYNQDRIVE-alpha

## Executive Summary

SynqDrive has a mature **rental-surface** localization stack centered on `LanguageProvider` + large `de`/`en` translation dictionaries (~3,149 keys each), with six additional runtime locales (`fr`, `nl`, `es`, `it`, `pl`, `cs`) that mostly inherit English via `...en` spreads and partial overrides. **Login** and **Master** use separate, narrower localization paths. **Operator** consumes rental `useLanguage()` in at least one flow but is **not** wrapped in `LanguageProvider`, so it relies on the default English context fallback.

This P0.1 pass establishes:

- a **canonical 9-locale product contract** (`frontend/src/i18n/locales.ts`)
- a **mandatory Cursor i18n rule** (`.cursor/rules/i18n.mdc`)
- **structural CI guardrails** (`npm run i18n:check`) without breaking CI on known dictionary debt
- **Turkish (`tr`) registered officially** but **runtime dictionary/selector registration deferred** to avoid fake completeness

No mass translation migration was performed in this phase.

## Official Product Locales

| Locale | Language |
|--------|----------|
| de | Deutsch |
| en | English |
| pl | Polski |
| fr | Français |
| cs | Čeština |
| nl | Nederlands |
| es | Español |
| tr | Türkçe |
| it | Italiano |

Canonical source: `frontend/src/i18n/locales.ts`

## Current Architecture

| Layer | Location | Role |
|-------|----------|------|
| Canonical locale registry | `frontend/src/i18n/locales.ts` | Official 9-locale contract, BCP-47 tags, browser resolution |
| Rental runtime provider | `frontend/src/rental/i18n/LanguageContext.tsx` | `LanguageProvider`, `useLanguage()`, `t(key)` |
| Translation dictionaries | `frontend/src/rental/i18n/translations/*.ts` | Per-locale string maps; `en.ts` defines `TranslationKey` |
| Legal document dictionaries | `legal-documents.en.ts`, `legal-documents.de.ts` | Spread into `en` / `de` only |
| Master nav copy | `frontend/src/master/navigation/master-nav-i18n.ts` | German-only `tMasterNav()` helper |
| Login copy | `frontend/src/pages/LoginPage.tsx` | Inline `loginCopy` map (`en` + `de` only) |
| Email copy (backend/frontend) | `backend/.../billing-email-i18n.ts`, `frontend/src/lib/email-i18n.ts` | Separate from rental UI provider |
| Evaluations metrics labels | `shared/evaluations-metrics/evaluations-metric.i18n.ts` | Shared contract labels |

### Locale state

- **Rental:** `localStorage` key `synqdrive.locale` + React state in `LanguageProvider`
- **Login:** component-local `useState<'en' \| 'de'>`, default `de`; no persistence
- **Master:** no locale state; hardcoded German strings in `master-nav-i18n.ts`

### Fallback behavior

`LanguageContext.t()` resolves: `translations[locale][key] ?? translations.en[key] ?? key`

Simple `{var}` string interpolation is supported; no ICU/plural library.

### Browser-language detection (pre-P0.1)

Only `de*` prefixes were detected; everything else defaulted to `en`.

**Post-P0.1 (rental only):** `resolveRuntimeTranslationLocale()` maps all official BCP-47 prefixes for runtime locales; Turkish resolves to `en` until runtime registration.

## Current Application Surface Coverage

| Surface | Shared `LanguageProvider`? | Localization approach | Official 9-locale support |
|---------|---------------------------|------------------------|---------------------------|
| **Login** | No | Inline `loginCopy` (`en`, `de`) | No — 2 locales only |
| **Rental** | Yes (`rental/App.tsx`) | `useLanguage().t()` + dictionaries | Partial — 8 runtime locales; `tr` not runtime-registered |
| **Operator** | No (not wrapped) | Mixed; `OperatorAiUploadFlow` calls `useLanguage()` → default English context | No — depends on rental provider ancestor (absent) |
| **Master** | No | `tMasterNav()` German-only | No — German only |

## Translation Dictionary Assessment

| Locale | File | Approx. key assignments | `...en` inheritance | Notes |
|--------|------|-------------------------|---------------------|-------|
| en | `en.ts` | ~3,149 | — | Source of `TranslationKey`; includes `legal-documents.en` |
| de | `de.ts` | ~3,149 | No | Full dictionary + `legal-documents.de` |
| fr | `fr.ts` | ~786 | Yes | Partial overrides; document-upload FR tests exist |
| nl | `nl.ts` | ~493 | Yes | Shell/nav/common partial |
| es | `es.ts` | ~493 | Yes | Shell/nav/common partial |
| it | `it.ts` | ~493 | Yes | **Italian preserved**; partial shell overrides |
| pl | `pl.ts` | ~493 | Yes | Partial; missing Polish diacritics in places |
| cs | `cs.ts` | ~493 | Yes | Partial shell |
| tr | — | — | — | **Not registered at runtime in P0.1** (intentional) |

**Italian:** Present in runtime dictionaries, language selector, and canonical registry.  
**Turkish:** Present in canonical registry only; no `tr.ts`, not in `LanguageProvider` or TopBar selector.

## Hardcoded UI String Assessment

Significant hardcoded user-visible strings remain outside translation dictionaries:

- **Login** (`LoginPage.tsx`): entire marketing + auth UI in inline bilingual map; validation errors inline `de`/`en`
- **Master** (`master-nav-i18n.ts` + many views): predominantly German hardcoded UI
- **Operator** shell/views: largely hardcoded (voice-assistant builder lists Turkish as a voice language option, separate from product UI locale)
- **Rental:** many `toLocaleString('de-DE')` / manual German strings in lib utilities (tasks, service info, RPM webhooks, etc.)

## Locale Detection Assessment

| Area | Detection | Persistence | Gap |
|------|-----------|-------------|-----|
| Rental (before P0.1) | `de*` → de, else en | `localStorage` | Ignored fr/pl/cs/nl/es/it browser prefs |
| Rental (after P0.1) | BCP-47 prefix map for 8 runtime locales | `localStorage` | Turkish browser users get `en` until P3 |
| Login | Manual toggle only | None | No browser detection |
| Master | None | None | German only |

## Formatting / Pluralization Assessment

- **No pluralization library** (no ICU MessageFormat / `Intl.PluralRules` usage in rental i18n)
- **Mixed `Intl` usage:** some modules use `Intl.DateTimeFormat` / `Intl.NumberFormat` with locale tags; many others hardcode `de-DE` or binary `de ? 'de-DE' : 'en-US'`
- **Currency:** EUR formatting often via `de-DE` regardless of selected UI locale
- **Interpolation:** simple `{name}` replacement only

## Legal-document Localization Assessment

- Dedicated `legalDocuments.*` keys (~268) with **full DE/EN parity** and tests (`legal-documents.i18n.test.ts`)
- Other locales inherit English legal strings via `...en` — **not legally reviewed translations**
- Admin disclaimer and lifecycle copy distinguish operational vs legal-review status in DE/EN

## Agent / Repository Governance Assessment

| Artifact | Status (pre-P0.1) | Status (post-P0.1) |
|----------|--------------------|--------------------|
| `AGENTS.md` i18n section | Absent | Added concise rule |
| `.cursor/rules/i18n.mdc` | Absent | Added (always-apply) |
| Canonical locale registry | Absent (duplicated in TopBar + `LanguageContext` type) | `frontend/src/i18n/locales.ts` |
| Structural i18n CI check | Absent | `npm run i18n:check` |
| Translation completeness CI | Partial (legal docs DE/EN, FR doc-upload spot checks) | Unchanged — deferred to P3/P6 |

## Identified Architectural Debt

### P0 Critical

- **Operator surface not wrapped in `LanguageProvider`** — `useLanguage()` falls back to English defaults
- **No repository-wide governance** for 9-locale product contract (addressed in P0.1)
- **Turkish official but not runtime-ready** — must not fake completeness with `...en` (deferred intentionally)

### P1 High

- **Login isolated bilingual system** — not integrated with rental i18n
- **Master German-only `tMasterNav()`** — no locale switching, no shared provider
- **Single rental provider not hoisted to app root** — blocks Operator/Master sharing
- **Browser locale detection was minimal** (partially improved for rental in P0.1)

### P2 Medium

- **`...en` inheritance** across fr/nl/es/it/pl/cs masks incomplete translations
- **Hardcoded `de-DE` formatting** scattered across rental libs
- **No pluralization / ICU message support**
- **Polish/Czech/Italian partial dictionaries** missing diacritics in places

### P3 Low

- Voice-assistant language picker includes `tr` as voice language while product UI locale `tr` is not registered
- Backend/shared email i18n not aligned with frontend locale registry

## Target Architecture Principles

1. One canonical locale registry for all surfaces (`frontend/src/i18n/locales.ts`)
2. One platform-wide `LanguageProvider` at app shell level (Login + Rental + Operator + Master)
3. Semantic stable keys in `translations/en.ts`; no sentence-as-key
4. Real per-locale dictionaries — no permanent `...en` inheritance
5. Locale-aware formatting utilities keyed off `getFormattingLocale(locale)`
6. ICU or plural-rule-aware messaging for count-dependent copy
7. Legal strings remain explicitly flagged; machine translation ≠ legal review
8. CI gates: structural invariants (P0) → key parity (P3) → production readiness (P6)

## Migration Constraints

- Do not delete existing translation work
- Do not remove Italian
- Do not fake Turkish completeness
- Do not mass-translate in P0
- Do not introduce duplicate providers or competing frameworks
- Do not break CI on known `...en` debt in P0.1

## Proposed Remediation Phases

### P0 — Governance & Guardrails (this phase)

- Canonical 9-locale registry
- Cursor rule + AGENTS.md
- Structural `i18n:check`
- Baseline audit document

### P1 — Canonical platform-wide i18n architecture

- Hoist `LanguageProvider` to `frontend/src/App.tsx`
- Unify Login + Master on shared provider
- Wire Operator shell to shared locale state
- Register Turkish runtime dictionary path (empty/scaffold only, no `...en`)

### P2 — Hardcoded string extraction

- Login → translation keys
- Master views → `master.*` keys
- Operator shell → `operator.*` keys
- Replace manual `de-DE` literals in high-traffic rental libs

### P3 — Nine-language dictionary completion

- Remove `...en` inheritance locale-by-locale
- Native translations for pl/fr/cs/nl/es/it/tr
- Strict key-parity CI gate

### P4 — Locale-aware formatting and pluralization

- Shared formatting helpers using BCP-47 from canonical registry
- Plural rules per locale

### P5 — Surface-by-surface visual/functional language QA

- Login, Rental, Operator, Master QA in all 9 locales

### P6 — Strict CI enforcement and production readiness

- Full dictionary completeness in CI
- Block merges on missing keys / ASCII-fallback violations
- Production readiness sign-off

## P1.1 Canonical Runtime Outcome

**Date:** 2026-08-18

### Old runtime ownership

- `LanguageProvider` lived under `frontend/src/rental/i18n/LanguageContext.tsx` and was mounted only in `rental/App.tsx`
- Translation dictionaries lived under `frontend/src/rental/i18n/translations/`
- Login owned independent `useState<'en' | 'de'>` locale state and inline `loginCopy`
- Operator/Master had no shared provider ancestor

### New canonical runtime ownership

| Concern | Canonical location |
|---------|-------------------|
| Locale registry | `frontend/src/i18n/locales.ts` |
| Platform provider + `t()` / `translate()` | `frontend/src/i18n/LanguageContext.tsx` |
| Translation dictionaries | `frontend/src/i18n/translations/` |
| Public exports | `frontend/src/i18n/index.ts` |
| Rental compatibility shim | `frontend/src/rental/i18n/LanguageContext.tsx` (re-export only) |
| Rental translation shim | `frontend/src/rental/i18n/translations/*.ts` (re-export only) |

### Provider placement

`LanguageProvider` is mounted once in `frontend/src/App.tsx` inside `AppThemeProvider`, wrapping `BrowserRouter` and all routes (Login, Rental, Operator, Master). The nested provider was removed from `rental/App.tsx`.

### Locale precedence algorithm

1. Valid persisted locale from `localStorage` key `synqdrive.locale`
2. First supported locale from `navigator.languages` preference order
3. Canonical default `en`

### Persistence strategy

- Single key: `synqdrive.locale` (preserved from pre-P1.1 rental runtime)
- Stored values validated against `OFFICIAL_PRODUCT_LOCALE_CODES`
- Invalid/legacy values ignored safely; browser preference used next

### Browser resolution

- `resolveBrowserLocaleFromPreferenceList()` walks `navigator.languages` in order
- All 9 official BCP-47 prefixes supported (`de-*`, `en-*`, `pl-*`, `fr-*`, `cs-*`, `nl-*`, `es-*`, `tr-*`, `it-*`)
- Unsupported tags fall back to `en`

### Compatibility shims (transitional debt)

- `frontend/src/rental/i18n/LanguageContext.tsx` re-exports platform runtime
- `frontend/src/rental/i18n/translations/*.ts` re-export platform dictionaries
- Existing rental import paths continue to work without a mass import rewrite

### Turkish temporary behavior

- `tr` is selectable in canonical locale state and language selectors
- Listed in `OFFICIAL_LOCALES_WITHOUT_DICTIONARY`
- No `tr.ts` dictionary file; lookup uses explicit English fallback via `translateKey()` (`source: 'fallback-en'`)
- `usesDictionaryFallback: true` exposed on context for Turkish locale

### Login temporary dictionary behavior

- Login consumes canonical `useLanguage()` locale state (no independent locale state machine)
- Language selector lists all 9 locales from `SUPPORTED_LOCALES`
- Copy remains DE/EN only via `frontend/src/pages/login-copy.ts`; other locales fall back to English strings explicitly

### Remaining P2/P3 debt

- Master still uses German-only `tMasterNav()` (not yet on platform `t()`)
- Operator shell strings still mostly hardcoded (now has provider ancestor)
- Mass dictionary completion and `...en` inheritance removal (P3)
- Locale-aware formatting helpers (P4)
- Strict translation-key parity CI (P6)

## P1.2 Translation Registry & Dictionary Contract Outcome

**Date:** 2026-08-19

### Baseline before P1.2

| Locale | Owned keys (explicit) | `...en` spread | Status |
|--------|----------------------|----------------|--------|
| en | 3525 | No | COMPLETE |
| de | 3525 | No | COMPLETE |
| fr | 786 | Yes | PARTIAL (false completeness) |
| nl, es, it, pl, cs | 493 each | Yes | PARTIAL (false completeness) |
| tr | 0 | N/A | Not runtime-registered (P1.1) |

Legal documents: separate `legal-documents.en.ts` / `legal-documents.de.ts` merged into `en`/`de` only.

### Changes in P1.2

1. **Removed `...en` inheritance** from `fr`, `nl`, `es`, `it`, `pl`, `cs` source dictionaries
2. **Dictionary type contracts:** `CompleteTranslationDictionary` vs `PartialTranslationDictionary` (`dictionary-types.ts`)
3. **Canonical translation registry:** `translation-registry.ts` with per-locale status metadata
4. **Runtime fallback semantics:** `translateKey()` returns `source: 'locale' | 'fallback-en' | 'missing-key'`
5. **Turkish:** empty typed `tr.ts`; status `fallback-only`; selectable; English fallback at runtime
6. **Italian:** 493 owned keys preserved; e.g. `common.save` → `Salva` with `source: 'locale'`
7. **Legal separation:** `legal-documents-registry.ts` — only DE/EN `legally-reviewed`
8. **Shared language selector:** `LanguageSelector.tsx` used by Login + Rental TopBar
9. **Coverage baseline:** `translation-coverage-baseline.json` + extended `npm run i18n:check`
10. **Master/Operator structural integration:** shell chrome consumes `useLanguage()` metadata

### Current coverage (post-P1.2)

Canonical keys: **3525**

| Locale | Owned | Coverage | Status |
|--------|-------|----------|--------|
| en | 3525/3525 | 100% | COMPLETE |
| de | 3525/3525 | 100% | COMPLETE |
| fr | 786/3525 | 22.3% | PARTIAL |
| pl | 493/3525 | 13.99% | PARTIAL |
| cs | 493/3525 | 13.99% | PARTIAL |
| nl | 493/3525 | 13.99% | PARTIAL |
| es | 493/3525 | 13.99% | PARTIAL |
| it | 493/3525 | 13.99% | PARTIAL |
| tr | 0/3525 | 0% | FALLBACK ONLY |

### Turkish status

- Official locale, selectable in all language selectors
- Empty `PartialTranslationDictionary` (`tr.ts`)
- `hasLocaleDictionary: false`, `usesEnglishFallback: true`
- All lookups resolve via explicit English fallback (`source: 'fallback-en'`)

### Italian status

- Official locale with 493 explicit owned translations
- No `...en` inheritance
- Missing keys fall back to English at runtime

### Legal localization status

| Locale | Product UI | Legal documents |
|--------|-----------|-----------------|
| en | COMPLETE | legally-reviewed (`legal-documents.en`) |
| de | COMPLETE | legally-reviewed (`legal-documents.de`) |
| fr, nl, es, it, pl, cs, tr | PARTIAL or fallback | runtime-fallback (not legally reviewed) |

### Compatibility shims

| Path | Role | Consumer count (approx.) |
|------|------|--------------------------|
| `frontend/src/rental/i18n/LanguageContext.tsx` | Re-export platform runtime | via `../i18n/` imports (~36 rental files) |
| `frontend/src/rental/i18n/translations/*.ts` | Re-export platform dictionaries | tests + legacy lib imports |
| Direct `frontend/src/i18n/*` | Canonical imports | ~156 rental files + Login/Master/Operator |

Shim removal condition: migrate remaining `../i18n/` rental imports to `../../i18n/` or `@/i18n` alias (P2+).

### Remaining P2/P3 work

- Master `tMasterNav()` → platform `master.*` keys
- Operator shell hardcoded strings → `operator.*` keys
- Rental mass hardcoded string extraction (P2.2)
- Fill partial locale dictionaries (P3)
- Locale-aware formatting migration (P4)
- Strict completeness CI (P6)

## P2.1 Hardcoded Copy Inventory & Login Outcome

**Date:** 2026-08-19

### Inventory methodology

- Scanner: `frontend/scripts/i18n-hardcoded-scan.mjs`
- Inventory: `frontend/src/i18n/hardcoded-copy-inventory.json`
- Deduped by surface + category + normalized sample
- Excludes translation dictionaries, tests, developer-only strings

### Baseline counts (post-P2.1 scan)

| Metric | Count |
|--------|------:|
| Total unique findings | 3339 |
| Rental | 1948 |
| Master | 1114 |
| Operator | 196 |
| Shell/shared | 42 |
| Shared/lib | 39 |
| Login (enforce-clean) | **0** |

### Login migration

| Metric | Before P2.1 | After P2.1 |
|--------|------------:|-----------:|
| Independent copy shim (`login-copy.ts`) | Yes (22 keys) | **Removed** |
| Hardcoded MFA dialog (DE only) | Yes | **0** — `twoFactor.*` keys |
| Login enforce-clean findings | ~30 user-visible strings | **0** |

### Shell/shared migration (P2.1 scope)

| Component | Outcome |
|-----------|---------|
| `LanguageSelector` | `languageSelector.label`, `languageSelector.selectLanguage` |
| `VerificationDonePage` | `verification.done.*` |
| `AppErrorBoundary` (defaults) | `shell.errorBoundary.*` |
| `App.tsx` | No user-visible copy |

Shell/shared remaining debt: **42** findings (non-Login global components, error boundaries with explicit English props in Rental, etc.)

### Canonical keys

| | Count |
|--|------:|
| Before P2.1 | 3525 |
| After P2.1 | **3574** (+49) |

### Coverage after P2.1

| Locale | Owned | Coverage | Status |
|--------|------:|----------|--------|
| en | 3574/3574 | 100% | COMPLETE |
| de | 3574/3574 | 100% | COMPLETE |
| fr | 786/3574 | 21.99% | PARTIAL |
| pl | 493/3574 | 13.79% | PARTIAL |
| cs | 493/3574 | 13.79% | PARTIAL |
| nl | 493/3574 | 13.79% | PARTIAL |
| es | 493/3574 | 13.79% | PARTIAL |
| it | 493/3574 | 13.79% | PARTIAL |
| tr | 0/3574 | 0% | FALLBACK ONLY |

Partial locale % decrease vs P1.2 is **expected** (new EN/DE-only keys, no regression in owned counts).

### Auth error localization

`auth-error-i18n.ts` maps known backend messages to semantic keys; unknown errors use `auth.error.generic`.

### Guardrails

`npm run i18n:check` enforces `enforceCleanRemaining === 0` for Login, LanguageSelector, VerificationDone, App shell.

### Next phase

**P2.2:** Rental hardcoded string extraction using inventory surface=`RENTAL` (1948 items).

## P2.2.1 Rental Navigation & Dashboard Outcome

### Module inventory (Rental, post-P2.2.1 scan)

| Module | Findings |
|--------|----------:|
| other Rental areas | 1020 |
| Automation | 183 |
| Bookings | 146 |
| Tasks | 142 |
| Finance/Billing | 129 |
| Settings | 102 |
| Customers | 67 |
| Support | 19 |
| Fleet / Vehicles | 13 |
| Documents | 13 |
| Stations | 7 |
| App / routing shell | 1 |
| **TopBar** | **0** |
| **Sidebar / navigation** | **0** |
| **Dashboard** | **0** |

### Clean-zone scope

- `rental/components/TopBar.tsx`
- `rental/components/Sidebar.tsx`
- `rental/components/DashboardView.tsx`
- `rental/components/dashboard/**` (including notifications rendered on dashboard, Fleet Readiness, KPI strips, drilldown drawer)

### Findings before/after (P2.2.1 scope)

| Area | Before | After |
|------|-------:|------:|
| TopBar + Sidebar | 3 | **0** |
| Dashboard tree | 46 | **0** |
| Rental total | 1948 | **1842** |
| Global total | 3339 | **3167** |

Scanner false positives corrected (deterministic): JSX `title={fn(...)}` function calls, property-chain samples, TypeScript generic `>` TEXT matches in `.ts` files, `??` identifier patterns.

### Canonical keys

| | Count |
|--|------:|
| After P2.1 | 3574 |
| After P2.2.1 | **3960** (+386) |

### Coverage after P2.2.1

| Locale | Owned | Coverage | Status |
|--------|------:|----------|--------|
| en | 3960/3960 | 100% | COMPLETE |
| de | 3960/3960 | 100% | COMPLETE |
| fr | 786/3960 | 19.86% | PARTIAL |
| pl | 493/3960 | 12.46% | PARTIAL |
| cs | 493/3960 | 12.46% | PARTIAL |
| nl | 493/3960 | 12.46% | PARTIAL |
| es | 493/3960 | 12.46% | PARTIAL |
| it | 493/3960 | 12.46% | PARTIAL |
| tr | 0/3960 | 0% | FALLBACK ONLY |

### Shim imports (rental)

| Path | Count (after P2.2.1) |
|------|----------------------:|
| `../i18n/` (compat) | **35** files |
| `../../i18n/` (canonical) | **157+** files |

Touched P2.2.1 files migrated to `../../i18n/` or `../../../i18n/` as appropriate.

### Formatting / pluralization debt

- Touched dashboard formatters use `dashboardFormattingLocale` / `getFormattingLocale`.
- `topbar.resultCountOne` / `topbar.resultCountMany` — P4 pluralization debt.
- Repo-wide formatting locale literals outside P2.2.1 scope remain.

### Validation

- `npm run i18n:check` — pass (enforce-clean 0)
- `src/rental/components/rental-nav-dashboard-localization.test.tsx` — pass
- `npm test` — 2532 passed, **7** pre-existing Fleet Health failures (unchanged)
- `npm run build` — pass

### Next phase

**P2.2.2:** Vehicles, Vehicle Detail & Fleet Health — completed (see below).

---

## P2.2.2 Vehicles, Vehicle Detail & Fleet Health Outcome

### True vehicle-domain baseline (pre-extraction)

P2.2.1 scanner reported ~13 “Fleet / Vehicles” findings. Path-based reclassification identified **~475 findings / ~58 files** across Fleet shell, Vehicle Detail, Overview, Trips, Health, Maintenance, fleet-health-service, and vehicle-bookings chrome.

### Clean-zone boundary

See `architecture/I18N_RENTAL_VEHICLES_HEALTH_P2_2_2_2026-08-19.md` groups A–G (Fleet shell, Vehicle Detail, Overview, Trips, Health, Maintenance, shared vehicle helpers).

### Findings before/after

| Metric | Before P2.2.2 | After P2.2.2 |
|--------|---------------|--------------|
| Global findings | 3167 | **2712** |
| Rental findings | 1842 | **1390** |
| Vehicle submodule findings | ~475 | **0** (enforce-clean) |
| P2.2.2 enforce-clean | debt | **0** |

### Canonical keys

| | Count |
|--|-------|
| After P2.2.1 | 3960 |
| After P2.2.2 | **4687** (+727 EN+DE) |

### Coverage after P2.2.2

| Locale | Owned | Missing | % | Status |
|--------|-------|---------|---|--------|
| en | 4687 | 0 | 100% | COMPLETE |
| de | 4687 | 0 | 100% | COMPLETE |
| pl | 493 | 4194 | 10.52% | PARTIAL |
| fr | 786 | 3901 | 16.77% | PARTIAL |
| cs | 493 | 4194 | 10.52% | PARTIAL |
| nl | 493 | 4194 | 10.52% | PARTIAL |
| es | 493 | 4194 | 10.52% | PARTIAL |
| tr | 0 | 4687 | 0% | FALLBACK ONLY |
| it | 493 | 4194 | 10.52% | PARTIAL |

### Keys reused vs created

- **Reused:** `vehicle.*`, `vehicleDetail.*`, `fleet.*`, `health.*`, `trips.*`, `serviceCenter.*`, `fleetHealthService.*`, `vehicle.status.*`, `dashboard.operations.status.*`, `common.retry`, `invoices.dueDate`, `serviceCenter.tasks.loadError`, etc.
- **Created (~727):** health/trips/service/vehicle-bookings extensions; `common.reload`, `common.open`, `fleet.stat.return`, `serviceCenter.create.titleField`, `vehicle.tasks.*` error copy, etc.
- **Avoided:** duplicate per-component health status keys where one semantic key suffices.

### Telemetry / status / DTC / maintenance

- Telemetry state identifiers unchanged; presentation via `TranslationKeys`.
- DTC codes unchanged; UI labels localized.
- TÜV/BOKraft proper names preserved.
- `getFormattingLocale()` replaces `de-DE`/`en-US`/`en-GB` in enforce-clean vehicle files.

### Compatibility shims

Deterministic inventory: `node frontend/scripts/i18n-shim-inventory.mjs` (also run by `npm run i18n:check`).

| Metric | P2.2.1 | After P2.2.2 verification |
|--------|-------:|--------------------------:|
| `../i18n/` compat (total) | **35** | **33** |
| `../i18n/` compat (production) | ~24 | **22** |
| `../i18n/` compat (test) | ~11 | **11** |
| `../../i18n/` canonical | 157+ | **310** |

**Definition:** static import specifier exactly `../i18n/...` under `src/rental/` (resolves to `rental/i18n/` shim). Two-or-more `../` segments before `i18n/` count as canonical (`src/i18n/`).

**35 → 44 discrepancy root cause:** P2.2.2 interim report used a broader pattern (`../i18n/` substring match) that also counted `../../i18n/` canonical imports (e.g. 44 ≈ 33 true compat + 11 false positives). True compat count **decreased** by 2 vs P2.2.1; P2.2.2 did **not** add new vehicle-domain compat consumers (touched fleet/vehicle files use `../../i18n/` or deeper).

### P2.2.2 final verification (formatting locale)

- React surfaces in the P2.2.2 clean zone use `formattingLocale` / `locale` from `useLanguage()` or pass `SupportedLocale` into `vehicleFormattingLocaleOrDefault(locale)`.
- `vehicle-i18n.ts` resolves all nine official locales (not only de/en).
- Regression tests: `locales.test.ts` (nine-locale BCP-47 map) + `rental-vehicles-health-localization.test.tsx` (pl formatting path).
- Pure presentation libs default to `DEFAULT_PRODUCT_LOCALE` when no caller locale is supplied (acceptable for non-React builders); React call sites in scope pass active locale.

### Fleet Health test baseline

`npm test` — **7 failures** (unchanged pre-existing domain tests). No new failures from localization-only changes.

### Validation

- `npm run i18n:check` — pass (enforce-clean 0)
- `rental-vehicles-health-localization.test.tsx` — pass
- `npm run build` — pass

### Remaining Rental debt

**1390** findings — primarily Bookings (106), Tasks (113), Settings (102), Finance (129), Automation (183), Customers (67), and 655 in misc “other Rental areas”.

### Next phase

**P2.2.3:** Bookings surfaces, Customers, Tasks, Settings, Finance/Billing.
