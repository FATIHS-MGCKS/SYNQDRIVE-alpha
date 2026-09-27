# EXP-021 C1D.10A — Authority correction + Production re-anchor (read-only)

**Date:** 2026-09-27 (evidence collected 14:56–15:08 UTC)  
**Base main:** `9fece014adbfe5b2278275b6840c4bb698479b59` (PR #1808 merge)  
**Mode:** read-only. Production DB queried only with `default_transaction_read_only=on`, `statement_timeout=60s`. No write, deploy, migration, flag change or provider call.  
**Graph:** DI-EVID-EXP021-C1D10A-001 · DI-CONTRA-S2-PROD-MIGRATION-001 · DI-DEC-V0-S4A-CONTRACT-001

> READ-ONLY AUDIT · NO RUNTIME CHANGE · NO PRODUCTION WRITE · NO DEPLOY · NO PROVIDER CALL · NO CUSTOMER EFFECT

## 1. Re-anchored state

| Item | Value | Method |
|------|-------|--------|
| Local HEAD = `origin/main` = merge-base | `9fece014…` | `git fetch origin main`; `git rev-parse` |
| Production current release | `/opt/synqdrive/releases/20260927132448_v4994` | `readlink -f /opt/synqdrive/current` |
| Production SHA | `9322a5d6b6d10240f9af8491cc0106ad8c7ea98d` (PR #1807) — PR #1808 **not deployed** | `git log -1` in the release dir |
| PM2 | `synqdrive` + `synqdrive-b` online (2 backend replicas) + `pm2-logrotate` | `pm2 jlist` |
| Production `DI_V0*` / S4 env keys | 0 | `grep -c` on `backend.env` (values not read) |
| `DRIVING_INTELLIGENCE_V2_ENABLED` | `true` in Production; code default `false` | env grep; `driving-intelligence-v2.config.ts` |
| DI V0 callers outside `driving-intelligence/` | 0 imports, 0 `DiV0*` symbols, 0 `diV0Shadow*` Prisma uses | `rg` on `backend/src` |
| `vps-deploy-release.sh` (Production copy = `main` copy) | unconditionally runs `npm run prisma:migrate:deploy` before build | `diff` Production vs repo; line 106 |

## 2. P1-1 — S2 migration authority correction

| Fact | Evidence |
|------|----------|
| Migration | `20260926193000_di_v0_shadow_persistence` (added in `29af6537`, merged via PR #1799 `090c9383`) |
| Applied | `_prisma_migrations.started_at` 2026-09-26 23:46:11.262 UTC, `finished_at` 23:46:11.400 UTC, `applied_steps_count=1`, not rolled back |
| Carrier | Release `20260926234014_v4994` = `1b5a7f6c` "fix(erd): make shadow legacy recharge cohort null-safe (#1801)". The previous release `20260926185720_v4994` (`e5e284eb`) did not contain the migration directory. The migration shipped with an unrelated ERD deploy |
| Tables | `di_v0_shadow_runs`, `di_v0_shadow_intervals` exist |
| Rows | 0 runs, 0 intervals |
| Ever written | `pg_stat_user_tables`: `n_tup_ins=0`, `n_tup_upd=0`, `n_tup_del=0` for both tables; `pg_stat_database.stats_reset` is NULL (the counters were never reset) |
| Runtime / customer use | None: no caller in code (§1), no rows, no API (see `di-v0-shadow-no-public-api.spec.ts`) |

**Contradiction (DI-CONTRA-S2-PROD-MIGRATION-001, RESOLVED):** the C1D.6 evidence says "not applied to Production" and C1D.7 says "S2 migration remains unapplied". Both statements are historical and were correct only before the #1801 deploy. They are now amended in place with AMENDED BY notes; the original text is preserved.

**Required semantic separation (now authority):**

| Layer | State |
|-------|-------|
| A. Schema present in Production | **YES** (since 2026-09-26 23:46:11 UTC) |
| B. S4 runtime active | **NO** (no code exists) |
| C. Shadow runs executed | **NO** (0 inserts ever) |
| D. Customer-visible use | **NO** |

> The S2 migration was already applied in Production, but DI V0 remained dormant because no runtime caller existed and no shadow rows were written.

**Deployment implication (new invariant for S4):** any migration merged to `main` reaches Production on the next ordinary deploy of *any* feature, even with all runtime flags OFF. Migration safety is therefore a gate separate from, and earlier than, activation safety ([design/s4a/S4A_MIGRATION_SAFETY.md](../design/s4a/S4A_MIGRATION_SAFETY.md)).

**Stale-claim sweep:** `rg -i "not applied|unapplied|PRODUCTION_MIGRATION_EXECUTED|Production migration"` over `architecture/drivingintelligence/**`. Two contradicting statements were found and amended: C1D.6 evidence line 9 and C1D.7 report §non-effects. `CHANGE_LEDGER` "no production migration" (C1D.6B NON_EFFECTS) describes that slice's own actions and stays true. `CURRENT_STATE.md` S2 row is corrected.

## 3. P1-3 evidence — native event ingestion lifecycle

**Code path (legacy, `hardwareType === 'LTE_R1'`):** `DrivingNativeEventsIngestJobHandler` / `TripBehaviorEnrichmentService` → `LteR1BehaviorEnrichmentService.enrichTrip`:

1. `fetchEventDataSummary` returns `[]` on any error, so capability can be disallowed and the call returns `null`.
2. `fetchDrivingEventsPaginated`: `getVehicleJwt` missing returns `[]`; `fetchDrivingEventsChunkWithRetry` retries 3×, then **logs a warning and returns `[]`**. A provider failure is therefore indistinguishable from zero events.
3. Events are upserted and `behaviorEnrichedAt` is set in one transaction, even when (2) swallowed a failure.
4. `nativeQuerySucceeded = (enrichTrip result !== null)`, so it is `true` after a swallowed failure.
5. The V2 `NATIVE_EVENTS` job handler returns normally when the hardware is not LTE_R1 or when `enrichTrip` returned `null`, so V2 stage `COMPLETED` does not prove ingestion.

**Production (COMPLETED trips, `end_time` in the last 60 days; n=653, all `hardware_type=LTE_R1`):**

| Metric | Value |
|--------|-------|
| `behaviorEnrichedAt` set | 653/653; 0 unenriched after 24 h |
| `nativeQuerySucceeded` | true 651, false 2 |
| `behaviorEnrichedAt − endTime` | p50 21.8 min, p95 434.6, p99 2 277.7, max 9 265.4 (re-enrichment after late repair) |
| V2 `NATIVE_EVENTS` stage | COMPLETED 778 (p50 30.0, p95 412.7, p99 2 075.7, max 3 598.7 min); PENDING 2; FAILED 1 |
| Trips with ≥1 native event | 45 (114 events); last event created after end: p50 13.2, p99 112.4, max 113.5 min; events created after `behaviorEnrichedAt` + 5 min: 0; multi-batch trips: 1 |
| Unassigned TELEMETRY_EVENTS rows (60 d) | 0 |
| Boundary repairs after enrichment | 95; re-enriched after the repair 92, so **3 trips hold a readiness marker older than their current boundary** |

Per vehicle (60 d):

| Vehicle | DI family | trips | nq true | native events |
|---------|-----------|------:|--------:|--------------:|
| HMÜ C 215 | RUPTELA_R1 | 161 | 160 | 50 |
| KS FH 660E | API_SYNTHETIC (routed as `LTE_R1`, DI-CONTRA-HARDWARE-TYPE-INTEGRATION-001) | 51 | 51 | 0 |
| KS MS 661 | RUPTELA_R1 | 262 | 262 | 0 |
| KS MX 2024 | RUPTELA_R1 | 60 | 60 | 60 |
| WOB L 7503 | RUPTELA_R1 | 119 | 118 | 4 |

**Conclusion.** No durable native-ingest completion marker exists. `behaviorEnrichedAt`, `nativeQuerySucceeded` and V2 stage `COMPLETED` are all reachable after a swallowed provider failure. So "0 events" (262 KS MS 661 trips; 51 Tesla trips) **cannot be distinguished** from "native ingest failed or did not run". A legacy-marker-based `NO_EVENT` would be a false-negative risk. This is **DI-GAP-S4-NATIVE-READINESS-001**, and the S4A contract fails closed ([S4A_CHANNEL_OUTCOME_MODEL.md](../design/s4a/S4A_CHANNEL_OUTCOME_MODEL.md)).

## 4. P1-4 evidence — late boundary mutation

The source is `trip_repairs` with `status='APPLIED'` in the last 60 days, joined to `vehicle_trips` (n=208 applied mutations; 653 COMPLETED trips).

| Repair type | n | p50 | p95 | p99 | max (min after current `end_time`) |
|-------------|--:|----:|----:|----:|----:|
| ALL | 208 | 103.5 | 977.3 | 3 598.6 | 9 265.3 |
| INTRA_TRIP_GAP_SPLIT | 84 | 198.2 | 691.5 | 1 460.1 | 3 598.6 |
| MISSING_TRIP | 40 | 14.5 | 2 444.9 | 3 183.8 | 3 598.5 |
| PARTIAL_TRIP_BOUNDARY_EXTENSION | 11 | 212.3 | 7 415.9 | 8 895.4 | 9 265.3 |
| STALE_ONGOING | 73 | 100.2 | 122.1 | 125.3 | 127.0 |

REPAIRED-source trip creation after end: n=124, p50 105.0, p95 2 190.4, p99 3 344.5, max 3 598.5 min. Consecutive applied repairs on the same trip: 27 pairs, max gap 554.9 min (9.2 h), 0 gaps > 24 h. CANCELLED trips (60 d): 5. `mergeReopen` metadata: 0.

**Mutations still pending after a candidate delay:**

| Anchor | n | >10 m | >1 h | >6 h | >12 h | >16 h | >24 h | >48 h | >7 d |
|--------|--:|------:|-----:|-----:|------:|------:|------:|------:|-----:|
| `end_time` | 208 | 186 | 150 | 36 | 13 | 11 | 10 | 4 | 0 |
| `max(end_time, created_at)`, post-creation mutations | 157 | 150 | 131 | 22 | 3 | 3 | 2 | 2 | 0 |

**Correction of C1D.10:** the C1D.10 "boundary repair up to ~682 min" figure came from a 5-row sample. With 60 days of data, the maximum post-end mutation is **~6.4 days**. A fixed 16 h delay after `endTime` still leaves 11/208 mutations (1.7 % of trips) pending. This leads to the decision in [S4A_CONTRACT_DESIGN.md §5](../design/s4a/S4A_CONTRACT_DESIGN.md): a **24 h quiet period** anchored on `max(endTime, createdAt, latest applied repair)`, plus a **10-day drift horizon**.

## 5. Other verified facts used by the S4A design

- `SchedulerLeaderGuardService` + BullMQ are the established patterns; Prisma migrations are **not** wrapped in a transaction (repo note in `20260413230000_add_composite_indexes_batch_c`).
- Precedent tenant scope trigger on a new table: `vehicle_trip_route_artifact_scope_guard()` (`20260829140000_vehicle_trip_route_artifact`).
- S2 FKs are independent single-column FKs to `organizations` / `vehicles` / `vehicle_trips` (all `ON DELETE CASCADE`); tenant integrity is repository-only (`assertShadowRunTripIdentity`).
- S2 `createOrGetRun` catches a unique violation and re-reads. Inside a PostgreSQL transaction the violation aborts the transaction, so this is unusable for a fenced single-transaction write (DI-GAP-S2-IN-TX-CREATE-RACE-001).
- DIMO request categories/priorities permit `POST_TRIP_ENRICHMENT` + `BACKGROUND`. `DimoTelemetryService` reads the ALS context (`getDimoRequestContext()`), so an S4 wrapper `runWithDimoRequestContext` is sufficient without any DIMO runtime change.
- `STORAGE_DRIVER=local` in Production, so Postgres is the only durable shared store already backed up (`synqdrive-postgresql-backup.log`).
- Trip mutation paths: `finalizeTrip`, `finalizeRepairedTrip`, `reopenTripForMerge` (COMPLETED→ONGOING, `endTime=null`), `splitTripAtGap` (first trip `endTime` changes, second trip is new; **`rawDetectionMeta` overwritten**), `repairTripBoundariesWithAudit` (start/end/`dimoSegmentId`, `boundaryRepair` generation), `discardTrip` (CANCELLED, **`rawDetectionMeta` overwritten**), ops `repair-vehicle-trips-from-dimo.ts` (`deleteMany`). `VehicleTrip` has **no `updatedAt`**.

## 6. Non-effects

No code under `backend/src` or `frontend/src` changed except the SynqDrive Code views (documentation entries). No migration was created. No Production write, deploy, flag change, provider call, queue or worker. No customer effect.
