# P2.2.25 — Operator Pickup Verification Sheet Localization

**Date:** 2026-08-23
**Baseline:** `bf0a5a57791bffc8878fbdb2891fd6b00353b505` (PR #1189 / P2.2.24)

## Scope

| Path | Role |
|------|------|
| `operator/verification/OperatorPickupCheckSheet.tsx` | Pickup manual verification sheet UI |
| `operator/lib/operator-pickup-check-i18n.ts` | Checklist field label map |
| `operator/verification/operatorPickupCheckPayload.ts` | Form defaults + payload trim helper |
| `i18n/translations/operator.pickupCheck.{en,de}.ts` | +18 canonical keys |

## Locale flow

`useLanguage().{t,locale}` → `OperatorActionSheets` (`pickup-verification`) → verification sheet; `operator-pickup-check-i18n.ts` maps stable `ManualPickupCheckDto` boolean field keys to localized checklist labels.

Reuses `common.cancel`, `common.close`, `common.saving`.

## Machine freeze

- Action ID `pickup-verification` unchanged
- `ManualPickupCheckDto` field names and types unchanged
- Boolean defaults unchanged (`minimumLicenseDurationPassed` default `true`)
- Checklist field order unchanged
- `buildManualPickupCheckPayload` output shape unchanged
- User notes preserved verbatim across locale switch

## Guardrails

`P225_ENFORCE_CLEAN_EXACT` (3 paths) — 0 findings.

## Tests

`operator-pickup-check-localization.test.tsx` (9 tests); `operatorPickupCheckPayload.test.ts` (2 tests).

## Semantics

Presentation-only. Category E = 0.
