# I18N Rental Handover Protocol P2.2.11

**Date:** 2026-08-21  
**Version:** V4.9.933  
**Baseline:** Post–P2.2.10 @ `d32987e8`

## Scope

| File | Role |
|------|------|
| `HandoverProtocolDialog.tsx` | Pickup/return protocol UI — canonical `t()` + locale-aware formatting |
| `SignaturePad.tsx` | Signature draw/type presentation |
| `BookingHandoverTab.tsx` | Booking detail handover rows and actions |
| `bookingHandoverGates.ts` | Machine gate booleans + `reasonKey` / `reasonParams` |
| `handover-i18n.ts` | Non-React presentation adapter |
| `handover.protocol.{en,de}.ts` | Canonical dictionary module (96 keys) |

**Out of scope:** `operator/handover/*`, backend PDF/protocol generation, `notification-handover-copy.ts`.

## i18n architecture

- React surfaces use `useLanguage().t()` from canonical `frontend/src/i18n/LanguageContext`.
- Gate utils return machine values and `TranslationKey` metadata — no localized prose in domain layer.
- `handover-i18n.ts` provides `ho()`, `resolveHandoverGateReason()`, damage type/severity display maps, and `HANDOVER_REPORTED_BY_FALLBACK = 'Handover'`.
- Reused keys: `bookings.handover.*` (titles, deviation, noProtocol), `common.cancel`, `common.add`.
- New presentation namespace: `handover.gates.*`, `handover.tab.*`, `handover.signature.*`, `handover.protocol.*`, `handover.damageType.*`, `handover.damageSeverity.*`.

## Machine semantics (frozen)

| Domain | Preserved |
|--------|-----------|
| Handover kind | `PICKUP`, `RETURN` |
| Damage API | Enum codes unchanged in payloads |
| Audit | `reportedBy: 'Handover'` when staff name absent |
| Signature | Data URL serialization unchanged |
| Gates | Identical allowed/blocked for all inputs |

## P23 blind-spot repair

Pre-P2.2.11, P23 enforce-clean reported 0 while `bookingHandoverGates.ts` and `BookingHandoverTab.tsx` contained ~55 presentation literals.

P2.2.11 adds:

- `P211_ENFORCE_CLEAN_EXACT` — 5 rental paths
- Blind-spot grep guards in `hardcoded-copy-guard.test.ts`
- `rental-handover-localization.test.tsx` structural assertions

Historical P23 scanner lists unchanged; P211 is the forward boundary for this surface.

## Scanner

`P211_ENFORCE_CLEAN_EXACT` — 5 paths. Findings: **0**.

Global rental delta: 610 → 586 (−24 scanner-visible handover literals).

## Tests

`rental-handover-localization.test.tsx` — 12 tests: EN/DE render, gate semantics, machine preservation, locale datetime, P211 enforce-clean, blind-spot guards.

## Shim

Unchanged (29 total, 0 new compat consumers).
