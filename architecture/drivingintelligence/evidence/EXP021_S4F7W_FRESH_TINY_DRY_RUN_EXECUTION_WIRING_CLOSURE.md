# EXP-021 S4F-7W — Fresh Tiny dry-run execution wiring closure

**Date (UTC):** 2026-10-07  
**Scope:** Close the post–S4F-7V integration gap in `di-v0-s4-stage-tiny-fresh-production.sh` dry-run orchestration. **No** Production mutation, restart, env write, DB write, deploy, migration, provider calls, or S4 activation.

## Post-merge integration gap (S4F-7V)

| Finding | Value |
|---------|--------|
| Pure `evaluateFreshTinyStagingGuards()` / fresh authority TS | **Correct** — no rewrite |
| Wrapper `DRY_RUN=1` called `validate-fresh-authority` only | **YES** — incomplete |
| Full live guard evidence populated before `guards` CLI | **NO** |
| `apply-mutation-dry` / `intended-delta` failures swallowed (`\|\| true`) | **YES** |
| Live shell transaction wiring | **Incomplete** (fail-closed retained) |

## S4F-7W change

- Added `s4f7w_live_preflight_readonly` in `lib/di-v0-s4-fresh-tiny-staging-production.lib.sh` — observes Production SHA, release, `backend.env` SHA256, GLOBAL/S4 DB proof, env prestate, Tiny vehicle DB proof, topology, budget/Redis, tool checkout SHA; exports `DI_S4F7V_*` + independent `DI_S4_TINY_STAGING_ACTUAL_*`.
- Dry-run order: tool SHA pin → staging pins → fresh inputs → live preflight → DB clock → `validate-fresh-authority` → final DB clock → `guards` (**must** `GUARDS_OK=YES`) → temp-file mutation simulation → `intended-delta` (fatal on failure).
- Live staging remains **fail-closed** (`LIVE_STAGING_SHELL_EXECUTION_READY=NO`).

## Authority / Gate 6

- S4F-7U sample authority remains **expired evidence only**.
- No S4F-7V tool SHA authorized for Production execution until sealed after merge.
- **Gate 6: NOT_SATISFIED**
- **TINY_ACTIVATION_READY: NO**

## Validation

`npm run test:di:s4f7v:fresh-tiny-staging-wrapper` — **80** cases (incl. **27** shell orchestration negatives/positives).

## Next action

Merge after exact-head CI → seal `EXPECTED_FRESH_TINY_STAGING_TOOL_SHA` at S4F-7W head → generate fresh ≤900s authority → **Production `DRY_RUN=1` only**.
