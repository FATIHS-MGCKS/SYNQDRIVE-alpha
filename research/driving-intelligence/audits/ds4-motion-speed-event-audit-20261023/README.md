# DS4 Motion — Speed / Acceleration / Deceleration Audit (2026-10-23)

Reproducible audit of the DS4 Motion shadow pipeline with focus on speed estimation, event detection
and their rendering in the trip map (`TripsMapCard` / `useTripsRouteMap` / `TripMotionMapPopover`).

Pinned subject: VW Tiguan WOB L 7503 · vehicle `19fedd4b-c4e8-4de8-a125-dab293326e7e` ·
trip `98d2a8e0-8b7d-4529-bf76-acee44d61fbe` · motion run `8ec6306e-606b-4507-ab03-ea058c5d810d` ·
snapshot `DI_V0_S4_EVIDENCE_V1:sha256:22e2a662af3a07458e5713bd004f563e9d038c86fb89f3353d39b8e7ea3504b3`.

All inputs come from the frozen compact package
[`../ds4-motion-tiguan-20261022-compact/DS4_Motion_Tiguan_CURSOR_COMPACT/`](../ds4-motion-tiguan-20261022-compact/DS4_Motion_Tiguan_CURSOR_COMPACT/)
(payload, verified position grid, video reference CSVs, frozen backend code excerpt). This audit reads
them only; no network, no database, no Production access.

## Current correction result

Read `REPORT.md` (current correction section) and `analysis/hardened_comparison.json` first. The old frozen 21-event replay is historical; it is not the hardened product processor. G1/G2 are offline hypotheses only and no longer classify customer markers/popovers.

```bash
# backend dependencies are required for the real TypeScript processor replay
cd backend && npm ci
cd ..
node research/driving-intelligence/audits/ds4-motion-speed-event-audit-20261023/compare_hardened.cjs
```

The replay verifies the pinned evidence hash, actual #2134 runtime source parity, 21→20 events, unchanged retained payloads, 1916→1908 numeric values, video metrics/coverage on individual and common samples, and Tiguan-19 preservation. It fails on runtime drift instead of silently claiming the old product SHA. Fetch `f95420593ecae98d54d1d3185476c66427d2aede` if a shallow checkout lacks it.

## Historical reproduction

```bash
cd research/driving-intelligence/audits/ds4-motion-speed-event-audit-20261023
node screenshot_case_audit.mjs                                   # any Node ≥ 20
/usr/bin/node --import ../ds4-motion-tiguan-20261022-compact/DS4_Motion_Tiguan_CURSOR_COMPACT/loader.mjs \
  ./event_display_candidates.mjs                                 # Node ≥ 24 (TypeScript type stripping)
```

Frontend prototype tests (pinned Tiguan fixtures embedded):

```bash
cd frontend && npx vitest run src/rental/components/trips/motion-map.utils.test.ts \
  src/rental/components/trips/TripMotionMapPopover.component.test.tsx
```

## Files

| File | Content |
|---|---|
| `screenshot_case_audit.mjs` | Reconstructs the four UI screenshot cases (19:04 UTC) from payload + position grid: per-bucket C4 speed/quality/flags, FSM state, position availability, chord distance and implied speed of each positioned leg, legacy vs. prototype popover text, verdict. Also audits all 21 persisted events and the "0 Ereignisse" discrepancy. |
| `event_display_candidates.mjs` | Reproduces the frozen baseline (C4 → events, exact match to persisted payload), then evaluates display-level gates G1 (kinematic envelope), G2 (timing/support), G3 (chord consistency) on Tiguan-22 and the older Tiguan-19 fixture, checks reference-window preservation and pipeline robustness invariants, records runtime/memory. |
| `analysis/screenshot_case_audit.{json,md}` | Output of the case reconstruction. |
| `analysis/event_display_candidates.{json,md}` | Output of the candidate evaluation. |
| `compare_hardened.cjs` / `analysis/hardened_comparison.json` | Current A/B processor replay, source/hash binding, common-coverage metrics and incremental gate scope. |
| `event_quality_research.cjs` | Shared experimental gates, no customer classification. |
| `REPORT.md` | Findings, verdicts, recommendation. |

## Status

Research + isolated frontend prototype. No backend algorithm change, no runtime integration of the
candidate gates, no Production side effects. See `REPORT.md` → "Open limitations".
