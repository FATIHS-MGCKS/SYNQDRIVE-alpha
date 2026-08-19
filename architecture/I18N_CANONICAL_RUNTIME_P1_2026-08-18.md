# I18N Canonical Platform Runtime P1.1

**Date:** 2026-08-18

## Decision

SynqDrive localization runtime is owned by `frontend/src/i18n/` and mounted once at `frontend/src/App.tsx`.

Rental-specific paths under `frontend/src/rental/i18n/` remain as transitional re-export shims only.

## Runtime contract

- **Locale state:** all 9 official product locales (`SupportedLocale`)
- **Dictionaries:** 8 locales with files under `frontend/src/i18n/translations/`; Turkish uses explicit English lookup fallback
- **Precedence:** persisted `synqdrive.locale` → `navigator.languages` → `en`
- **HTML lang:** `document.documentElement.lang` synced to canonical BCP-47 metadata
- **Diagnostics:** `translate()` returns `source: 'locale' | 'fallback-en' | 'missing-key'`

## Surfaces

| Surface | Provider | Dictionary |
|---------|----------|------------|
| Login | Shared (App root) | DE/EN copy shim (`login-copy.ts`) |
| Rental | Shared | Platform dictionaries |
| Operator | Shared | Rental keys via shared provider |
| Master | Shared | Not yet migrated (German nav debt) |

## Follow-up (P1.2+)

- Master `tMasterNav()` → platform keys
- Operator hardcoded strings → `operator.*` keys
- Remove rental i18n re-export shims after import migration
