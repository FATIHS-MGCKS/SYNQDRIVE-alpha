# P2.2.24 — Operator Damage Capture Localization

**Date:** 2026-08-22
**Baseline:** `96dadcb3face5e17150893e52006232b3710cd08` (PR #1184 / P2.2.23)

## Scope

| Path | Role |
|------|------|
| `operator/damages/OperatorDamageCaptureFlow.tsx` | Four-step wizard host |
| `operator/damages/OperatorDamagePhotoStep.tsx` | Photo capture step |
| `operator/damages/OperatorDamageDetailsStep.tsx` | Damage details step |
| `operator/damages/OperatorDamageReviewStep.tsx` | Review / submit step |
| `operator/damages/operatorDamagePayload.ts` | Validation codes + payload builder |
| `operator/lib/operator-damage-capture-i18n.ts` | Presentation adapter |
| `i18n/translations/operator.damageCapture.{en,de}.ts` | +71 canonical keys |

## Locale flow

`useLanguage().{t,locale}` → four-step damage capture overlay (photo → details → review → submit); `operator-damage-capture-i18n.ts` maps step IDs, damage type/severity/rental-impact/location/source enums, and validation codes to localized labels.

Reuses `common.back`, `common.close`, `invoices.list.emptyValue`.

## Machine freeze

- Step machine IDs (`photo`, `details`, `review`, `submit`) unchanged
- `DamageSeverity`, `DamageRentalImpact`, `DamageSource`, damage type strings unchanged
- Location chip `id` + `defaultLocationLabel` payload semantics unchanged
- Photo upload references, ordering, MIME acceptance unchanged
- `buildOperatorDamagePayload` field names, types, and values unchanged
- User-entered description preserved verbatim across locale switch

## Guardrails

`P224_ENFORCE_CLEAN_EXACT` (6 paths) — 0 findings.

## Tests

`operator-damage-capture-localization.test.tsx` (13 tests); `operatorDamagePayload.test.ts` (4 tests).

## Semantics

Presentation-only. Category E = 0.
