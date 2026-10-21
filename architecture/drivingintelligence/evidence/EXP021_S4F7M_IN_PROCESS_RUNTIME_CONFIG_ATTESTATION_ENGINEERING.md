# EXP-021 S4F-7M — In-process S4 runtime config attestation (engineering)

**Date (UTC):** 2026-10-02  
**Scope:** Engineering-only. **No** Production mutation, deploy, env change, or S4 activation.

## Root-cause architecture (verified from repository)

| Claim | Evidence |
|-------|----------|
| `backend/.env` → shared `backend.env` at deploy | `backend/scripts/ops/vps-deploy-release.sh` (`ln -sfn /opt/synqdrive/shared/backend.env "$RELEASE_DIR/backend/.env"`) |
| Nest loads dotenv via `ConfigModule.forRoot({ isGlobal: true, ... })` | `backend/src/app.module.ts` |
| PM2 ecosystem supplies only replica-specific vars (`PORT`, `INSTANCE_ID`) | `backend/scripts/ops/pm2.production-ecosystem.config.cjs` |
| `/proc/<pid>/environ` is **not** authoritative for dotenv-loaded keys | S4F-7L rollback after healthy restart + file-level staging success |

`PROC_ENV_IS_AUTHORITATIVE_FOR_DOTENV_LOADED_KEYS=NO`

## Implementation

| Item | Location |
|------|----------|
| Pure canonicalization + SHA-256 fingerprint + `PRESTATE`/`STAGED`/`OTHER` | `backend/src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation.ts` |
| Prometheus gauge (bounded labels) | `synqdrive_di_v0_s4_runtime_config_attestation_info{fingerprint,state,contract_version}` |
| Registration | `DiV0S4RuntimeConfigAttestationService` in `DiV0S4RuntimeModule` (reads `process.env` once at `onModuleInit`) |
| Metrics path | Existing authenticated `GET /api/v1/metrics` (`MetricsAuthGuard` + bearer token) |
| Ops parser | `di-v0-s4-runtime-config-attestation-metric-parse.ts` + S4F-7J wrapper `runtime-attestation-proof` |

### Expected fingerprints (computed, not hand-entered)

| State | SHA-256 |
|-------|---------|
| PRESTATE | `b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d` |
| STAGED | `8db5323331e365a1eb9d598b238b5d2ce99f1592de42bac98cde98e34c2dd8cc` |

## S4F-7J wrapper migration

| Before | After |
|--------|-------|
| `/proc/<pid>/environ` filtered proof | Authenticated per-replica metrics attestation |
| `PRIMARY_STAGING` | `state=STAGED` + fingerprint match |
| `RECOVERY_PRESTATE` | `state=PRESTATE` + fingerprint match |

`FILE_AND_RUNTIME_DUAL_AUTHORITY=YES` — semantic `backend.env` diff retained; runtime attestation added.

## S4F-7L historical classification

| Field | Value |
|-------|--------|
| `S4F7L_FILE_STAGING_SUCCEEDED_TRANSIENTLY` | YES |
| `S4F7L_REPLICA_A_HEALTHY_AFTER_RESTART` | YES |
| `S4F7L_PROC_ENV_ATTESTATION_FAILED` | YES |
| `S4F7L_ACTUAL_NEST_RUNTIME_CONFIG_CONFIRMED` | UNKNOWN |
| `S4F7L_ROLLBACK_COMPLETE` | YES |

## Deployment classification

| Field | Value |
|-------|--------|
| `RUNTIME_CODE_CHANGE` | YES |
| `PRODUCTION_DEPLOY_REQUIRED_BEFORE_ATTESTATION_USE` | YES |
| `DATABASE_MIGRATION_REQUIRED` | NO |
| `ENV_CHANGE_REQUIRED_FOR_ATTESTATION_FEATURE` | NO |

## Validation (engineering)

- `npm run test:di:s4f7m:runtime-attestation` — **36** cases (unit + integration)
- `npm run test:di:s4f7j:tiny-staging-wrapper` — **47** PASS
- `test:di:s4a` … `test:di:s4f` unit suites — PASS
- `npm run test:di:s4a:postgres` — **92** PASS
- `npm run build` — **24** TypeScript errors (Battery/Prisma hv-h4); **identical count** on starting main `e2229c402fd8ba0b4f96ee221aba180f08f31a66`
- `bash architecture/scripts/validate-module-registry.sh` — PASS
- `bash architecture/drivingintelligence/scripts/validate-docs.sh` — PASS
- `bash architecture/drivingintelligence/scripts/validate-graph.sh` — PASS
