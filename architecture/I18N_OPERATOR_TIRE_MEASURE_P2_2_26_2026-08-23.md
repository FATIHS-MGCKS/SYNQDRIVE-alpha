# P2.2.26 — Operator Tire Measure Flow Localization

**Date:** 2026-08-23
**Baseline:** `bbb4f5741cad6da627dbb0d1b2b5427f46947671` (PR #1192 / P2.2.25)

## Scope

| Path | Role |
|------|------|
| `operator/tire-measure/OperatorTireMeasureFlow.tsx` | 5-step tire measure wizard UI |
| `operator/tire-measure/OperatorTireMeasureTreadGrid.tsx` | FL/FR/RL/RR tread input grid |
| `operator/tire-measure/operatorTireMeasure.utils.ts` | Validation/plausibility codes (presentation-free) |
| `operator/tire-measure/operatorTireMeasurePayload.ts` | Setup labels + submit payload builder |
| `operator/tire-measure/useOperatorTireMeasureData.ts` | Data hook (locale for setup labels) |
| `operator/lib/operator-tire-measure-i18n.ts` | Presentation adapter |
| `i18n/translations/operator.tireMeasure.{en,de}.ts` | +77 canonical keys |

## Locale flow

`useLanguage().{t,locale}` → `OperatorActionSheets` (`tire-measure`) → `OperatorTireMeasureFlow`; `operator-tire-measure-i18n.ts` maps stable tire position IDs (`fl`/`fr`/`rl`/`rr`), step IDs, sources, and validation/plausibility codes to localized labels.

Reuses `common.close`.

## Machine freeze

- Action type `tire-measure` unchanged
- Step IDs: `vehicle` → `set` → `tread` → `context` → `review`
- Tire position IDs: `fl`, `fr`, `rl`, `rr` unchanged
- TreadGrid orientation and wheel order unchanged
- `parseTreadMm` / comma-decimal parsing unchanged
- Threshold constants (`LEGAL_MIN_MM`, `WARN_LOW_MM`, etc.) unchanged
- Payload fields (`frontLeftMm`, `frontRightMm`, `rearLeftMm`, `rearRightMm`, `source`, …) unchanged
- API endpoints unchanged (`addTireHealthMeasurement` / `addTireMeasurement`)
- User notes preserved verbatim across locale switch

## Guardrails

`P226_ENFORCE_CLEAN_EXACT` (6 paths) — 0 findings.

## Topology note

PR **#1196** was superseded by clean recovery branch `cursor/p2226-operator-tire-measure-i18n-recovery-3c10` (path-level restore from `6008a786` onto baseline `bbb4f574`). Do not merge #1196.

## Tests

`operator-tire-measure-localization.test.tsx`; `operatorTireMeasure.utils.test.ts`.

## Semantics

Presentation-only. Category E = 0.
