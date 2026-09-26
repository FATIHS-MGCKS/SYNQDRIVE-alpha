# M3.3F F1 — D3 materialization runtime foundation

**Status:** **COMPLETE ON MAIN** (merged PR **#1787**).  
**PR head:** `ad2a933db78153e8e36bce0005ec3e73c7c5168c`  
**Merge SHA:** `2b54a357854c9d44f638ee857f72936967c04992`  
**Starting main (F0):** `6d8198fa1d5b8dbf915b7676d86269a0595ae756` (M3.3F F0 merged PR #1784).  
**Mode:** Default OFF — no production activation, no scheduler, no backfill.

## Scope delivered in F1

| Item | Implementation |
|------|----------------|
| D3 flag | `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED` + `isBatteryV2LongitudinalProfileMaterializationEnabled()` (default OFF) |
| Session limit | `BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT` via `getBatteryV2LongitudinalMaterializationSessionLimit()` — capped by `LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS` (100) |
| Nest DI | `BatteryGeneralizedEvidenceModule` registers repository, raw service (factory), gated runtime facade |
| Gated facade | `LongitudinalProfileMaterializationRuntimeService` — flag OFF → `{ status: 'SKIPPED_FLAG_OFF' }` with zero D1/D2/repo/INSERT |
| D3 metrics | `synqdrive_battery_longitudinal_profile_materialization_attempts_total{outcome}`; `synqdrive_battery_longitudinal_profile_materialization_duration_seconds{outcome}` |
| D4 metric helpers | `synqdrive_battery_longitudinal_profile_integrity_inspection_total{disposition}`; `synqdrive_battery_longitudinal_profile_self_integrity_failure_total` — **no D4 runtime invocation** |
| Ops entry | `npm run battery:longitudinal-profile:materialize` → `scripts/ops/battery-longitudinal-profile-materialize.ts` (explicit org + vehicle; uses facade) |

## Explicit non-effects (F1)

- `D3_SCHEDULED_RECONCILIATION_IMPLEMENTED=NO`
- `D3_C3_HOOK_ADDED=NO`
- `D3_AUTOMATIC_RUNTIME_CALL_SITES=0` (ops CLI only when invoked manually)
- `D4_RUNTIME_REACHABLE=NO`
- `E3_RUNTIME_REACHABLE=NO`
- C3 flag unchanged; scientific D3 stack unchanged (D1→D2→fingerprint→INSERT ON CONFLICT)

## Module export boundary

- **Exported:** `LongitudinalProfileMaterializationRuntimeService`
- **Not exported:** `LongitudinalProfileMaterializationService`, `LongitudinalProfileMaterializationRepository`

## Idempotency observability

Prometheus idempotency ratio derived at query time:

`rate(EXISTING) / rate(CREATED + EXISTING)` — no in-process ratio gauge in F1.

## Revisions per vehicle

`REVISIONS_PER_VEHICLE_PROMETHEUS_METRIC=DEFERRED_TO_F5_AGGREGATE_ANALYSIS` (no vehicleId labels).

## F1.1 pre-merge hardening (same PR)

- Ops CLI uses `NestFactory.createApplicationContext(LongitudinalProfileMaterializationOpsModule.forOps())` with `ConfigModule.forRoot` + `loadBackendEnvIntoProcessEnv` (no `@nestjs/testing`).
- Strict positive-integer grammar for env/CLI session limits (`^[1-9][0-9]*$`, `Number.isSafeInteger`); malformed values fail closed.
- Ops CLI uses `runBatteryLongitudinalProfileMaterializeCli` + `process.exitCode` (no `process.exit` after Nest bootstrap) so Prisma/context always closes in `finally`.


Focused F1 unit tests: config flag matrix, session limit authority, gated facade outcomes, module exports, ops runner flag-off path, metric helper bounded labels.

Regression: existing D1/D2/D3/D4/E1/E3/C3 suites unchanged (no golden changes).

## Next

**F2:** flag-OFF production deploy/smoke — **PASS** (`research/M3_3F_F2_FLAG_OFF_PRODUCTION_DEPLOY_2026-09-26.md`).  
**F3:** controlled C3 shadow activation (authorized separately; not executed in F2).
