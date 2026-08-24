# P2.2.37 — Operator Booking Cancel & No-Show Sheets Implementation Audit

**Date:** 2026-08-25  
**Baseline:** `fe436fb7106f3c6f3a9efb2e46a2e4d1485862df`  
**Pre-flight:** PR #1261 (audit-only, not merged)

## Summary

Localized Operator Booking Cancel and No-Show confirmation sheets. Presentation-only; all booking mutation semantics, payloads, gate predicates, and dynamic data preserved.

## Changed paths

| Path | Change |
|------|--------|
| `operator/bookings/OperatorBookingCancelSheet.tsx` | Localized via adapter + `useLanguage` |
| `operator/bookings/OperatorBookingNoShowSheet.tsx` | Localized via adapter + `useLanguage` |
| `operator/bookings/operatorBookingSheetShell.tsx` | Close aria via `common.close` |
| `operator/lib/operator-booking-cancel-noshow-i18n.ts` | New bounded adapter |
| `operator/hooks/useOperatorBookingMutations.ts` | Optional localized success toast param (defaults unchanged) |
| `i18n/translations/operator.bookings.cancelNoShow.{en,de}.ts` | +26 keys each |
| `operator/bookings/operator-booking-cancel-noshow-localization.test.tsx` | 7 tests |
| `i18n/hardcoded-copy-guard.test.ts` | P237 enforce-clean |
| `scripts/i18n-check.mjs` | Register P237 test |

## Cancel vs no-show

| Mode | Sheet | Mutation | Target state |
|------|-------|----------|--------------|
| CANCEL | `OperatorBookingCancelSheet` | `api.bookings.cancel(orgId, bookingId)` | `cancelled` |
| NO_SHOW | `OperatorBookingNoShowSheet` | `api.bookings.markNoShow(orgId, bookingId, reason?)` | `no_show` |

Machine action semantics unchanged.

## Verification

| Check | Result |
|-------|--------|
| `npm run i18n:check` | PASS (355 tests) |
| `npm run check:surface` | PASS |
| `npm run build` | PASS |
| P237 enforce-clean | 0 |
| P236–P216 | 0 |
| Global enforce-clean | 0 |
| EN / DE | 8552 / 8552 |
| Parity | 100% |
| Orphans | 0 |
| Category E | 0 |
| Shim | 29 (unchanged) |

## Scanner debt (P237 paths)

| Metric | Before | After |
|--------|--------|-------|
| Visible | 11 | 0 |
| Hidden | 1 | 0 |
| Fixed-locale | 11 | 0 |

## Remaining Operator residual

~84 scanner findings outside P237 scope (Today, Scan, Detail, etc.).

## Verdict

**A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT P2.2.37 RE-AUDIT**
