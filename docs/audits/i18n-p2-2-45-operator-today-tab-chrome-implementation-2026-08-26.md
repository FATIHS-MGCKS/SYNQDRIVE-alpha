# P2.2.45 — Operator Today Tab Chrome Implementation

**Date:** 2026-08-26
**Baseline:** `31a3c395705d79e303bfc810a276dfb71f508015`
**Pre-flight:** PR #1300
**Branch:** `cursor/p2245-operator-today-chrome-i18n-3c10`

## Scope

| Path | Role |
|------|------|
| `frontend/src/operator/views/OperatorTodayView.tsx` | Today tab page chrome |
| `frontend/src/operator/views/operatorTodayView.utils.ts` | Bucket structural metadata (presentation strings removed) |
| `frontend/src/operator/components/OperatorTodayTaskFeed.tsx` | Task feed section chrome |
| `frontend/src/operator/lib/operator-today-i18n.ts` | Presentation adapter |
| `frontend/src/i18n/translations/operator.today.{en,de}.ts` | +35 EN+DE keys |

## Frozen (unchanged)

- Task Card rows (`OperatorTaskCardConnected` / `OperatorTaskCard`)
- P244 Header/Connectivity, P243 BottomNav, P241–P236 surfaces
- Bucket IDs, order, membership predicates, counts
- Task feed source, filter, sort, limits
- Callbacks, routes, sheet IDs, permissions
- Dynamic: task titles, alert title/message, vehicle labels, API errors

## Key reuse

| Concept | Strategy |
|---------|----------|
| TODAY bucket title | **EXACT REUSE** `common.today` |
| Feed retry label | **EXACT REUSE** `common.retry` |
| All other Today chrome | **NEW** `operator.today.*` |

## Metrics

| Metric | Baseline | Final |
|--------|----------|-------|
| EN | 8632 | **8667** |
| DE | 8632 | **8667** |
| Parity | 100% | **100%** |
| P245 enforce-clean | — | **0** |
| i18n suite | 418 | **429** |
| Shim | 29 | **29** |

## Fixed-locale fix

`useOperatorToday('de')` → `useOperatorToday(formattingLocale)` for locale-aware booking time labels in snapshot (presentation only).

## Semantics

Presentation-only. Category E = 0. Task rows remain DE until future Task Card slice.

---

*Implementation artifact. Ready for independent re-audit.*
