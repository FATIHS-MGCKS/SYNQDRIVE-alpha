# EXP021 P2 — automatic V2 trip speed QC projection after S4 completion

| Field | Value |
|-------|-------|
| Status | DRAFT integration (feature **OFF** by default) |
| Base merge | PR #2027 on `main` @ `58eb50481d` |
| QC policy | `DI_V0_SPEED_QC_POLICY_V2` (explicit; never rewrites V1 CURRENT) |

## Purpose

After a **durable, successful** S4 PRIMARY completion (pinned snapshot + shadow result), enqueue and run the existing `DiV0TripSpeedQualityProjectionService` with `qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2`. No second calculator; no S4C executor import; no provider calls.

## Trigger and durability

1. **Discovery** (leader scheduler tick): eligible completed PRIMARY work items **without any outbox row yet** and without CURRENT V2 → `INSERT … ON CONFLICT DO NOTHING` (existing retry/backlog rows are excluded before `ORDER BY`/`LIMIT`).
2. **Processing**: `FOR UPDATE SKIP LOCKED` claim assigns `claim_token` + `claim_expires_at` (bounded lease). Before each row in a claimed batch, `renewClaimLease` extends the lease (sequential batch safety). Expired `PROCESSING` rows are reclaimable. `projectForWorkItem` → outbox ack only when `claim_token` matches (stale workers cannot overwrite). Discovery sets `next_attempt_at` from the same pass `now` as claim (avoids DB vs app clock skew on PENDING rows).
3. **Scheduler**: `DiV0P2AutoProjectionV2Scheduler` in `DiV0TripSpeedQualityModule` (via `VehicleIntelligenceModule`), job `di_v0_p2_auto_projection_v2`. Invalid auto-projection env → bootstrap `disabledReason` + scheduler off; **Nest bootstrap continues**.

**Tested recovery paths:** expired `PROCESSING` before projection; expired `PROCESSING` after persist (idempotent re-project + ack); fenced stale ack.

## Eligibility (discovery)

- `run_purpose` / `purpose_discriminator` = `PRIMARY`
- `status` = `COMPLETED` and row is the **active primary** for `(organization_id, trip_id)`
- `pinned_snapshot_hash` and `shadow_run_id` present; evidence snapshot row exists for pinned hash
- `completed_at >= DI_V0_P2_AUTO_PROJECTION_V2_ENABLED_SINCE`
- No CURRENT V2 projection; **no existing outbox row** for `work_item_id`

## Idempotency and ordering

- Outbox PK = `work_item_id`; projection idempotency keys include `qcPolicyVersion`.
- Superseded / inactive primary → `SKIPPED_INELIGIBLE` (does not displace newer active primary CURRENT).

## Failure handling

- Ineligible scope → terminal skip; S4 rows unchanged.
- `SNAPSHOT_VERIFICATION_FAILED` and other non-skip errors → `FAILED_RETRYABLE` with backoff.

## Activation (default OFF)

| Env | Role |
|-----|------|
| `DI_V0_P2_AUTO_PROJECTION_V2_ENABLED` | `true`/`1` to arm scheduler + discovery |
| `DI_V0_P2_AUTO_PROJECTION_V2_ENABLED_SINCE` | **Required** when enabled |
| `DI_V0_P2_AUTO_PROJECTION_V2_BATCH_LIMIT` | Optional claim batch (default 20, max 100) |

## Read path (next API/UI step)

- CURRENT V2: `readCurrentOpsProjection(organizationId, tripId, 'DI_V0_SPEED_QC_POLICY_V2')` on `DiV0TripSpeedQualityProjectionService`
- Table: `di_v0_trip_speed_quality_projections_v1` (`qc_policy_version`, `lifecycle_status = 'CURRENT'`)
- Backlog: `di_v0_trip_speed_quality_auto_projection_outbox_v1` (`status`, `next_attempt_at`, `last_error_code`)

## Non-effects

GPS L3 / S1 / S2 / calibration / QC evaluator unchanged; no null→0; no extra provider calls; customer runtime **not** activated.

## Validation

- Unit: config + module bootstrap specs
- Postgres: `di-v0-p2-auto-projection-v2.postgres.integration.spec.ts` (claim lease, discovery starvation, concurrency)

## 2026-10-15 — Production P2 V2 persist UNKNOWN (read-only diagnosis + fix)

| Field | Observation |
|-------|-------------|
| Production SHA | `137251770926839b8105ae42da762191411423d4` |
| Symptom | Post-`ENABLED_SINCE` eligible PRIMARY completions enqueued; outbox `FAILED_RETRYABLE` / `last_error_code=UNKNOWN`; preview `ASSESSED`; CURRENT V2 count `0` (work items `f9a2801f-…`, `74896a4d-…`). |
| Schema | `di_v0_trip_speed_quality_projections_v1` columns + migrations `20261013180000_*`, `20261015103000_*`, `20261015120000_*` present on Production (read-only `information_schema` check). |
| Compute path | Read-only `computeDiV0TripSpeedQualityProjectionV1ForWorkItem` + `JSON.stringify` OK on Production for failing work item. |
| Persist path | Same SHA: `persistCurrentProjection` succeeds when invoked with app `DATABASE_URL` (diagnostic row removed immediately after probe). Scheduler failures therefore align with **unmapped error classification** in `DiV0P2AutoProjectionV2Service` (formerly `instanceof`-only → `UNKNOWN`), not a missing table/migration. |
| Fix | `resolveDiV0TripSpeedQualityProjectionErrorCode` (duck-type + Prisma + message prefix); structured P2 warn logs; motion counter throws `DiV0TripSpeedQualityProjectionError`; persist insert missing-row guard → `CURRENT_SCOPE_CONFLICT`; Postgres test for `FAILED_RETRYABLE` recovery without outbox reset. |
| Post-deploy expectation | Existing `FAILED_RETRYABLE` rows retry with preserved `attempt_count` / `ENABLED_SINCE`; no manual outbox reset required. |
