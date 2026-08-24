# P2.2.36 — Post-Baseline Merge Reconciliation

**Date:** 2026-08-24
**Verified P236 HEAD (semantic source):** `bab7e2c5b33bc69bb5bf0017efe9ecbc5659d7af`
**Current main SHA:** `6af5fc58b9ceb935c74276a70a5ca5d380510f46`
**Reconciled branch:** `cursor/p2236-operator-booking-form-sheet-i18n-3c10`
**Implementation PR:** #1256

## Post-baseline merges verified on main

| PR | Title | Merge SHA |
|----|-------|-----------|
| #1257 | V4.9.200 — Card Radius & Elevation Cutover | `cf55badc` |
| #1259 | Dashboard Global Context Header | `6af5fc58` |

## Topology note

`main` and `p228-authoritative-baseline-3c10` (P236 base) share commit `177347f` as a common ancestor but are **not** linearly related (`main` is not a descendant of the i18n campaign baseline). A wholesale git merge/rebase of P236 onto `main` produces unrelated-history conflicts across the codebase.

Reconciliation strategy applied: **preserve verified P236 semantics on the implementation branch** and **port only the post-baseline changes that touch P236 runtime paths**.

## Overlap discovery

| Path | P236 change | Main (#1257/#1259) change | Resolution |
|------|-------------|---------------------------|------------|
| `OperatorBookingFormSheet.tsx` | Localized create/edit | None | P236 retained verbatim |
| `operator-booking-form-i18n.ts` | New adapter | None | P236 retained verbatim |
| `operator.bookings.form.*` keys | +35 EN/DE | None | P236 retained verbatim |
| `OperatorGlassCard.tsx` | Used by form sections | `rounded-2xl` → `rounded-lg` (#1257) | **Ported from main** |
| `ChangesView.tsx` | P236 changelog entry | CC / other main entries | Coexist on respective branches; combine at future main integration |
| `ArchitekturView.tsx` | P236 flow entry | Main flow entries | Coexist on respective branches |
| Dashboard (#1259) paths | None | Global context header | **NONE overlap** |

## Changes applied in reconciliation commit

1. `OperatorGlassCard.tsx` — adopt #1257 `rounded-lg` (V4.9.200 card radius cutover) so P236 form sections do not reintroduce pre-#1257 geometry.

## Semantic equivalence vs verified P236 HEAD

| Concern | Equivalent |
|---------|------------|
| Form modes / IDs / validation / payload / callbacks | **YES** |
| P236 i18n adapter / keys / reuse | **YES** (byte-identical) |
| OperatorGlassCard radius | **NO** (intentional #1257 port) |
| All other P236 production paths | **YES** |

`git diff bab7e2c5..HEAD` shows only `OperatorGlassCard.tsx` changed.

## Verification (reconciled branch)

| Check | Result |
|-------|--------|
| P236 localization tests | 7/7 PASS |
| operatorBooking.utils | 9/9 PASS |
| `npm run i18n:check` | PASS (346 tests, 8526/8526) |
| `npm run check:surface` | PASS |
| `npm run build` | PASS |
| P236 enforce-clean | 0 |
| Category E | 0 |

## Future main integration

When P236 eventually merges to `main`, `ChangesView.tsx` requires a non-semantic combine (retain main entries + P236 entry). No P236 production semantic changes are required.

## Verdict

**A — RECONCILIATION COMPLETE — P2.2.36 READY FOR FINAL MERGE CHECK**

P2.2.36 semantics remain independently verified after post-baseline reconciliation.
