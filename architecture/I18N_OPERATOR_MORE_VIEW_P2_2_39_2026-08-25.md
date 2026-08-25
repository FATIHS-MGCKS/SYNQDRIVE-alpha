# I18N — Operator More View (P2.2.39)

**Date:** 2026-08-25
**Baseline:** `0e01cd12cd888f4df20aad0c398c99823cc3286b`
**Campaign:** OPERATOR

## Scope

Presentation-only localization for the Operator More tab surface:

- `frontend/src/operator/views/OperatorMoreView.tsx`
- `frontend/src/operator/lib/operator-more-i18n.ts`

## Mount / identity

| Property | Value |
|----------|-------|
| Tab machine ID | `more` |
| Shell switch | `OperatorShell` → `OperatorTabContent` case `'more'` |
| Bottom nav | `OperatorBottomNav` item `{ id: 'more', label: 'Mehr' }` (shell; frozen ID) |
| Query param | `tab=more` via `operatorRoutes.ts` allowlist |

## Locale flow

`useLanguage().locale` → `operator-more-i18n.ts` (`om`, section/action helpers) → `operator.more.*` keys plus semantic reuse of `operator.bookings.form.createTitle`.

Theme preference labels use machine `ThemePreference` → `TranslationKey` map (`system` / `light` / `dark`); More view no longer calls `themePreferenceLabel()` from `lib/theme.ts`.

## Machine freeze

- Tab ID `more`, sheet discriminators `booking-create` / `ai-upload` / `tire-measure`
- `openSheet`, `setActiveTab`, `setScanQuery`, `cycleThemePreference` callbacks and arguments
- Vehicle picker state `pickerOpen: 'ai' | 'tire' | null`
- React keys `v.id`
- Link target `/rental`
- Section and row order

## Dynamic data (never translated)

- Vehicle display labels `${model} · ${license}`

## Out of scope (not in baseline More view)

User name, email, role, organization, station, logout, legal, support, version/build.

## Keys

- **New:** 17 EN+DE keys under `operator.more.*` (8578 → 8596)
- **Reused:** `operator.bookings.form.createTitle` (create booking action title)

## Guardrails

`P239_ENFORCE_CLEAN_EXACT` = `OperatorMoreView.tsx` + `operator-more-i18n.ts` — 0 findings.

## Tests

`frontend/src/operator/views/operator-more-localization.test.tsx`

## Semantics

Category E = 0. No overlap with Vehicle Operational State work (#1263, #1267, #1271).
