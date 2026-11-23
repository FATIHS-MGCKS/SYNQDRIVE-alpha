# UX-007 — Rental legacy communication view cleanup

**Date:** 2026-11-23  
**Base SHA:** `dc59b5dee` (post #2505)  
**Contract:** [`NAVIGATION_URL_CONTRACT.md`](../../../governance/NAVIGATION_URL_CONTRACT.md)

## Usage audit

| Category | `whatsapp-business` | `ai-voice-assistant` |
|----------|---------------------|----------------------|
| Historical external URL | YES — `?view=` query | YES |
| Compatibility adapter | `LEGACY_WHATSAPP_VIEW`, `LEGACY_VOICE_VIEW` | `VOICE_ASSISTANT_VIEW` constant |
| Active `currentView` union | **REMOVED** (UX-007) | **REMOVED** |
| UI callbacks / sidebar | **0 producers** (pre-existing) | **0 producers** |
| Tests | `legacy-communication-navigation.test.ts` | same + voice URL tests |
| Historical architecture docs | C13.x preserved | preserved |

## Active view type

- Canonical: `frontend/src/rental/lib/rental-current-view.ts` → `RentalCurrentView`
- App state: `useState<RentalCurrentView>` in `App.tsx`

## Behavioral preservation

- All legacy URL scenarios covered by existing `legacy-communication-navigation.test.ts` (24 tests) — re-run PASS
- Mount redirect + `handleViewChange` boundary redirect unchanged (`replaceState`)
- **Added** `popstate` listener: legacy `?view=` on back/forward re-canonicalizes URL and sets `communication-center`
- Removed `currentView`-driven legacy effect (avoided state/URL divergence)

## Confirmed defects fixed

| Defect | Fix |
|--------|-----|
| Legacy ids in active view union encouraged unsafe casts | `RentalCurrentView` excludes legacy; `rentalCurrentViewFromLegacyResolution` at boundaries |
| Legacy effect keyed on `currentView` could redirect using synthetic `?view=` when URL unrelated | URL-only mount + popstate handlers |

## Regression tests added

- `rental-current-view.test.ts`
- `rental-legacy-view-url-boundary.test.ts`

## Not changed

Backend, router, `legacy-communication-navigation.ts` resolver matrix, WhatsApp/Voice specialized UIs embedded in Communication Center.