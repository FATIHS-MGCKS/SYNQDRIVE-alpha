# Driving Impact read consumer audit (PR B — documentation only)

## Trip canonical hydration / vehicle trip API

- Selects `TripDrivingImpact.analysisStatus` and `sourceCompleteness` at read time.
- Exposes additive API fields: `drivingImpactAnalysisStatus`, `drivingImpactScoreSource`, `drivingImpactSourceCompleteness`.
- Does not recalculate scores or change `buildSummary` score selection.

## DriverScoreService

- **Current:** `getImpactMap` loads `drivingStressScore` and `distanceKm` only; no `analysisStatus` filter.
- **PR B:** unchanged aggregation behavior.
- **Follow-up:** optional `COMPLETE|PARTIAL` filter aligned with brake wear readers.

## RentalDrivingAnalysis

- **Current:** loads TDI rows without status filter; falls back `impact?.drivingStressScore ?? trip.drivingScore`.
- **PR B:** unchanged.
- **Follow-up:** migrate to canonical hydration + R1 containment; stop raw `drivingScore` mirror fallback for aggregates.

## Tire / Brake

- **Brake:** `brake-recalculation-input.loader` already filters `analysisStatus IN (COMPLETE, PARTIAL)`.
- **Tire:** trip usage readers inspected — no change in PR B.
