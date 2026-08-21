# P2.2.11 — Rental Handover Protocol localization — Implementation audit

**Date:** 2026-08-21  
**Program baseline SHA:** `d32987e86c1db57b3d5fb8097fc802f6ac5c7669` (post–P2.2.10 / PR #1086)  
**Implementation branch:** `cursor/p2211-rental-handover-i18n-3c10`  
**Pre-flight audit:** PR #1094 (audit-only — not merged, not used as baseline)

## Provenance

Independent P2.2.11 pre-flight verdict **A — GO**. Implementation branched directly from verified program tip `d32987e8`. P2.2.7B, P2.2.8, P2.2.9, and P2.2.10 frozen boundaries preserved.

## Exact production scope (`P211_ENFORCE_CLEAN_EXACT`)

| Path | Role |
|------|------|
| `rental/components/handover/HandoverProtocolDialog.tsx` | Pickup/return protocol dialog — full presentation migration |
| `rental/components/handover/SignaturePad.tsx` | Draw/type signature pad labels |
| `rental/components/booking-detail/BookingHandoverTab.tsx` | Booking detail handover tab (P23 blind spot) |
| `rental/lib/bookingHandoverGates.ts` | Gate booleans + `reasonKey` metadata (P23 blind spot) |
| `rental/components/handover/handover-i18n.ts` | Presentation adapter (`ho`, gate resolver, damage labels) |

Supporting (outside enforce-clean exact boundary but required):

| Path | Role |
|------|------|
| `i18n/translations/handover.protocol.{en,de}.ts` | Canonical dictionary module (+96 keys) |
| `booking-detail/bookingDetailTypes.ts` | Type `BookingHandoverGate` on matrix pickup/return |
| `booking-detail/bookingActionRules.ts` | Non-handover gate helper rename (`actionGate`) |
| Operator/rental consumers | Resolve `reasonKey` via `resolveHandoverGateReason` (compile-only; operator handover module out of scope) |

**Explicitly not modified:** `operator/handover/*`, `notification-handover-copy.ts`, `HandoverContext.tsx` (no presentation copy).

## Architectural decoupling (gate blind spot)

**Before:** `bookingHandoverGates.ts` returned German `reason` strings directly from domain logic (~6 user-facing literals invisible to P23 scanner).

**After:** Gates return machine booleans unchanged plus optional `reasonKey` / `reasonParams`. UI and non-React consumers resolve presentation via `resolveHandoverGateReason(locale, gate)` in `handover-i18n.ts`. No React hooks in gate utils.

**P23 governance repair:** Added `P211_ENFORCE_CLEAN_EXACT` (5 paths) and dedicated blind-spot grep guards in `hardcoded-copy-guard.test.ts` for `bookingHandoverGates.ts`, `BookingHandoverTab.tsx`, and `handover-i18n.ts`. Historical P23 scanner behavior not rewritten.

## Hidden-literal remediation

Pre-flight: ~24 scanner-visible Handover findings + ~55 blind-spot presentation literals.

Remediated classes:

- Hardcoded German dialog/tab/signature copy
- Fixed `de-DE` date formatting → locale-aware `formattingLocale` / `handoverFormattingLocale`
- Raw damage type/severity codes in UI → display labels via `handover.damageType.*` / `handover.damageSeverity.*` (API values unchanged)
- Gate reason German prose → `handover.gates.*` translation keys

## Key audit

| Classification | Count | Detail |
|----------------|-------|--------|
| New `handover.*` module keys | **96** | `handover.protocol.{en,de}.ts` |
| Reused existing canonical keys (call sites) | **6** | `bookings.handover.returnDeviation`, `bookings.handover.pickupTitle`, `bookings.handover.returnTitle`, `bookings.handover.noProtocol`, `common.cancel`, `common.add` |
| Net canonical delta | **+96** | 7114 → **7210** |
| EN/DE parity | **100%** | 7210 / 7210 |

## Scanner accounting (recomputed)

| Metric | Pre-P2.2.11 (`d32987e8`) | After implementation | Delta |
|--------|--------------------------|----------------------|-------|
| Global findings | 1899 | **1875** | −24 |
| Rental | 610 | **586** | −24 |
| Master | 1049 | 1049 | 0 |
| Operator | 180 | 180 | 0 |
| P211 enforce-clean (5 paths) | n/a | **0** | clean |
| P210 enforce-clean | 0 | 0 | preserved |
| P29 enforce-clean | 0 | 0 | preserved |
| P28 enforce-clean | 0 | 0 | preserved |
| P27B enforce-clean | 0 | 0 | preserved |
| Canonical EN keys | 7114 | **7210** | +96 |
| Canonical DE keys | 7114 | **7210** | +96 |

## Machine-semantic verification (Category E = 0)

Preserved unchanged:

- `PICKUP` / `RETURN` handover kind enums
- Signature data URL capture and callbacks
- Odometer / fuel percentage machine values in submit payloads
- Damage type/severity API enum values (`SCRATCH`, `MINOR`, etc.)
- `reportedBy: staffName || 'Handover'` — persisted fallback exactly `'Handover'`
- `source: 'PICKUP_HANDOVER' | 'RETURN_HANDOVER'`
- Gate allowed/blocked booleans for all input combinations
- Booking state transitions and API call shapes

## Shim accounting

| Metric | Before | After |
|--------|--------|-------|
| Shim total | 29 | 29 |
| Production compat | 18 | 18 |
| Test compat | 11 | 11 |
| New compat consumers | 0 | 0 |

## Tests

| Suite | Result |
|-------|--------|
| `rental-handover-localization.test.tsx` | 12/12 PASS |
| `hardcoded-copy-guard.test.ts` (incl. P211 + blind spots) | 21/21 PASS |
| `notification-handover-copy.test.ts` | 6/6 PASS |
| `npm run i18n:check` | PASS (7210/7210) |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Coverage includes: EN/DE dialog + signature + tab, gate reason localization, gate semantics unchanged, PICKUP/RETURN preservation, damage enum/API values, `reportedBy: 'Handover'`, locale-aware datetime, P211 enforce-clean, blind-spot guards, no translation-key leakage.

## Verdict

**A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT P2.2.11 RE-AUDIT**
