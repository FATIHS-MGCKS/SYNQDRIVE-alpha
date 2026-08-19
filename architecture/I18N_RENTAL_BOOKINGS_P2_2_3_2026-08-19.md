# I18N Rental Bookings — P2.2.3 (2026-08-19)

## Scope

P2.2.3 extracts user-facing copy from the Rental **Bookings presentation layer** into canonical platform i18n (`frontend/src/i18n`). Localization/presentation only — booking business logic, eligibility gates, handover flows, and API contracts are unchanged.

`vehicle-bookings/**` remains on P2.2.2 enforce-clean (not touched in this phase).

## Enforce-clean boundary (P2.2.3)

- `rental/components/bookings/**`
- `rental/components/booking-detail/**`
- `rental/components/new-booking/**`
- `rental/components/booking-payment/**`
- `rental/components/BookingsView.tsx`, `NewBookingView.tsx`, `BookingDocumentsSection.tsx`
- `rental/components/customer-detail/CustomerBookingsTab.tsx` (bookings tab only)
- `rental/lib/booking-*`, `bookingHandoverGates.ts`, `stationBookingUtils.ts`

## Helpers

- `rental/components/bookings-customers/bookings-i18n.ts` — `bt()`, `bookingsFormattingLocaleOrDefault()` for non-React builders
- React surfaces use `useLanguage()` from `rental/i18n/LanguageContext` (`t`, `formattingLocale`)

## Key migrations

| Area | Pattern |
|------|---------|
| `bookingStatus.tsx` | `bookingStatusLabel` / `bookingStatusAriaLabel` → `bt(locale, TranslationKey)`; reuses `bookings.confirmed`, `bookings.planner.pending`, etc. |
| Wizard steps | `bookings.wizard.*` keys (vehicle/period/customer/checkout/summary/extras) |
| Detail dossier | `bookings.detail.*`, `bookings.handover.*` |
| Drawer / edit modal | `bookings.drawer.*`, `bookings.edit.*` |
| Documents | `bookings.documents.*` + existing `email.*` keys |
| Eligibility card | `bookings.eligibility.*` |

## New translation keys

~90 new `bookings.*` keys in `en.ts` / `de.ts` (detail, wizard, handover, drawer, edit, documents, eligibility, customer tab).

## Verification

```bash
cd frontend && node scripts/i18n-hardcoded-scan.mjs
# Bookings clean zone enforce-clean = 0

cd frontend && npx tsc --noEmit
```

## Remaining Rental i18n (post P2.2.3)

Tasks, Settings, Finance/Billing, Automation — see scanner `Rental by module` breakdown. Customers clean zone completed in parallel (`architecture/I18N_RENTAL_CUSTOMERS_P2_2_3_2026-08-19.md`).
