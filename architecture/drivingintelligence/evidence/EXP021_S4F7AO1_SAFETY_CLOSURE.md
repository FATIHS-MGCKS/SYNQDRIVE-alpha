# EXP-021 S4F-7AO.1 — Five-flag operator production safety closure

**Date (UTC):** 2026-10-09  
**PR:** #1943  
**Scope:** Close four P0 safety gaps in S4F-7AO operator tooling. **No** Production execution, deploy, or activation.

## P0 closures

| Gap | Closure |
|-----|---------|
| Runtime rollback | `s4f7ao_execute_rollback` restores env via `s4f4_restore_backend_env_atomic`, rolls back only replicas already restarted, `RECOVERY_PRESTATE` attestation via certified `s4f7j_prove_replica_staging_runtime`, post-verify GLOBAL KILLED + S4 zero + topology/budget; `ROLLBACK_RESULT=COMPLETE` only when file and replica state align |
| Production test isolation | `s4f7ao_assert_production_test_isolation` before wrapper preflight/live and transaction entry; blocks test/fixture/harness env on `/opt/synqdrive/shared/backend.env` |
| Explicit `DRY_RUN` | Missing `DRY_RUN` fails closed; only `DRY_RUN=0` reaches live mutation path after separate auth |
| Durable backup | `s4f7j_require_durable_backup_dir` before backup; no `/tmp` fallback outside harness |

## Regression evidence (local)

- `npm run test:di:s4f7ao:five-flag-operator` — **31** PASS (includes 7AO.1 negative cases)
- `npm run test:di:s4f7j:tiny-staging-wrapper` — **47** PASS
- `npm run test:di:s4f7v:fresh-tiny-staging-wrapper` — **131** PASS

## Operator pins reminder

Before any future Production run, re-resolve `DI_S4_TINY_STAGING_REQUIRED_SHA`, `REQUIRED_RELEASE_ID`, and `REQUIRED_PRE_ENV_SHA256` after APDS deploy.
