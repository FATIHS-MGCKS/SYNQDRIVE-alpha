# EXP021 P2 — Trip speed quality projection V1

**Status:** IMPLEMENTED (draft PR)  
**Policy binding:** `DI_V0_SPEED_QC_POLICY_V1`  
**Projection:** `DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1`  
**Persistence:** `di_v0_trip_speed_quality_projections_v1`  
**Runtime:** OFF — `DiV0TripSpeedQualityModule` not registered on AppModule; no S4 T06 hook.

## Scope

Internal ops read model aggregating per-interval QC over COMPLETED PRIMARY work items with verified pinned S4 evidence snapshots. S1/S2/S4C execution paths unchanged.

## Validation

- `npm run test:di:trip-speed-quality`
- Dormant audit: no import from AppModule / VehicleIntelligenceModule / S4C executor
