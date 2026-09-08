# I18N-INTEGRATION-2B — Canonical Login and TopBar Language-Surface Integration

**Date:** 2026-09-08  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Base SHA:** `d0a33aa1437319a6b94edefdef3204c08f987c78` (merged PR #1573)

---

## 1. Mission

Connect the remaining language-selection surfaces (Login and Rental TopBar) to the canonical runtime introduced by Integration 2A.

**Out of scope:** backend changes, legal-document translations, broad Rental UI copy migration, TopBar search/navigation copy, Rental compatibility bridge removal, legacy dictionary cleanup, governance baseline regeneration.

---

## 2. Pre-implementation audit (Phase 1)

### Baseline

| Item | Value |
|------|-------|
| `origin/main` SHA | `d0a33aa1437319a6b94edefdef3204c08f987c78` |
| PR #1573 present | Yes |

### Provider topology (before)

```
AppThemeProvider
└── LanguageProvider (canonical)
    └── BrowserRouter
        ├── LoginPage          ← isolated useState<'en' | 'de'> + local loginCopy
        ├── MasterApp
        ├── RentalApp
        └── OperatorApp
```

### LoginPage locale state (before)

- `useState<'en' | 'de'>('de')` — independent from canonical provider
- `showLangMenu` local dropdown with EN/DE only
- Component-local `loginCopy` registry with inline `t(key)` helper
- Hardcoded German MFA strings (`2FA bestätigen`, recovery toggle)
- Inline `locale === 'de' ? ... : ...` validation errors

### TopBar locale state (before)

- Inline `languages` array (8 locales, **no Turkish**)
- `selectedLanguage` + `isLanguageOpen` local state
- Duplicate dropdown markup calling `setLocale` from Rental shim

### Canonical translation patterns (existing)

- Login-owned keys already present in `frontend/src/i18n/translations/en.ts` and `de.ts` under `login.*`
- MFA keys under `twoFactor.*`; locally generated auth errors via `auth.error.*` + `translateAuthError()`
- `LanguageSelector` derives options from `SUPPORTED_LOCALES` (9 locales)

### Deferred Integration 2B tests (before)

| File | Status |
|------|--------|
| `LanguageSelector.test.tsx` | 1 skipped (`INTEGRATION-2`) |
| `i18n-structural-check.test.ts` | 1 skipped (rental shim re-export — unchanged) |

### Expected governance classification

**Product/runtime-only** — no protected authority paths; no `i18n-governance-authority-change` label required.

---

## 3. Implementation summary

### LoginPage (after)

- Consumes `useLanguage()` from `frontend/src/i18n/LanguageContext.tsx`
- Renders `<LanguageSelector variant="login-menu" />`
- All Login-owned UI copy via `t('login.*')`, `t('twoFactor.*')`
- Locally generated errors via `t('auth.error.*')` and `translateAuthError(locale, err)`
- Backend/API error payloads mapped through `auth-error-i18n.ts` — not treated as translation keys
- Removed: `loginCopy`, `useState<'en' | 'de'>`, `showLangMenu`, duplicate selector markup

### TopBar (after)

- Renders `<LanguageSelector variant="topbar-pill" />` from canonical i18n location
- Removed: inline `languages` array, `selectedLanguage`, `isLanguageOpen`, duplicate dropdown
- Continues using Rental compatibility `useLanguage()` hook for `topbar.*` translated copy
- Unrelated hardcoded search/navigation copy unchanged (out of scope)

### Selector topology (after)

| Surface | Component | Locales | Persistence |
|---------|-----------|---------|-------------|
| Login | `LanguageSelector variant="login-menu"` | 9 (incl. `tr`) | `synqdrive.locale` |
| TopBar | `LanguageSelector variant="topbar-pill"` | 9 (incl. `tr`) | `synqdrive.locale` |

---

## 4. Login translation-key inventory (`login.*`)

| Key | English | German |
|-----|---------|--------|
| `login.fleetManagement` | LIVE FLEET INTELLIGENCE | LIVE FLOTTEN-INTELLIGENZ |
| `login.headline` | See your fleet | Sehen Sie Ihre Flotte |
| `login.headlineBr` | in real time. | in Echtzeit. |
| `login.subPart1` | Live telemetry, | Live-Telemetrie, |
| `login.subHighlight1` | AI analytics | KI-Analyse |
| `login.subAnd` | and | und |
| `login.subHighlight2` | smart automation | smarte Automatisierung |
| `login.subPart2` | in one platform. | in einer Plattform. |
| `login.welcomeBack` | Welcome Back! | Willkommen zurück! |
| `login.subtitle` | Enter your details below to sign in. | Geben Sie Ihre Daten ein, um sich anzumelden. |
| `login.chooseOrg.title` | Choose your organization | Organisation auswählen |
| `login.chooseOrg.subtitle` | Your account has access to multiple organizations… | Ihr Konto hat Zugriff auf mehrere Organisationen… |
| `login.continue` | Continue | Weiter |
| `login.back` | Back | Zurück |
| `login.email` | Email | E-Mail |
| `login.password` | Password | Passwort |
| `login.emailPlaceholder` | name@company.com | name@unternehmen.com |
| `login.passwordPlaceholder` | •••••••• | •••••••• |
| `login.logIn` | Log in | Anmelden |
| `login.footer` | © 2026 SYNQDRIVE · Multi-Tenant Fleet Management SaaS | © 2026 SYNQDRIVE · Multi-Mandanten-Flottenmanagement SaaS |
| `login.showPassword` | Show password | Passwort anzeigen |
| `login.hidePassword` | Hide password | Passwort ausblenden |

**English/German parity:** 22/22 keys — complete parity.

**Related Login-flow keys (not `login.*` but used on Login):**

- `twoFactor.title`, `twoFactor.subtitle`, `twoFactor.codePlaceholder`, `twoFactor.recoveryPlaceholder`, `twoFactor.useRecovery`, `twoFactor.useAuthenticator`
- `auth.error.credentialsRequired`, `auth.error.organizationRequired`, plus mapped backend errors via `translateAuthError()`

### Fallback for other seven locales

`pl`, `fr`, `cs`, `nl`, `es`, `it` use partial dictionaries; `tr` has no dictionary. All `login.*` keys fall back to canonical English at lookup time (`translateKey` → `fallback-en`). No English values were copied into partial locale dictionaries.

---

## 5. Changed paths

| Path | Change |
|------|--------|
| `frontend/src/pages/LoginPage.tsx` | Canonical runtime + shared selector + canonical translations |
| `frontend/src/rental/components/TopBar.tsx` | Shared topbar-pill selector; removed inline locale registry |
| `frontend/src/i18n/runtime-integration-2b.test.tsx` | New Integration 2B behavioral tests |
| `frontend/src/pages/login-localization.test.tsx` | New Login localization tests |
| `frontend/src/i18n/components/LanguageSelector.test.tsx` | Activated INTEGRATION-2 skip |
| `docs/audits/i18n-integration-2b-language-surfaces-2026-09-08.md` | This audit |

**Protected governance paths changed:** none

---

## 6. Test results

| Suite | Result |
|-------|--------|
| `runtime-integration-2b.test.tsx` | 11 passed |
| `login-localization.test.tsx` | 7 passed |
| `LanguageSelector.test.tsx` | 2 passed (0 skipped) |
| `auth-error-i18n.test.ts` | 2 passed |
| All `frontend/src/i18n/` | 241 passed, 3 skipped |
| `i18n:scanner:test` | 43 passed, 2 skipped |
| `i18n:pr-gate:test` | 113 passed |
| `i18n:check:ci` | passed |
| `npm run build` (`tsc -b && vite build`) | passed |

### Repository search (post-change)

| Pattern | Result |
|---------|--------|
| Login `useState<'en' \| 'de'>` | Not found in `LoginPage.tsx` |
| `loginCopy` registry | Not found |
| TopBar inline `languages` array | Not found in production TopBar |
| Alternate locale persistence keys | None introduced |
| Duplicate `LanguageProvider` | Single mount in `App.tsx` |
| Skipped Integration 2B test | Activated |

---

## 7. Remaining i18n debt

| Item | Status |
|------|--------|
| TopBar search/navigation hardcoded copy | Out of scope — unchanged |
| Rental compatibility bridge + legacy dictionaries | Preserved per mission |
| `i18n-structural-check.test.ts` INTEGRATION-2 skip (rental shim) | Still skipped on main |
| `i18n-governance-scanner.test.ts` legacy P2.3.1 skips | Unchanged |
| Partial locale dictionaries (`pl`, `fr`, etc.) | English fallback at runtime |
| Turkish dictionary | `OFFICIAL_LOCALES_WITHOUT_DICTIONARY` — English fallback |

---

## 8. Governance classification

**Classification:** `PRODUCT_RUNTIME_I18N_INTEGRATION`  
**Authority label required:** No — zero protected governance paths in diff  
**Registry coverage status impact:** None — no module authority promotion/downgrade
