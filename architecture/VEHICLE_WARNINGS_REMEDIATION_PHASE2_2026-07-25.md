# Vehicle Warnings Remediation — Phase 2 Backend (2026-07-25)

## Scope

Backend-only continuation of vehicle-warnings remediation (audit WP-02–04, WP-14, WP-16 subset).

## Data model

### `vehicle_findings`

Canonical finding row keyed by `(organization_id, dedupe_key)` with FSM:

`ACTIVE` → `ACKNOWLEDGED` → `RESOLVED` / `SUPERSEDED` / `EXPIRED`

Bridges from domain alerts/notifications are wired via `FindingBridgeService` (V4.9.866) — see `VEHICLE_WARNINGS_REMEDIATION_FOLLOWUPS_2026-07-25.md`.

### FK integrity (VW-F-009)

- `battery_evidence.vehicle_id` — `ON DELETE SET NULL` (nullable)
- `vehicle_dtc_events.vehicle_id` — `ON DELETE SET NULL` (nullable)

Preserves evidence/DTC history when a vehicle row is hard-deleted.

### Complaint dedupe (VW-F-025)

- `vehicle_complaints.dedupe_key` + partial unique index on active statuses
- `buildComplaintCreateDedupeKey()` on create; conflict if duplicate active observation

## Ingestion / projection

| ID | Change |
|----|--------|
| VW-F-008 | VLS monotonic guard in `DimoSnapshotProcessor` — skip stale `sourceTimestamp` overwrites |
| VW-F-007 | DTC webhook uses shared `normalizeDtcCodes()` |
| VW-F-027 | Insight publish per-`dedupeKey` swap (no blanket deactivate-all) |
| Battery V2 | Idempotency check before Redis vehicle lock (contention fix) |

## Workflow (VW-F-034)

`VehicleHealthWorkflowEmitter` on `RentalHealthService.getVehicleHealth()` emits:

- `vehicle.health.warning`
- `vehicle.health.critical`

on severity-band transitions (in-memory per process).

## GDPR stubs (WP-16)

- `insight-redaction.helper.ts` — role-based PII redaction for insight DTOs
- `VehicleWarningRetentionScheduler` — cron deletes when `VEHICLE_WARNING_RETENTION_ENABLED=true` (V4.9.866)
- `VehicleWarningErasureService` — complaint + notification PII redaction (V4.9.866)

## Audit (VW-F-032)

`TechnicalObservationsService` writes `ActivityLog` entries on create/update/resolve/dismiss/convert.

## Migration

`20260725200000_vehicle_warnings_phase2_integrity`
