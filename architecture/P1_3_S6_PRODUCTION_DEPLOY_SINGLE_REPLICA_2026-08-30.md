# P1.3-S6 — Production single-replica deploy + KS MX reprocess (2026-08-30)

## Deployed SHA

- **Target / deployed:** `3874360e0` (includes PR #1443 refuel semantics + hotfix for Prometheus metric collision)
- **Release:** `20260830145314_v4994`
- **Replicas:** PM2 fork × 1 (unchanged)

## Migration

- `20260830140000_vehicle_energy_event_fuel_level_rise` applied (additive nullable columns)
- Pre-deploy backup: `/opt/synqdrive/shared/backups/db-pre-deploy-20260830144301.sql.gz` (~56 MB)

## Incident (resolved)

First deploy of `85c3cd8e0` failed startup: duplicate Prometheus gauge name
`synqdrive_dimo_provider_cooldown_active` registered by both `DimoProviderMetricsService` and
`DimoProviderBudgetService`. Rolled back app to `d221e766`, renamed budget gauge to
`synqdrive_dimo_global_budget_cooldown_active` in `3874360e0`, redeployed successfully.

## KS MX 2024 controlled reprocess

- Vehicle `a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, window 2026-08-28
- Via `EnergyEventsService.detectEnergyEvents` (application path)
- Canonical row preserved: `durationSeconds=4818`, `fuelDeltaLiters=23`
- Derived rise: `330s` (22:09:25Z → 22:14:55Z) from live telemetry
- Stale 685s sibling `df140a67-…` reconciled (deleted by guard)

## Historical backfill inventory (read-only)

- REFUEL rows with NULL rise fields: **13**
- POPULATED after KS MX reprocess: **1**
- Overlapping sibling candidate pairs (fleet-wide): **3**

## Soak

- **SOAK_START:** 2026-08-30T14:58:42Z UTC
- **SOAK_SHA:** `3874360e0`
- **SCALE_TO_2:** not executed; verdict remains `GO_WITH_CONDITIONS`
