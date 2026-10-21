# Temporal analytics evidence contract

**Purpose:** Trip → vehicle rolling → rental/booking aggregation; high-timeframe metrics.

**Primary sources:**
- `backend/src/modules/vehicle-intelligence/driving-impact-rolling/`
- `backend/src/modules/rental-driving-analysis/rental-driving-analysis.service.ts`
- `VehicleDrivingImpactCurrent` (30-day rolling window)

**Gap:** Daily/weekly driver trend APIs beyond rental booking window — PARTIALLY RECONSTRUCTED.
