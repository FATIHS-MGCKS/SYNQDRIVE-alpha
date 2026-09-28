# M3.3F F4.4 — Controlled D3 activation preflight (read-only)

**Date:** 2026-09-28  
**Mode:** READ-ONLY production inspection + **one** fresh pre-D3-write database backup. **D3 not enabled.** **`F_D3_T0` not assigned.**

## Authority anchors

| Item | Value |
|------|-------|
| Governance `origin/main` | `815916b12432e36318379386499b63e5726d66fa` (PR #1820 merged — F4.3 deploy seal) |
| Authoritative Battery production runtime | `68a05e4156db28568ad5b7718ca1f9ad2d799884` |
| Production release | `20260928001456_v4994` |
| F4.3 engineering | PR #1817 merged @ `68a05e41` |
| F4.3 production seal | PR #1820 merged |
| `CURRENT_MAIN_IS_BATTERY_DEPLOY_CANDIDATE` | **NO** — unrelated DI S4A dormant foundation + migration on main after Battery tip |

## Production runtime identity (both replicas)

| Field | Value |
|-------|-------|
| `LIVE_PRODUCTION_SHA` | `68a05e4156db28568ad5b7718ca1f9ad2d799884` |
| `LIVE_RELEASE_ID` | `20260928001456_v4994` |
| Replica A (port **3001**, scheduler **leader** at capture) | same SHA |
| Replica B (port **3002**, **NOT_LEADER** at capture) | same SHA |
| `PRODUCTION_SHA_CONVERGED` | **YES** |

## Flag / config baseline (`/opt/synqdrive/shared/backend.env`)

| Variable | Configured | Effective |
|----------|------------|-----------|
| `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED` | `true` | **true** |
| `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED` | `true` | **true** |
| `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED` | **absent** | **OFF** (default false) |
| `BATTERY_V2_LONGITUDINAL_RECONCILIATION_BATCH_SIZE` | absent | default **2** (max 5) |
| `BATTERY_V2_LONGITUDINAL_RECONCILIATION_INTERVAL_MS` | absent | default **900000** (15 min, min 300000) |
| `BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT` | absent | runtime default from F1 foundation |

| Replica | D3 effective | `synqdrive_battery_longitudinal_materialization_flag_enabled` |
|---------|--------------|----------------------------------------------------------------|
| 3001 (leader) | OFF | **0** |
| 3002 (follower) | OFF | **0** |

`D3_CONFIG_CONVERGED_OFF=YES` · `F_D3_T0_ASSIGNED=NO`

## Post-F4.3 database baseline (read-only, pre-backup)

| Metric | Value |
|--------|-------|
| `TOTAL_C3_ROWS` | 32 |
| `CURRENT_VERSION_C3_ROWS` | 32 |
| `C3_ORGANIZATION_COUNT` | 1 |
| `C3_VEHICLE_COUNT` | 4 |
| `D3_REVISION_ROW_COUNT` | 0 |
| `D3_DISTINCT_ORGANIZATION_COUNT` | 0 |
| `D3_DISTINCT_VEHICLE_COUNT` | 0 |
| `SOURCE_EVIDENCE_ACK_ROW_COUNT` | 0 |
| Fleet cursor | `lastOrganizationId=null`, `lastVehicleId=null` |
| `PENDING_MIGRATION_COUNT_FOR_PRODUCTION_RUNTIME` | **0** (`Database schema is up to date!` @ deployed release) |

## Strong pre-activation backup

| Field | Value |
|-------|-------|
| `BACKUP_PATH` | `/opt/synqdrive/shared/backups/db-pre-d3-activation-20260928010930.sql.gz` |
| `BACKUP_TIMESTAMP_UTC` | `2026-09-28T01:09:43Z` |
| `BACKUP_SIZE_BYTES` | `86859398` |
| `BACKUP_SHA256` | `67787da83bc45b743b6538d9f97735372f5f4137c700f6ef4e94e0656904769d` |
| `BACKUP_GZIP_TEST` | **PASS** |
| SQL stream header | readable (`-- PostgreSQL database dump`) |
| Dump completion trailer | **present** (`PostgreSQL database dump complete`) |
| Ephemeral restore | **attempted** (Docker); **DOCKER_START_FAIL** on VPS — gzip + full-stream trailer gate **PASS** |

Post-backup re-read: D3 revisions **0**, ack rows **0**, D3 flags **OFF** both replicas → **`BACKUP_CONFIRMED_PRE_D3_WRITE=YES`**

## Eligible cohort (read-only; fleet cursor **not** advanced)

With **zero** ack rows globally, all current-version C3 vehicles with valid org/vehicle join are fingerprint-unacked candidates for eventual reconciliation ordering (bounded keyset + cursor at activation).

| Metric | Value |
|--------|-------|
| `CURRENT_ELIGIBLE_ORGANIZATION_COUNT` | 1 |
| `CURRENT_ELIGIBLE_VEHICLE_COUNT` | 4 |
| `PRE_ACTIVATION_CROSS_TENANT_MISMATCH_COUNT` | **0** |

Sample (org, vehicle, latest C3 `computedAt` UTC):

| organizationId | vehicleId | latestComputedAt |
|----------------|-----------|------------------|
| `faa710c9-6d91-4079-a7d5-91fdccdec14a` | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` | 2026-09-27T15:08:03.757Z |
| `faa710c9-6d91-4079-a7d5-91fdccdec14a` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` | 2026-09-27T21:31:11.460Z |
| `faa710c9-6d91-4079-a7d5-91fdccdec14a` | `c10351f8-b6a2-4258-947f-631aeaa6d359` | 2026-09-28T00:32:08.351Z |
| `faa710c9-6d91-4079-a7d5-91fdccdec14a` | `8c850ff1-4201-432b-af2e-2711dbc7ca48` | 2026-09-28T00:48:08.076Z |

## Activation scope (runtime @ `68a05e41`)

| Gate | Value |
|------|-------|
| Per-vehicle D3 allowlist | **NO** |
| Per-org D3 allowlist | **NO** |
| `GLOBAL_D3_FLAG_SCOPE` | **GLOBAL** — first activation is **not** a single-vehicle canary |

## First activation batch strategy (env change only; **not applied** in F4.4)

| Check | Result |
|-------|--------|
| `BATCH_SIZE_ONE_SUPPORTED` | **YES** — `getBatteryV2LongitudinalReconciliationBatchSize()` accepts positive integers capped at 5 |
| `BATCH_SIZE_ONE_SCIENTIFIC_SEMANTICS_UNCHANGED` | **YES** — same scheduler interval, overlap guard, D1/D3 pipeline; only candidate cap per completed tick |
| `FIRST_ACTIVATION_BATCH_SIZE` | **1** (recommended) |
| `FIRST_ACTIVATION_INTERVAL_MS` | **UNCHANGED** (900000 default) |

## First-tick impact bound (batch size 1)

| Bound | Value |
|-------|-------|
| `MAX_CANDIDATES_FIRST_TICK` | 1 |
| `MAX_NEW_D3_REVISIONS_FIRST_TICK` | 1 |
| `MAX_NEW_ACK_ROWS_FIRST_TICK` | 1 |

Outcome matrix (one processed candidate max):

| Processed outcome | Δ D3 revisions | Δ ack rows |
|-------------------|----------------|------------|
| CREATED | ≤ 1 | CREATED or EXISTING (idempotent ack) |
| EXISTING | 0 | ≤ 1 (ack may still append) |
| D1_REJECTED | 0 | 0 |
| D2_REJECTED | 0 | 0 |
| ERROR | classify at transaction boundary | classify at transaction boundary |

**Transaction semantics:** D3 `insertIdempotent` runs inside **one** DB transaction; source-evidence **ack** is a **separate** repository call afterward (`LongitudinalProfileMaterializationService.materialize`). Therefore:

- `D3_AND_ACK_ATOMIC_TRANSACTION=NO`
- `PARTIAL_REVISION_WITHOUT_ACK_POSSIBLE=YES` (crash between insert and ack)
- `PARTIAL_REVISION_RECOVERY_SAFE=YES` — reconciliation retries; EXISTING revision path still invokes idempotent ack

## Frozen activation rollout (not executed)

Shared `backend.env` + PM2 rolling restart (same pattern as `rfrf-production-enable-stage.sh`):

1. Atomically set `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED=true` and `BATTERY_V2_LONGITUDINAL_RECONCILIATION_BATCH_SIZE=1`
2. Restart **current non-leader** (port 3002 at preflight capture) first → verify health, SHA unchanged, gauge **1**, still `NOT_LEADER` ticks
3. Restart **leader** (3001) → leadership may transfer; both gauges **1** after convergence
4. **`F_D3_T0`** = earliest production process time D3 flag effectively **true** (may be follower before any materialization)
5. Wait **one** natural reconciliation interval tick; evaluate first-tick contract before extended observation

`ACTIVATION_NON_LEADER_FIRST_SUPPORTED=YES` · `ACTIVATION_ROLLING_SEQUENCE_FROZEN=YES`

## Frozen rollback (not executed)

1. Set D3 flag **false** (retain batch size or restore prior — immaterial when OFF)
2. Restart non-leader first → gauge **0**, healthy
3. Restart leader → both gauges **0**, no new D3/ack writes after convergence
4. **No** data deletion · **no** schema rollback

`ROLLBACK_RUNBOOK_FROZEN=YES` · `ROLLBACK_REQUIRES_DATA_DELETE=NO` · `ROLLBACK_REQUIRES_SCHEMA_ROLLBACK=NO` · `ROLLBACK_STOPS_NEW_ATTEMPTS=YES`

## Metric baselines (2026-09-28T01:09:30Z UTC)

### Replica 3001 (leader)

| Metric | Value |
|--------|-------|
| Flag gauge | 0 |
| Ticks NOT_LEADER / FLAG_OFF / OVERLAP / COMPLETED / FAILED | 0 / **2** / 0 / 0 / 0 |
| Processed CREATED / EXISTING / D1 / D2 / ERROR | 0 / 0 / 0 / 0 / 0 |
| Ack CREATED / EXISTING | 0 / 0 |
| Invariant VEHICLE_ORGANIZATION_MISMATCH | 0 |
| Last success timestamp | 0 |

### Replica 3002 (follower)

| Metric | Value |
|--------|-------|
| Flag gauge | 0 |
| Ticks NOT_LEADER / FLAG_OFF / OVERLAP / COMPLETED / FAILED | **2** / 0 / 0 / 0 / 0 |
| Processed / Ack / Invariant | all **0** |
| Last success timestamp | 0 |

## First-tick acceptance contract (frozen)

Hard **PASS** after first natural D3-enabled leader tick:

- Both replicas remain @ `68a05e41`; both D3 gauges **1** after env convergence
- Exactly one scheduler leader; `candidateCount ≤ 1`; `processed ≤ 1`
- Invariant failure delta **0**; ERROR delta **0**; no schema/DB integrity errors
- D3/ack DB deltas consistent with processed outcome; C3 healthy; ERD env unchanged
- D1/D2 rejections: **not** automatic failure (classify reason)

`REJECTION_SPIKE_NUMERIC_THRESHOLD=UNSET`

## Hard abort conditions (immediate rollback candidates)

Replica SHA divergence; post-convergence D3 config divergence; `candidateCount > batch size`; `VEHICLE_ORGANIZATION_MISMATCH`; reconciliation **ERROR**; unclassified scheduler **FAILED**; scientific uniqueness violation; duplicate D3 revision anomaly; ack authority inconsistency; unrecoverable revision-without-ack semantics; Prisma/schema/Postgres integrity errors; scheduler runaway; C3 regression from activation; ERD config mutation.

## No-backfill semantics

`M3_3F_BACKFILL_POLICY=NO_BACKFILL` · `HISTORICAL_REPLAY_AUTHORIZED=NO` · `NATURAL_C3_AWAITING_D3_CLASSIFICATION_VALID=YES`

Post-`F_C3_T0` C3 rows materialized after `F_D3_T0` are **natural** reconciliation, not authorized historical replay.

## Preflight decision

**`F4_4_PREFLIGHT=PASS`**  
**`F4_D3_ACTIVATION_ALLOWED=YES`** — authorized for a **future explicit activation command only**; this task did **not** enable D3.

**`NEXT_STAGE=F4_5_CONTROLLED_D3_PRODUCTION_ACTIVATION`** (explicit operator command; follower-first rollout + first-tick evidence gate).
