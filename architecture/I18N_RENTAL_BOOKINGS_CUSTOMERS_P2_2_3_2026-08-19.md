# I18N Rental Bookings + Customers — P2.2.3 (2026-08-19)

## Scope

P2.2.3 extracts user-facing copy from Rental **Bookings** and **Customers** presentation layers into canonical platform i18n (`frontend/src/i18n`). Localization/presentation only — booking/customer business logic, eligibility gates, handover flows, verification, and API contracts are unchanged.

`vehicle-bookings/**` remains on P2.2.2 enforce-clean (reuse keys where semantically identical).

## True baseline (checkpoint `39c33e0`)

| Module | Scanner findings |
|--------|------------------|
| Bookings | **106** |
| Customers | **67** |
| Global | 2712 |
| Rental | 1390 |

## Rental finding reduction reconciliation (218)

| Component | Δ findings | Explanation |
|-----------|------------|-------------|
| Bookings module | **−106** | Migrated in-scope Bookings presentation |
| Customers module | **−67** | Migrated in-scope Customers presentation |
| other Rental areas (P2.2.3 paths) | **−52** | Previously classified “other”; files in P2.2.3 enforce-clean paths, reclassified + migrated |
| **Gross P2.2.3 migration** | **−225** | 106 + 67 + 52 |
| New scanner findings (offset) | **+7** | +4 other, +1 Finance/Billing, +1 Tasks, +1 Settings (post-migration scan noise, not P2.2.3 scope) |
| **Net Rental reduction** | **−218** | 225 − 7 |

### The “45 beyond 173” explained

- Known module reductions: **173** (106 Bookings + 67 Customers)
- Unexplained gap vs 218: **45**
- **Exact source:** **52** findings migrated from `other Rental areas` inside P2.2.3 file paths, minus **7** new rental findings introduced by the post-migration inventory scan = **45**

| Category | Count |
|----------|------:|
| Previously “other” → P2.2.3 path, reclassified + migrated | **52** |
| Scanner false positives removed | **0** |
| Accidental out-of-scope migration | **0** |
| Cross-module reclassification only (not migrated) | **0** |

## Remaining Rental debt (1172) — complete module table

| Module | Findings |
|--------|----------:|
| other Rental areas | 607 |
| Automation | 183 |
| Finance/Billing | 130 |
| Tasks | 114 |
| Settings | 103 |
| Support | 19 |
| Documents | 8 |
| Stations | 7 |
| App / routing shell | 1 |
| **Total** | **1172** |

*(Prior summaries omitted Documents, Support, Stations, and App/routing shell — those four buckets account for the missing 35.)*

## Enforce-clean boundary

### Bookings (A–D)

- `rental/components/bookings/**`
- `rental/components/booking-detail/**`
- `rental/components/new-booking/**`
- `rental/components/booking-payment/**`
- `rental/components/BookingsView.tsx`, `NewBookingView.tsx`, `BookingDocumentsSection.tsx`
- `rental/components/customer-detail/CustomerBookingsTab.tsx`
- `rental/lib/booking-*`, `bookingHandoverGates.ts`, `stationBookingUtils.ts`

### Customers (E–H)

- `rental/components/CustomersView.tsx`, `CustomerDetailView.tsx`, `CustomerDetailModal.tsx`, `CustomerDocumentUploadBox.tsx`
- `rental/components/customer-list/**`, `customer-detail/**`, `customer-verification/**`, `add-customer/**`, `customer/**`
- `rental/components/bookings-customers/customers-i18n.ts`
- `rental/lib/customer-*`, `add-customer-wizard.ts`

## Canonical key growth (+458)

| Namespace | Count |
|-----------|------:|
| `bookings.*` (non-wizard) | 62 |
| `bookings.wizard.*` | 42 |
| `customers.*` (non-wizard) | 258 |
| `customers.wizard.*` | 96 |
| Other namespaces | 0 |
| **Total new keys** | **458** |

*`bookings.*` + `customers.*` = 458. Wizard keys (138) are a subset across both namespaces.*

### Duplicate-semantic audit (458 new keys)

- **55** new keys share identical EN text with an existing `common.*` / `bookings.*` / `customers.*` / `email.*` / `vehicle.*` key
- **10** are obvious action-label overlaps (`Back`, `Next`, `Close`, `Open`, `Status`)
- **0 safely consolidated** in P2.2.3 — wizard/domain keys kept intentionally grouped for enforce-clean maintainability; consolidating would require broad call-site churn with no user-visible benefit

**Final canonical key count:** **5145** (4687 + 458)

## Helpers

| Helper | Path | Role |
|--------|------|------|
| `bt()`, `bookingsFormattingLocaleOrDefault()` | `bookings-customers/bookings-i18n.ts` | Non-React booking copy + formatting locale |
| `ct()`, `customersFormattingLocaleOrDefault()` | `bookings-customers/customers-i18n.ts` | Non-React customer copy + formatting locale |
| React | `useLanguage()` | `t`, `locale`, `formattingLocale` |

## Shim inventory reconciliation

| | Checkpoint | Final P2.2.3 |
|--|------------|--------------|
| Total compat `../i18n/` | 33 | **32** |
| Production | 22 | **21** |
| Test | 11 | 11 |

### Touched-file shim history

| File | Checkpoint | During P2.2.3 | Final |
|------|------------|---------------|-------|
| `BookingDocumentsSection.tsx` | **Compat** (`../i18n/`) | Compat | **Canonical** (`../../i18n/`) — migrated |
| `BookingsView.tsx` | No i18n import | **Transient compat** (`../i18n/`) | **Canonical** (`../../i18n/`) — corrected |
| `NewBookingView.tsx` | **Compat** (`../i18n/`) | Compat | **Canonical** (`../../i18n/`) — migrated |

**No new compat consumers introduced.** Net **−1** vs checkpoint (BDS + NewBookingView migrated; BookingsView transient shim fully reversed).

## Status presentation mappings

### Booking (`bookingStatus.tsx`)

Internal `BookingUiStatus` / API enums unchanged. Labels via `bt(locale, TranslationKey)`.

### Customer (`entityMappers.ts`)

Internal UI status strings unchanged (`Active`, `Blocked`, …). Labels via `ct(locale, 'customers.status.*')`.

## Formatting

- Booking calendar: `BookingsCalendarView` / `BookingsTimelineView` use `formattingLocale` → e.g. `pl-PL`
- Customer dates: `formatDate(..., formattingLocale)` in `CustomerDetailHeader`; `customersFormattingLocaleOrDefault('fr')` → `fr-FR`

## Business-logic safety

No changes to booking eligibility, overlap rules, pricing/tax/deposit calculations, handover gates, customer CRUD contracts, or verification state machines.

## Remaining Rental i18n debt (post P2.2.3)

See module table above (1172 total).

## Next phase (P2.2.4 recommendation)

Tasks + Settings presentation extraction.

## Verification

```bash
cd frontend
npm run i18n:check
npx vitest run src/rental/components/rental-bookings-customers-localization.test.tsx
npm run test:bookings
npm test
npm run build
```
