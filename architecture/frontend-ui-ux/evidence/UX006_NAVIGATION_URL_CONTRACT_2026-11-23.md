# UX-006 — Navigation & URL contract

**Date:** 2026-11-23  
**Base SHA:** `0e98c87d86bc53ce58e9c1669c1fe9dc40225d4a` (predecessor #2504 merged)  
**Deliverable:** [`governance/NAVIGATION_URL_CONTRACT.md`](../governance/NAVIGATION_URL_CONTRACT.md)

## Audit summary

| Product | Verdict | Primary mechanism |
|---------|---------|-------------------|
| Master | **DOCUMENTED** | `/master` + `?view=` + `master-nav-url.ts`; hub-specific URL modules |
| Rental | **DOCUMENTED** | `/rental` + in-memory `currentView` + selective per-feature URL sync |
| Operator | **DOCUMENTED** | `/operator/*` React Router + `OperatorDeepLinkBridge` |

## Checklist

| Check | MAUX | RENTUX | OPUX |
|-------|------|--------|------|
| Top-level route ownership | PASS | PASS | PASS |
| View state representation | PASS | PASS (hybrid) | PASS |
| URL param conventions | PASS | PASS (partial global `view`) | PASS |
| Deep-link support | PASS | PASS (feature-scoped) | PASS |
| Back/Forward | PASS (hub + orgTab split) | PARTIAL (fleet-health popstate) | PASS |
| Refresh restoration | PASS (URL + migrations) | PARTIAL (feature-dependent) | PASS (path/query) |
| Legacy normalization | PASS | PASS | N/A (unknown path redirect) |
| Invalid route handling | PASS (→ dashboard) | PASS (legacy redirects) | PASS (→ `/operator`) |

## Inventory corrections

- **RENTAL_SCREEN_MATRIX:** clarified that `App.tsx` does **not** write `?view=` for every sidebar navigation — sync is feature-local.
- **MASTER_HUB_SUBNAV / orgTab:** authority already points to `org.utils.ts` (UX-005); contract cross-links both modules.

## Confirmed defects

**None** requiring application code in UX-006 scope. Observed Rental partial URL sync is **documented behavior**, not remediated (would be cross-cutting rental router work — out of scope).

## Tests executed (existing)

- `master-nav-url.test.ts`
- `org-tab-url.test.ts`
- `operatorRoutes.test.ts`
- `communication-center-navigation.test.ts`
- `legacy-communication-navigation.test.ts`
- `finance-navigation.test.ts`

## Next backlog

UX-007 (Rental legacy view ids) · UX-008 (Operator deep-link documentation extensions / rental cross-links)