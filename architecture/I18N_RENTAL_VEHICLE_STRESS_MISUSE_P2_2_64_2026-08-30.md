# P2.2.64 — Vehicle Rental Stress & Misuse Hints Presentation i18n

**Date:** 2026-08-30  
**Baseline:** `6881b9b922fc163e53879b451268eb8d1a87c1b8` (P2.2.63 merge)  
**Branch:** `cursor/p2264-vehicle-stress-misuse-i18n-3c10`

## Scope

Presentation-only localization for production-mounted rental stress and misuse hint surfaces:

- `frontend/src/rental/components/MisuseCasesPanel.tsx`
- `frontend/src/rental/components/RentalStressAnalysisCard.tsx`
- `frontend/src/rental/lib/misuse-case-lifecycle.ui.ts`
- `frontend/src/rental/lib/rental-misuse-stress-i18n.ts` (new adapter)
- `frontend/src/i18n/translations/rental.misuseStress.{en,de}.ts`

## Mount topology

| Parent | Context |
|--------|---------|
| `BookingUsageMisuseTab` | Booking detail misuse tab |
| `CustomerDrivingTab` | Customer driving analysis |
| `TripTimelineExpanded` | Trip timeline misuse embed |
| `BookingsView` | Import-only stress card wiring |

## Locale flow

`useLanguage().locale` / `t` → `rental-misuse-stress-i18n.ts` resolvers → `misuseStress.*` keys (+ canonical reuse).

Evidence taxonomy (levels, sources, classifications, grades) delegates to frozen `trips/*` German constants for DE; EN const maps in adapter. Wear impact and data confidence use adapter const maps (DE via `getDataConfidenceLabel` / `WEAR_IMPACT_DE`).

## Keys

- **New:** +45 `misuseStress.*` (9661 → 9706 EN/DE)
- **Reused:** `docUpload.entityReview.confidence.{HIGH,MEDIUM,LOW}`, `STRESS_TOOLTIPS.vehicleStress` (scoreFormat)

## Fetch identity

`MisuseCasesPanel` `useEffect` deps: `[orgId, vehicleId, tripId, bookingId, customerId, limit]` — no `locale` / `t`.

## Guardrails

P264 enforce-clean exact (4 paths) — 0 findings. Frozen: P216–P263, Data Analyse, dead IAM CRUD, trips/* modules.

## Tests

`rental-vehicle-stress-misuse-localization.test.tsx` — same-mount, unknown machines, raw ownership, zero locale refetch, adapter purity.

**Semantics:** presentation-only; Category E = 0.
