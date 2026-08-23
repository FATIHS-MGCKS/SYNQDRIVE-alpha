# P2.2.28 — Operator Vehicle Quick View Header & Primary Status Implementation Audit

**Date:** 2026-08-23
**Baseline:** `314f20aabcf91eab8fd0e4ac44a10428af857c20` (PR #1203 / P2.2.27)
**Pre-flight:** PR #1209 (verdict A)

## Topology

| Check | Result |
|-------|--------|
| Branch | `cursor/p2228-qv-header-primary-status-i18n-3c10` |
| merge-base = baseline | YES |
| Implementation commits from baseline | 1 |

## Scope delivered

- Structural extraction: `OperatorVehicleQuickViewHeader.tsx` from hero/header block
- Presentation adapter extension: `operator-vehicle-quick-view-i18n.ts` (header/status/release/health maps)
- Dictionary: `operator.vehicleQuickView.header.*` (+11 EN+DE keys)
- Reused: `common.close`, `dashboard.label.ready`, `dashboard.label.blocked`, `dashboard.fleet.cleaningPending`, `health.state.*`
- P228 enforce-clean boundary (2 paths)
- Localization tests (15 cases)

## Selected boundary

| In scope | Out of scope |
|----------|--------------|
| Vehicle identity chrome (license, model, station) | Quick actions |
| Primary status badge + fleet status badge | Booking/customer context |
| Cleaning pending chip | Health modules, tire, damages |
| Unreliable operational callout | Footer tools |
| Release question block + rental health prefix | QV-G Open Tasks (frozen P227) |

## Fixed-DE debt eliminated

| # | Path | Before | After |
|---|------|--------|-------|
| 1 | `OperatorVehicleQuickViewHeader.tsx` | `resolveFleetVehicleDisplayState(..., { locale: 'de' })` | Active locale via `resolveOperatorVehicleQuickViewLocale` |
| 2 | `OperatorVehicleQuickViewHeader.tsx` | `VehicleOperationalStatusCallout locale="de"` | Active locale |
| 3 | Parent snapshot labels | `snapshot.primaryLabel` / `releaseLabel` (DE from utils) | Adapter maps from machine codes in header |

`deriveOperatorVehicleStatusSnapshot` retains internal `locale: 'de'` for derivation labels; header bypasses snapshot labels for presentation.

## Dictionary accounting

| Metric | Baseline | Final |
|--------|----------|-------|
| EN keys | 8434 | 8445 |
| DE keys | 8434 | 8445 |
| New keys | — | 11 |
| Reused keys | — | ready/blocked/cleaning/close/health.state.* |
| Parity | 100% | 100% |
| Orphans | 0 | 0 |

## Scanner accounting

| Metric | Before (header scope) | After |
|--------|----------------------|-------|
| P228 scoped visible | 3 fixed-DE + hidden | 0 |
| Remaining Quick View residual | ~20 | ~17 (later slices) |
| Global enforce-clean | 0 | 0 |
| Shim | 29 | 29 |

## Validation

- `npm run i18n:check` — PASS
- `operator-vehicle-quick-view-header-localization.test.tsx` — PASS
- `operator-vehicle-quick-view-tasks-localization.test.tsx` — 11/11 PASS (QV-G non-regression)
- `npm run build` — PASS
- P228 = 0; P227–P216 = 0

## Verdict

**A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT P2.2.28 RE-AUDIT**
