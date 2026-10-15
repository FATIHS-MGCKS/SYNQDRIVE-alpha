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

## 2026-10-15 — Production P2 V2 `UNKNOWN` (diagnosis; root cause still open)

### Timeline / SHA separation

| When | SHA | Role |
|------|-----|------|
| Initial symptom window (deploy anchor) | `137251770926839b8105ae42da762191411423d4` | P2 active; outbox `FAILED_RETRYABLE` / `UNKNOWN`; preview `ASSESSED`; CURRENT V2 `0`. |
| Diagnosis probes (same day, ~14:20–14:29 UTC) | `137251770926839b8105ae42da762191411423d4` | Read-only compute + **diagnostic** persist probe (see below). |
| Re-verification (this correction pass) | `9b355f7b62eb8e82ec6e5d73fceeb216653a4ea2` | Parallel workstream deploy; **do not roll back** to `13725177…`. Outbox still `UNKNOWN`; CURRENT V2 still `0` for affected trips. |

### Confirmed facts (not root cause)

- `ORIGINAL_PRODUCTION_ROOT_CAUSE` = **UNKNOWN** (no captured stack / Prisma code / typed exception in available Production logs).
- `ERROR_OBSERVABILITY_GAP` = **CONFIRMED** — outbox stores `last_error_code` only; P2 warn lines lacked `failureStep` + safe exception detail before PR #2037 diagnostic scope.
- Schema on Production matches repo migrations (`20261013180000_*`, `20261015103000_*`, `20261015120000_*`).
- Read-only compute + `JSON.stringify` OK for work item `f9a2801f-…` on diagnosis SHA.

### Production diagnostic persist probe (mutation — documented)

| Item | Value |
|------|--------|
| Time (approx.) | 2026-10-15 ~14:20–14:29 UTC (during Cloud Agent investigation on SHA `13725177…`) |
| Path | `computeDiV0TripSpeedQualityProjectionV1ForWorkItem` → `DiV0TripSpeedQualityProjectionRepository.persistCurrentProjection` (full app `DATABASE_URL`, **not** nested outer transaction) |
| Work item | `f9a2801f-a623-48ee-9337-33fe5e6cc155` |
| Tables | `di_v0_trip_speed_quality_projections_v1` |
| Transaction boundary | Repository-internal `prisma.$transaction` (advisory lock + supersede + INSERT + SELECT by `newId`) |
| Committed effects | INSERT one row `id=d3ec591a-508f-48b9-b584-7930e5b0a43c`, `lifecycle_status=CURRENT`, `qc_policy_version=DI_V0_SPEED_QC_POLICY_V2` |
| Follow-up | Separate `DELETE FROM di_v0_trip_speed_quality_projections_v1 WHERE id = d3ec591a-…` (same session; not provably same DB transaction as INSERT) |

**Probe side-effect audit (read-only on SHA `9b355f7b62…`, 2026-10-15 ~14:50 UTC):**

- Residual probe row `d3ec591a-…`: **not present** (`rowsFound=0`).
- Projections for `f9a2801f-…` and `74896a4d-…`: **0 rows** (no CURRENT/SUPERSEDED audit trail from probe).
- Global CURRENT V2 count: **0**.
- Outbox unchanged by probe (scheduler continued retries: attempt counts 11 / 8; still `FAILED_RETRYABLE` / `UNKNOWN`).
- **Limitation:** DELETE removes the inserted row only; it does **not** prove absence of other side effects (e.g. brief CURRENT scope lock, sequence-like counters, or concurrent scheduler interaction). Outbox was not reset.

`PRODUCTION_MUTATIONS=YES_DIAGNOSTIC_INSERT_AND_DELETE` — no further Production writes in this workstream.

### PR #2037 scope (diagnostic only — not a root-cause fix claim)

- Structured, data-sparse P2 logs: `failureStep` ∈ `compute` \| `persist` \| `outbox_ack`, explicit projection codes via `instanceof` only for outbox terminal skip; Prisma **code string only** (no `meta`).
- Does **not** claim to fix the original Production failure; goal is to capture the **first original exception** on a future deploy while natural retries run (`ENABLED_SINCE` / outbox backoff preserved).

### Tests (honest scope)

| Test | What it proves |
|------|----------------|
| `di-v0-p2-auto-projection-failure-log.unit.spec.ts` | Log shape + failureStep attachment; **not** Production failure reproduction. |
| `(synthetic) FAILED_RETRYABLE … recovers` (Postgres) | Happy-path retry after manual outbox seeding; **does not** reproduce Production `UNKNOWN`. |
| Existing P2 Postgres suite | Regression on known-good fixture persist; **does not** model Production trip data. |

### Diagnostic deploy plan (after owner approval — not executed in #2037)

1. Merge **only** the observability PR to `main` (no flag changes; API/UI OFF).
2. Deploy to Production on top of current line (`9b355f7b62…` or newer); **no** rollback to `13725177…`.
3. Read-only observe: outbox `status` / `last_error_code` / `attempt_count`; global CURRENT V2 count; PM2/backend logs for new `failureStep=` / `prismaCode=` lines on next natural retry (respect `next_attempt_at` backoff — **no outbox reset**).
4. Success criteria: either (a) `SUCCEEDED` + CURRENT V2 row without manual reset, or (b) first non-`UNKNOWN` outbox code **plus** matching structured log identifying compute vs persist vs outbox_ack.
