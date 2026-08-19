# I18N Rental Customers — P2.2.3 (2026-08-19)

## Scope

P2.2.3 extracts user-facing copy from the Rental **Customers presentation layer** into canonical platform i18n (`frontend/src/i18n`). Localization/presentation only — customer business logic, eligibility gates, verification flows, and API contracts are unchanged.

`CustomerBookingsTab` customer-owned strings only; booking tab labels reuse `customers.detail.bookings.*` where applicable.

## Enforce-clean boundary (P2.2.3 Customers)

- `rental/components/CustomersView.tsx`
- `rental/components/CustomerDetailView.tsx`
- `rental/components/CustomerDetailModal.tsx`
- `rental/components/CustomerDocumentUploadBox.tsx`
- `rental/components/customer-list/**`
- `rental/components/customer-detail/**`
- `rental/components/customer-verification/**`
- `rental/components/add-customer/**`
- `rental/components/customer/**`
- `rental/components/bookings-customers/customers-i18n.ts`
- `rental/lib/customer-*`, `rental/lib/add-customer-wizard.ts`

## Helpers

- `rental/components/bookings-customers/customers-i18n.ts` — `ct()`, `customersFormattingLocaleOrDefault()` for non-React builders
- React surfaces use `useLanguage()` from `../../i18n/LanguageContext` (`t`, `locale`, `formattingLocale`)
- `entityMappers` customer label helpers accept `locale` via `ct()`; `*LabelDe` wrappers retained for callers

## Key migrations

| Area | Pattern |
|------|---------|
| List / KPI / filters | `customers.kpi.*`, `customers.table.*`, `customers.filter.*` |
| Add-customer wizard | `customers.wizard.*`, `customers.wizard.verification.*`, placeholders |
| Detail header / decisions | `customers.detail.*`, `customers.detail.decisions.*` |
| Modals / verification | `customers.modal.*`, `customers.verification.*` |
| Lib mappers | `customerStatusUiLabel`, `customerVerificationUiLabel`, `customer-verification.ts` eligibility labels |

## New translation keys

~200+ new `customers.*` keys in `en.ts` / `de.ts` (wizard, detail tabs, modals, verification, decisions, status actions).

## Verification

```bash
cd frontend && node scripts/i18n-hardcoded-scan.mjs
# Customers clean zone enforce-clean = 0

cd frontend && npx tsc --noEmit
```

## Remaining Rental i18n (post P2.2.3 Customers)

Tasks, Settings, Finance/Billing, Automation — see scanner `Rental by module` breakdown.
