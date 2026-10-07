# EXP-021 S4F-7V — Fresh fingerprint Tiny staging tooling (engineering)

**Date (UTC):** 2026-10-07  
**Scope:** Operator tooling only — fresh-authority Tiny config staging path distinct from historical S4F-7J. **No** Production execution, env mutation, restart, DB write, deploy, migrations, GLOBAL/Tiny/S4 activation, or provider calls.

## Repository anchor

| Field | Value |
|-------|--------|
| Expected `main` | `56e6d99e742b8e1c3113583fe939548439a00436` |
| S4F-7U merge ancestry | `a9d27d916aefd75434b58565a2278b14f898a6a9` |
| Main drift at engineering start | **NONE** (0 commits) |

## Historical vs fresh paths

| Path | Role |
|------|------|
| `backend/scripts/ops/di-v0-s4-stage-tiny-production.sh` | **S4F-7J** frozen STAGED cutoff authority — **unchanged** |
| `backend/scripts/ops/di-v0-s4-stage-tiny-fresh-production.sh` | **S4F-7V** fresh cutoff + `OTHER` + exact fingerprint |
| `backend/scripts/ops/lib/di-v0-s4-fresh-tiny-staging-production.lib.sh` | Tool checkout root + `EXPECTED_FRESH_TINY_STAGING_TOOL_SHA` pin |
| `backend/scripts/ops/di-v0-s4-fresh-tiny-staging-production/*` | TypeScript authority, guards, mutation, metric proofs, tests |

`HISTORICAL_S4F7J_BEHAVIOR_PRESERVED=YES`  
`HISTORICAL_FROZEN_CUTOFF_AUTHORITY_CHANGED=NO`  
`FRESH_STAGING_USES_SEPARATE_EXPLICIT_PATH=YES`

## Fresh authority contract

Required env (fail-closed if missing):

- `DI_S4_TINY_FRESH_NOT_BEFORE` — canonical UTC `Z`, ms precision, not historical `2026-10-02T05:55:28.839Z`, age ≤ **900** s vs PostgreSQL `clock_timestamp()`
- `DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT` — lowercase SHA-256 hex; must match internal nine-key derivation
- `DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST` — exactly `faa710c9-6d91-4079-a7d5-91fdccdec14a`
- `DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST` — exactly `c10351f8-b6a2-4258-947f-631aeaa6d359`

Reused Production identity pins (unchanged from S4F-7J):  
`DI_S4_TINY_STAGING_REQUIRED_SHA`, `DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID`, `DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256`, `DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE`, `DI_S4_TINY_STAGING_ACK`.

`EXPECTED_FRESH_TINY_STAGING_TOOL_SHA` — exact tooling checkout pin (sealed after merge; not invented in this PR).

## S4F-7U sample authority (evidence only)

| Field | Value |
|-------|--------|
| NOT_BEFORE | `2026-10-06T18:33:26.610Z` |
| FINGERPRINT | `9abb1a57cd25a5937bb033f43f90e98a4f5eab58a66147f977c2c2665049474a` |
| EXPIRY | `2026-10-06T18:48:26.610Z` |

**Not** embedded as executable default. Future runs require a newly generated ≤900 s authority.

## Runtime attestation (primary success)

After future staging (not executed here):

- `contract_version=v1`
- `state=OTHER` (not STAGED for fresh cutoff)
- `fingerprint=<exact internally verified fresh fingerprint>`

Rollback recovery attestation: **PRESTATE** fingerprint `b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d`.

## Mutation boundary

Exactly three keys: `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE`, `DI_V0_S4_ORGANIZATION_ALLOWLIST`, `DI_V0_S4_VEHICLE_ALLOWLIST`. All six S4 enable flags remain **OFF**. GLOBAL remains **KILLED**. No DB writes in staging transaction.

## Engineering execution

| Field | Value |
|-------|--------|
| `DRY_RUN=1` | Read-only validation + intended three-key delta preview |
| Live mutation | **Fail-closed** (`LIVE_MUTATION_NOT_AUTHORIZED_IN_ENGINEERING_SLICE=YES`) |
| `PRODUCTION_MUTATION_OCCURRED` | **NO** |
| Gate 6 | **NOT_SATISFIED** |
| `TINY_ACTIVATION_READY` | **NO** |

## Validation

`npm run test:di:s4f7v:fresh-tiny-staging-wrapper` — **54** cases (fresh authority, guards, metrics, transaction orchestration, dry-run wrapper fixture).  
`npm run test:di:s4f7j:tiny-staging-wrapper` — **47** regression PASS.

## Next action

Merge after exact-head CI → seal `EXPECTED_FRESH_TINY_STAGING_TOOL_SHA` → generate just-in-time fresh authority → **Production dry-run only** (`DRY_RUN=1`).
