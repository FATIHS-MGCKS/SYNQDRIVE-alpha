# Tires Health — Audit Manifest

| Field | Value |
|-------|-------|
| MODULE | Tires Health |
| MODULE_SLUG | `tires` |
| AUDIT_STARTED_AT | 2026-10-24 (Tire Module full read-only audit, same day; authority bootstrap in Tire Intelligence P1) |
| AUDIT_COMPLETED_AT | — (bootstrap open; `AUDIT_IN_PROGRESS`) |
| REGISTRY_STATUS_AT_START | `NOT_STARTED` |
| REGISTRY_STATUS_AT_END | `AUDIT_IN_PROGRESS` |
| REPOSITORY | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| REPO_BASE_BRANCH | `main` |
| ORIGIN_MAIN_SHA | `1c1e3bfa48f3a912e051fb8f1bba50397b00cf25` (fetched 2026-10-24) |
| AUDIT_BRANCH_SHA | `1c1e3bfa48f3a912e051fb8f1bba50397b00cf25` (docs-only branch `cursor/tire-intelligence-p1-authority-ds4-b126`, no runtime diff) |
| PRODUCTION_AUDITED_AT | 2026-10-24T17:21Z – 17:23Z (UTC) |
| PRODUCTION_ACCESS | `VERIFIED_READ_ONLY` — SSH `synqdrive-admin@srv1374778.hstgr.cloud`, `psql` read-only via `sudo -u postgres`; PM2 list not readable (`PM2_READ_UNAVAILABLE`), public health endpoint used as liveness evidence |
| PRODUCTION_RELEASE_SHA | `c169ddfab5a180ba93d0dbd09eaf7bd02c59be7d` (PR #2154 head) |
| PRODUCTION_RELEASE_PATH | `/opt/synqdrive/releases/20261024135142_v4994` |
| REPO_PRODUCTION_DRIFT | `origin/main` is **one commit ahead** of Production (`1c1e3bfa4` = #2156 APDS VSI LV shadow classification; no tire or DS4 event change). Tire module and DS4 motion-core code are identical on both baselines |
| RUNTIME_FOOTPRINT | NestJS services under `backend/src/modules/vehicle-intelligence/tires/`, hourly scheduler + BullMQ queue `dimo.tire.recalculation` + processor, Prisma tables `vehicle_tire_setups`, `vehicle_tire_setup_mount_periods`, `vehicle_tire_tread_measurements`, `tires`, `tire_position_history`, `tire_measurements`, `tire_events`, `tire_health_snapshots`, `tire_wear_data_points`, `tire_trip_usage_ledger`, `tire_health_alerts`, `tire_rental_health_review_overrides`; REST `/vehicles/:vehicleId/tires/*`; rental-health tire policy; frontend rental/operator tire surfaces |
| AUDIT_MODE | Documentation-only; minimal targeted read-only verification; **no** DB writes, migrations, deployments, flag changes |
| VALIDATION_STATUS | `bash architecture/tires/scripts/validate-graph.sh` PASS · `bash architecture/scripts/validate-module-registry.sh` PASS (see research/CHANGE_LEDGER.md) |
| REMAINING_LIMITATIONS | PM2 process table not inspectable as `synqdrive-admin`; active-setup count read as 5 vs 6 under two filters (TIRE-GAP-ACTIVE-SETUP-COUNT-RECONCILE-001); DS4 event quality distribution derived from latest SUCCEEDED run per trip only; no out-of-sample DS4 validation |

## Audit coverage matrix

| Surface | Status | Where recorded |
|---------|--------|----------------|
| Repository current state (tire services, config, lifecycle, ledger, queue/worker, API, UI) | COVERED | `CURRENT_STATE.md`, `graph/nodes.yaml` |
| Tire Wear Model V2 inputs and weights | COVERED (exact config values) | `CURRENT_STATE.md` §V2 inputs, `integration/DS4_MOTION_INTEGRATION_AUDIT.md` |
| Driving Impact → tire dependency | COVERED | `TIRE-EXT-DI-*` nodes |
| DS4 Motion Engine / Event Detector / quality / persistence / consumer interfaces | COVERED (read-only, cross-module) | `integration/DS4_MOTION_INTEGRATION_AUDIT.md` |
| PR #2153 / #2154 review | COVERED | `TIRE-EVID-DS4-FABLE-REVIEW-2026-10-24-001` |
| Production tire tables (read-only counts) | COVERED | `evidence/PRODUCTION_BASELINE.md` |
| Production DS4 shadow runs, flags, event quality distribution | COVERED | `evidence/PRODUCTION_BASELINE.md` |
| Production process table (PM2) | NOT COVERED (`PM2_READ_UNAVAILABLE`) | `evidence/PRODUCTION_BASELINE.md` |
| Historical July 2026 readiness audit / remediation | REFERENCED as HISTORICAL evidence | `TIRE-EVID-AUDIT-READINESS-2026-07-001` |
| Frontend design alignment (Figma) | NOT IN SCOPE (no UI change) | — |
| i18n | NOT IN SCOPE (no user-facing copy changed) | — |

## Promotion gate

`AUTHORITY_ACTIVE` is **not** claimed. Open before promotion: reconcile setup count, record a second Production baseline after the first shadow adapter is deployed, close `TIRE-GAP-DI-GRAPH-NO-DS4-NODE-001` with the Driving Intelligence authority, and populate `evidence/EVIDENCE_INDEX.md` with repository test-run evidence for the tire specs.
