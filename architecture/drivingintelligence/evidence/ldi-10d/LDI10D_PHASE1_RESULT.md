# LDI-10D Phase 1 — Result

## Summary

Read-only architecture audit: **Mapbox is integrated for fleet/trip/station/vendor surfaces and trip route enrichment**, but **not** for the LDI-08…10C forensic chain. **OSM exists only as an EXP021 Overpass prototype**, not frozen for trip `f3e1fa83`. LDI route geometry is **raw 1 Hz GPS** (346 points). Recommended Phase 2: **versioned OSM bbox export + maneuver↔feature association** without Mapbox matching or QC changes.

## Deliverables (this folder)

| File | Content |
|------|---------|
| `LDI10D_PHASE1_ARCHITECTURE_AUDIT.md` | Mapbox/OSM inventory, provenance trace, gaps |
| `LDI10D_PHASE1_DECISION_MATRIX.md` | Mapbox vs OSM |
| `LDI10D_PHASE1_EVIDENCE_SCHEMA.json` | Proposed frozen OSM + association schema |
| `LDI10D_PHASE1_MATCHING_ALGORITHM.md` | Spatiotemporal association design |
| `LDI10D_PHASE1_RISKS_AND_PHASE2.md` | License, privacy, Phase 2 scope |
| `LDI10D_PHASE1_SUMMARY.json` | Machine-readable summary |

## Integrity

- **LDI-10A…10C artifacts:** not modified.
- **QC / classifications:** preserved.

## Mandatory block

```
LDI10D_PHASE=1
LDI10D_RESULT=MAPBOX_OSM_ARCHITECTURE_AUDIT_COMPLETE
MAPBOX_CURRENT=YES_frontend_mapbox_gl_backend_matching_geocode_stations_vendors_trips_enrich_NOT_in_driving_intelligence_module
MAP_MATCHING_EXISTING=YES_Mapbox_Matching_API_v5_driving_chunked_R3_trip_route_artifact_NOT_used_for_LDI_pin
OSM_EXISTING=PARTIAL_EXP021_Overpass_traffic_signals_prototype_only_no_LDI_frozen_export
GPS_GEOMETRY_SOURCE=LDI08_S4_POSITION_PIN_observed_per_bucket_346_of_362_LDI10C_GeoJSON
GPS_TIMESTAMP_PRESERVATION=evaluationIndexUtc_1Hz_calendar_seconds_16_ROW_ABSENT_no_interpolation
ROAD_CONTEXT_FEASIBILITY=YES_with_frozen_OSM_bbox_export_and_offline_association_NO_live_provider_required_after_freeze
LICENSE_REVIEW=Mapbox_TOS_token_billing_attribution_required_OSM_ODbL_attribution_and_derived_DB_rules_apply
RECOMMENDED_PHASE2=freeze_OSM_export_for_bbox_plus_LDI10D_MANEUVER_ROAD_ASSOCIATION_json_no_mapbox_no_QC_changes
PRODUCTION_MUTATIONS=NONE
STOP=LDI10D_phase1_complete_wait_owner_review
```
