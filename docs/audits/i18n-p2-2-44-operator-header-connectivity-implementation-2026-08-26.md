# P2.2.44 — Operator Header + Connectivity Banner Implementation

**Date:** 2026-08-26
**Baseline:** `e5bd8ee996940d8577d1b7e0f04bff31c06805f0`
**Pre-flight:** PR #1297
**Branch:** `cursor/p2244-operator-header-connectivity-i18n-3c10`

## Scope

| Path | Role |
|------|------|
| `frontend/src/operator/components/OperatorHeader.tsx` | Top shell header chrome |
| `frontend/src/operator/components/OperatorConnectivityBanner.tsx` | App-network offline banner |
| `frontend/src/operator/lib/operator-shell-top-chrome-i18n.ts` | Shared presentation adapter |
| `frontend/src/i18n/translations/operator.shellTopChrome.{en,de}.ts` | +8 EN+DE keys |
| `frontend/src/operator/components/operator-shell-top-chrome-localization.test.tsx` | 11 focused tests |

## Frozen (unchanged)

- `OperatorShellContext`, `operatorTypes.ts`, `OperatorBottomNav`, P242–P216 surfaces
- `activeTab`, header callbacks, App link `/rental`, `navigator.onLine` derivation
- `orgName`, `SynqDrive` fallback, sync state predicates, StatusDot tones

## Connectivity proof

`OperatorConnectivityBanner` → `useOperatorNetworkStatus` → `navigator.onLine` + `online`/`offline` window events only. No Fleet/DIMO/vehicle connectivity.

## Key reuse

| Concept | Strategy |
|---------|----------|
| Org loading | **EXACT REUSE** `common.loading` |
| Header eyebrow, sync labels, refresh, App, aria | **NEW** `operator.header.*` |
| Offline message | **NEW** `operator.connectivity.offlineMessage` |

## Metrics

| Metric | Baseline | Final |
|--------|----------|-------|
| EN | 8624 | **8632** |
| DE | 8624 | **8632** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| P244 enforce-clean | — | **0** |
| Global enforce-clean | 0 | **0** |
| i18n suite | 406 | **418** |
| Shim | 29 | **29** |

## Main drift

`origin/main` regressed `OperatorHeader` locale wiring (`de-DE` hardcode). P244 branches from P243 baseline; drift **not absorbed**.

## Semantics

Presentation-only. Category E = 0.

---

*Implementation artifact. Ready for independent re-audit.*
