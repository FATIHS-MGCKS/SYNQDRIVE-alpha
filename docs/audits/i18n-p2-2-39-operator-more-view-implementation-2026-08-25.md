# P2.2.39 — Operator More View — Implementation Record

**Date:** 2026-08-25
**Baseline:** `0e01cd12cd888f4df20aad0c398c99823cc3286b`
**Branch:** `cursor/p2239-operator-more-view-i18n-3c10`
**Pre-flight:** PR #1272 (not merged; no ancestry)

## Scope delivered

Localized Operator More View presentation in:

- `frontend/src/operator/views/OperatorMoreView.tsx`
- `frontend/src/operator/lib/operator-more-i18n.ts` (new adapter)
- `frontend/src/i18n/translations/operator.more.{en,de}.ts` (+17 new keys each; +1 semantic reuse)
- `frontend/src/operator/views/operator-more-localization.test.tsx` (8 tests)

## Production boundary

| Path | Role |
|------|------|
| `frontend/src/operator/views/OperatorMoreView.tsx` | More tab content |
| `frontend/src/operator/lib/operator-more-i18n.ts` | Presentation adapter |

**Mount:** `OperatorShell` → `OperatorTabContent` when `activeTab === 'more'`
**Tab machine ID:** `more` (unchanged)
**Route:** Operator shell; no dedicated route change
**Bottom nav label:** `Mehr` in `OperatorBottomNav` (shell-owned; out of P239 exact scope)

## Menu inventory

| Stable ID | Visible title (EN) | Subtitle | Icon | Callback / target | Dynamic? | Localized? |
|-----------|-------------------|----------|------|-------------------|----------|------------|
| `booking-create` | Create booking | Create a new rental booking | CalendarPlus | `openSheet({ type: 'booking-create' })` | No | Yes (title reuses `operator.bookings.form.createTitle`) |
| `ai-upload` | AI Upload | Capture documents at the vehicle | Sparkles | `pickVehicle('ai')` → sheet | Vehicle label raw | Yes |
| `tire-measure` | Measure tire tread | Record tread depth manually | Disc3 | `pickVehicle('tire')` → sheet | Vehicle label raw | Yes |
| `vehicle-picker` | Select vehicle | — | Car | per-vehicle `openSheet` | `${model} · ${license}` raw | Host chrome only |
| `search-in-vehicles` | Search in Vehicles → | — | — | `setActiveTab('vehicles')` | No | Yes |
| `nav-scan` | Search vehicle / Scan | — | — | `setScanQuery(''); setActiveTab('scan')` | No | Yes |
| `appearance-theme` | Theme | Theme: System/Light/Dark | ThemeToggleButton | `cycleThemePreference` | preference machine value | Yes (map-only) |
| `web-app` | Open web app | — | ExternalLink | `Link to="/rental"` | No | Yes |
| `info-body` | — | Info paragraph | Info | — | No | Yes |

**Not in scope:** user/org/station/logout/legal/support/version rows (not present in baseline More view).

## Machine / semantic freeze (verified)

| Domain | Frozen |
|--------|--------|
| Tab ID | `more` |
| React keys | `v.id` for vehicle picker rows |
| Sheet types | `booking-create`, `ai-upload`, `tire-measure` |
| Theme preference | `system` / `light` / `dark` machine values |
| Vehicle labels | `${model} · ${license}` never translated |
| Internal navigation | `setActiveTab('scan'|'vehicles')`, `setScanQuery('')` |
| External link | `href="/rental"` unchanged |
| Permissions / feature flags | None in More view |
| Logout / account | Not present |
| Section / item order | Identical to baseline |

## Key reuse

| Bucket | Keys |
|--------|------|
| **NEW** | 17 `operator.more.*` per locale |
| **SEMANTIC REUSE** | 1 `operator.bookings.form.createTitle` (EXACT) |

## Adapter strategy

**EXTEND EXISTING OPERATOR PRESENTATION ADAPTER** → new bounded `operator-more-i18n.ts` with `om()` helper. Presentation-only; no business logic.

## Dictionary accounting

| Metric | Before | After |
|--------|-------:|------:|
| EN | 8578 | 8596 |
| DE | 8578 | 8596 |
| Parity | 100% | 100% |
| Orphans | 0 | 0 |

## Scanner accounting

| Metric | Before | After |
|--------|-------:|------:|
| P239 scoped findings | 9 | **0** |
| Operator total | 77 | 69 |
| Global enforce-clean | 0 | 0 |

## Tests

`operator-more-localization.test.tsx` — 8 tests PASS

Coverage: enforce-clean debt, DE/EN render, same-mount locale switch with vehicle labels preserved, booking-create callback, theme preference map, create-title reuse, web app link target.

## Validation

| Check | Result |
|-------|--------|
| `npm run i18n:check` | PASS |
| `npm run build` | PASS |
| `npm run check:surface` | PASS |
| `git diff --check` | PASS |
| Category E | 0 |
| P238 | 0 |
| #1263/#1267/#1271 overlap | NO |

## Collision / drift

| Item | Classification |
|------|----------------|
| Active PR collision | NONE |
| Main drift on P239 paths | LOW (presentation-only i18n expected on main eventually) |
| Current main SHA | `6e87db96e470ee6c50d570b856bc8091c4f734c1` |

## Verdict

**A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT P2.2.39 RE-AUDIT**

P2.2.39 implementation is ready for independent re-audit.
