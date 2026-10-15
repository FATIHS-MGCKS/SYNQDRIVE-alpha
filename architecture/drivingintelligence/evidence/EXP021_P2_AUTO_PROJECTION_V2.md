# EXP021 P2 — automatic V2 trip speed QC projection after S4 completion

| Field | Value |
|-------|-------|
| Status | DRAFT integration (feature **OFF** by default) |
| Base merge | PR #2027 on `main` @ `58eb50481d` |
| QC policy | `DI_V0_SPEED_QC_POLICY_V2` (explicit; never rewrites V1 CURRENT) |

## Purpose

After a **durable, successful** S4 PRIMARY completion (pinned snapshot + shadow result), enqueue and run the existing `DiV0TripSpeedQualityProjectionService` with `qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2`. No second calculator; no S4C executor import; no provider calls.

## Trigger and durability

1. **Discovery** (leader scheduler tick): SQL `INSERT … ON CONFLICT DO NOTHING` into `di_v0_trip_speed_quality_auto_projection_outbox_v1` for eligible completed PRIMARY work items missing a CURRENT V2 projection row.
2. **Processing**: `FOR UPDATE SKIP LOCKED` claim → `projectForWorkItem(orgId, workItemId, { qcPolicyVersion: V2 })` → outbox `SUCCEEDED` | `SKIPPED_INELIGIBLE` | `FAILED_RETRYABLE` (exponential backoff).
3. **Scheduler**: `DiV0P2AutoProjectionV2Scheduler` in `DiV0TripSpeedQualityModule` (loaded via `VehicleIntelligenceModule`), guarded by `SchedulerLeaderGuardService` job `di_v0_p2_auto_projection_v2`.

Process crash between S4 completion and projection does not lose work: discovery re-enqueues until a CURRENT V2 row exists or the row is terminal-skipped.

## Eligibility (discovery)

- `run_purpose` / `purpose_discriminator` = `PRIMARY`
- `status` = `COMPLETED` and row is the **active primary** for `(organization_id, trip_id)` (not superseded by a newer boundary occurrence)
- `pinned_snapshot_hash` and `shadow_run_id` present; evidence snapshot row exists for pinned hash
- `completed_at >= DI_V0_P2_AUTO_PROJECTION_V2_ENABLED_SINCE` (required when feature enabled — **no unbounded historical backfill**)
- No existing CURRENT projection for same `work_item_id` + `DI_V0_SPEED_QC_POLICY_V2` + `DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1`

## Idempotency and ordering

- Outbox PK = `work_item_id`; projection idempotency keys include `qcPolicyVersion` — V1 and V2 CURRENT rows may coexist.
- Successful projection prevents rediscovery; duplicate scheduler ticks and parallel workers cannot create duplicate CURRENT V2 rows.
- Late processing of an **older** superseded work item: projection errors `WORK_ITEM_SUPERSEDED` / `NOT_ACTIVE_PRIMARY` → `SKIPPED_INELIGIBLE` (does not replace a newer trip primary’s result).

## Failure handling

- Ineligible scope errors → terminal skip on outbox; **S4 work item rows are not updated**.
- Transient / unknown errors → `FAILED_RETRYABLE` with backoff; visible via outbox `status`, `last_error_code`, `last_error_at`.

## Activation (default OFF)

| Env | Role |
|-----|------|
| `DI_V0_P2_AUTO_PROJECTION_V2_ENABLED` | `true`/`1` to arm scheduler + discovery |
| `DI_V0_P2_AUTO_PROJECTION_V2_ENABLED_SINCE` | **Required** when enabled; only completions at/after this instant |
| `DI_V0_P2_AUTO_PROJECTION_V2_BATCH_LIMIT` | Optional claim batch (default 20, max 100) |

**Scope when enabled:** forward-only from `ENABLED_SINCE`; no automatic full-fleet historical replay on toggle.

## Read path (next API/UI step)

Ops / future API:

- CURRENT V2: `DiV0TripSpeedQualityProjectionService.readCurrentOpsProjection(organizationId, workItemId, { qcPolicyVersion: 'DI_V0_SPEED_QC_POLICY_V2' })`
- Table: `di_v0_trip_speed_quality_projections_v1` filtered by `qc_policy_version` + `lifecycle_status = 'CURRENT'`
- Backlog / failures: `di_v0_trip_speed_quality_auto_projection_outbox_v1` by `status`, `next_attempt_at`

## Non-effects

- GPS L3 numeric authority unchanged; S1/S2/calibration/QC evaluator unchanged; no null→0; no extra provider calls; production S4 flags unchanged in this PR; customer runtime **not** activated.

## Validation

- Unit: `di-v0-p2-auto-projection-v2.config.unit.spec.ts`
- Postgres: `di-v0-p2-auto-projection-v2.postgres.integration.spec.ts` (via `npm run test:di:trip-speed-quality:postgres`)
- Dormant audit: S4C still must not import P2; AppModule still must not import trip-speed-quality directly.
