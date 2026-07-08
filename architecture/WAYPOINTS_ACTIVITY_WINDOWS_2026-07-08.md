# ClickHouse Waypoints + Activity Windows Producers (V4.9.263)

**Date:** 2026-07-08  
**Scope:** Post-trip analytics evidence only — not canonical trip truth.

## Problem

- `telemetry_waypoints` existed with schema + read paths (Data Analyse) but no writer.
- `trip_activity_windows` existed; `ActivityWindowDetector` queried snapshots at runtime but never persisted windows.
- Both tables are useful for route replay, trip evidence, signal quality, and reconciliation.

## Solution

Two opt-in producers, disabled by default:

| Producer | Flag | Source | Target |
|----------|------|--------|--------|
| Waypoint mirror | `WAYPOINT_MIRROR_ENABLED` | PostgreSQL `vehicle_trip_waypoints` (after trip finalize / enrichment) | `telemetry_waypoints` |
| Activity windows | `ACTIVITY_WINDOW_MIRROR_ENABLED` | `telemetry_state_changes` + `telemetry_snapshots` in trip window | `trip_activity_windows` |

Orchestration: `TripChEvidenceMirrorCoordinator` — fire-and-forget from:

1. `TripDetectionOrchestrationService.processFinalize` (completed trips)
2. `TripBehaviorEnrichmentService` (post-enrichment, same trip window)

## Safety contract

- PostgreSQL + DIMO FSM remain canonical trip truth.
- No live-map / 5s snapshot flood into waypoints (only PG trip waypoints, 30s downsample).
- Best-effort CH writes; failures never block finalize, enrichment, or API responses.
- Idempotent waypoint mirror per `trip_id` (`hasTripWaypoints`).
- Activity windows use ReplacingMergeTree + dedupe keys — safe to re-run.
- Additive migration `006_waypoints_activity_windows_producer.sql` only.

## Data volume guards

- Waypoints: trip-scoped only; 30s downsample; skip when PG has zero waypoints.
- Activity windows: one batch per trip window; derived from existing CH mirror tables (snapshots ~30s, state changes on transitions).

## Diagnostics

Data Analyse HF payload exposes (internal/debug):

- `waypointProducerStatus` / `activityWindowProducerStatus` (`active` | `disabled`)
- `activityWindowCount24h`

## Explicitly not implemented

- Writing waypoints from `DimoSnapshotProcessor` / live polling (would duplicate live-map flood).
- Creating or finalizing trips from ClickHouse data.
- Moving trip FSM state into ClickHouse.
