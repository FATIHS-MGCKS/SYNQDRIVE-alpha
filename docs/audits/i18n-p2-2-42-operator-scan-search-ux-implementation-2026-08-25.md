# P2.2.42 — Operator Scan Search UX Implementation

**Date:** 2026-08-25
**Baseline:** `1418f52e23d74e459272ddcf842fe861f169526e`
**Pre-flight:** PR #1289
**Branch:** `cursor/p2242-operator-scan-search-ux-i18n-3c10`

## Scope

| Path | Role |
|------|------|
| `frontend/src/operator/views/OperatorScanView.tsx` | Scan search UI chrome |
| `frontend/src/operator/lib/operator-scan-search-i18n.ts` | Presentation adapter |
| `frontend/src/i18n/translations/operator.scan.{en,de}.ts` | +10 EN+DE keys |
| `frontend/src/operator/views/operator-scan-search-localization.test.tsx` | 10 focused tests |

## Frozen (unchanged)

- `useOperatorScanSearch.ts`
- `OperatorShellContext` scan query state
- P241 `OperatorScanBookingCard.tsx` / `OperatorBookingCard.tsx`
- P240–P236 frozen surfaces

## Key reuse

| Concept | Strategy |
|---------|----------|
| Bookings section header | **EXACT REUSE** `nav.bookings` |
| Placeholder, scanner, empty/no-results, vehicles section, tablet placeholder, back CTA | **NEW** `operator.scan.*` |
| `scanQuery`, API errors, dynamic names | **DYNAMIC — DO NOT TRANSLATE** |

## Metrics

| Metric | Baseline | Final |
|--------|----------|-------|
| EN | 8610 | **8620** |
| DE | 8610 | **8620** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| P242 enforce-clean | — | **0** |
| Global enforce-clean | 0 | **0** |
| i18n suite | 395 | **396** |
| Shim | 29 | **29** |

## Semantics

Presentation-only. Category E = 0.

## Active exclusions

No overlap with #1290, #1281, #1277, #1286.

## Main drift

`OperatorScanView.tsx` vs `origin/main` `8fd9be767`: **LOW** (cosmetic CSS on main only).

---

*Implementation artifact. Ready for independent re-audit.*
