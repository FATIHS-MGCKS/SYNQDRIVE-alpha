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
| Pre-existing findings newly surfaced (offset) | **+7** | +4 other, +1 Finance/Billing, +1 Tasks, +1 Settings — category **A** only (improved scanner visibility; P2.2.3 introduced zero new hardcoded copy outside the clean zone) |
| **Net Rental reduction** | **−218** | 225 − 7 |

### +7 offset provenance (category A = 7, B = 0, C = 0)

All seven are **pre-existing source text** at checkpoint `39c33e0` (`git diff` empty on each file). None were introduced by P2.2.3 UI work. They became visible because scanner path/classification improved after enforce-clean expansion — not because P2.2.3 added new hardcoded copy.

| File | Module | Sample |
|------|--------|--------|
| `BusinessInsightsBox.tsx:955` | other | `de-DE` (`FORMAT_LOCALE`) |
| `SettingsView.tsx:717` | other | `Erneut laden` |
| `FinancialInsightsView.tsx:1045` | other | `Schließen` (ARIA) |
| `FinesView.tsx:457` | other | `Zurück` |
| `invoices/InvoiceDocuments.tsx:322` | Finance/Billing | `Dokumente werden geladen…` |
| `tasks/VehicleTaskActionCenter.tsx:38` | Tasks | `Nächste Aktion` |
| `settings/account/AccountNotificationsSection.tsx:154` | Settings | `Zurücksetzen` |

### The “45 beyond 173” explained

- Known module reductions: **173** (106 Bookings + 67 Customers)
- Unexplained gap vs 218: **45**
- **Exact source:** **52** findings migrated from `other Rental areas` inside P2.2.3 file paths, minus **7** pre-existing findings newly surfaced by improved scanner = **45**

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

### Duplicate-semantic audit (458 raw extracted keys)

- **55** new keys share identical EN text with an existing `common.*` / `bookings.*` / `customers.*` / `email.*` / `vehicle.*` key
- **10** obvious action-label candidates reviewed (`Back`, `Next`, `Close`, `Open`, `Status`)
- **9** SAME-SEMANTIC → consolidated to existing `common.*` keys (`common.back`, `common.next`, `common.close`, `common.status`)
- **1** DIFFERENT-SEMANTIC → retained: `customers.verification.open` (verification state “open/pending”) vs `common.open` (navigation action)

| Stage | Count |
|-------|------:|
| After P2.2.2 | 4687 |
| Raw P2.2.3 extraction | +458 |
| **Raw pre-consolidation** | **5145** |
| Duplicate consolidation | −9 |
| **Final canonical keys** | **5136** |
| **Net growth from P2.2.2** | **+449** |

EN/DE: **5136 / 5136 — 100% COMPLETE**. Partial locale owned counts unchanged (pl/cs/nl/es/it 493; fr 786; tr 0 fallback-only).

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

### Deterministic set difference (checkpoint inventory script)

| Delta | File | Explanation |
|-------|------|-------------|
| **Removed (−1)** | `BookingDocumentsSection.tsx` | Was compat `../i18n/` at checkpoint `39c33e0`; migrated to canonical `../../i18n/` |
| **Added** | — | None |

**Equation:** 33 − 1 + 0 = **32**. P2.2.3 introduced **zero** new compatibility consumers.

### Touched-file import history (not all were checkpoint compat consumers)

| File | Checkpoint compat inventory? | P2.2.3 import history | Final |
|------|-------------------------------|----------------------|-------|
| `BookingDocumentsSection.tsx` | **Yes** | compat → canonical | **Canonical** (`../../i18n/`) |
| `BookingsView.tsx` | **No** | transient compat during migration → corrected | **Canonical** (`../../i18n/`) |
| `NewBookingView.tsx` | **No** (no i18n import at checkpoint) | canonical `../../i18n/` added directly | **Canonical** (`../../i18n/`) |

Do **not** count `NewBookingView.tsx` among deterministic checkpoint-compat removals for 33 → 32.

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
