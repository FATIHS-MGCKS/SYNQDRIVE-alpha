# I18N — Operator Scan Search UX (P2.2.42)

**Version:** V4.9.969  
**Date:** 2026-08-25  
**Baseline:** `1418f52e23d74e459272ddcf842fe861f169526e`

## Overview

Localized host-owned Scan tab search chrome (placeholder, scanner hint, empty/no-results states, section headers, tablet placeholder, back CTA) via a bounded presentation adapter. P241 booking result cards and search hook semantics remain frozen.

## Locale flow

```
useLanguage().locale
  → operator-scan-search-i18n.ts (oss helpers)
  → OperatorScanView
```

Reuses `nav.bookings` for bookings section header.

## Production boundary

```text
P242_ENFORCE_CLEAN_EXACT = [
  'operator/views/OperatorScanView.tsx',
  'operator/lib/operator-scan-search-i18n.ts',
]
```

## Mount

`OperatorShell` → `activeTab === 'scan'` → `OperatorScanView`

## Machine / domain freeze

| Value | Localize label? | Frozen |
|-------|-----------------|--------|
| `scanQuery` | NO | raw input value |
| `setScanQuery` | NO | callback identity + semantics |
| `hasQuery` | NO | predicate from hook |
| `bookings` / `vehicles` order | NO | hook merge order |
| `bookingsError` | NO | raw API message |
| `focusedBookingId` / `selectedVehicleId` | NO | selection identity |
| customer/vehicle/plate names | NO | raw dynamic |
| P241 `OperatorScanBookingCard` | frozen | props/callbacks unchanged |

## Out of scope

- `useOperatorScanSearch.ts` — query/API/matching/ranking
- `OperatorShellContext` — tab + scan query state
- P241 cards, P240 detail sheet, P236–P239 frozen surfaces
- `OperatorScanVehicleCard` — fleet/health coupling (defer)
- Fleet/DIMO (#1281, #1290), fleet health (#1277), dashboard (#1286)

## Keys

- **New:** 10 EN+DE `operator.scan.*` (8610→8620)
- **Reused:** `nav.bookings` for bookings section header

## Tests

`frontend/src/operator/views/operator-scan-search-localization.test.tsx`

## Semantics

Presentation-only. Category E = 0.
