# EXP-021 S4F-7AO — Minimal five-flag Tiny activation operator (engineering)

**Date (UTC):** 2026-10-09  
**Scope:** Operator tooling only — enable exactly five S4 env flags ON (`NATIVE` remains OFF), preserve three staged Tiny keys, enforce GLOBAL **KILLED** (no DB kill mutation). **No** Production execution in this slice.

## Target configuration (Phase 1 env only)

| Key | Value |
|-----|--------|
| `DI_V0_S4_MASTER_ENABLED` | `true` |
| `DI_V0_S4_DISCOVERY_ENABLED` | `true` |
| `DI_V0_S4_WORKER_ENABLED` | `true` |
| `DI_V0_S4_POSITION_ENABLED` | `true` |
| `DI_V0_S4_R1_ENABLED` | `true` |
| `DI_V0_S4_NATIVE_ENABLED` | `false` |

**Preserved (unchanged):** `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE`, `DI_V0_S4_ORGANIZATION_ALLOWLIST`, `DI_V0_S4_VEHICLE_ALLOWLIST`  
**Tenant pins:** org `faa710c9-6d91-4079-a7d5-91fdccdec14a`, vehicle `c10351f8-b6a2-4258-947f-631aeaa6d359`

## Operator entrypoints

| Path | Role |
|------|------|
| `backend/scripts/ops/di-v0-s4-enable-tiny-five-flags-production.sh` | Wrapper (`DRY_RUN=1` preflight + intended delta; live requires separate auth) |
| `backend/scripts/ops/di-v0-s4-five-flag-tiny-activation-production/*` | TypeScript guards, mutation, attestation proofs |
| `backend/scripts/ops/lib/di-v0-s4-five-flag-tiny-activation-*.lib.sh` | Transaction, CLI bridge, A→B restart + attestation |

Reuses S4F-7J preflight helpers (`s4f7j_*`) without modifying certified S4F-7Y live-staging operator scripts.

## Authorization contract (fail-closed)

- `DI_S4_FIVE_FLAG_TINY_ACTIVATION_ACK=YES`
- `DI_S4F7AO_FIVE_FLAG_AUTHORIZED=YES` (distinct from Gate 6)
- Production pins: `DI_S4_TINY_STAGING_REQUIRED_SHA`, `REQUIRED_RELEASE_ID`, `REQUIRED_PRE_ENV_SHA256`, `EXPECTED_GLOBAL_STATE=KILLED`

`EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED` until a future human Production slice grants execution.

## Safety invariants

| Invariant | Enforcement |
|-----------|-------------|
| GLOBAL DB kill row | Read-only; must stay **KILLED** pre/post |
| S4 DB activation | **No** control-row writes; S4 persistence zero pre/post |
| Provider I/O | Config-only mutation; no DIMO calls in operator |
| Effective discovery/worker | **OFF** while GLOBAL **KILLED** (runtime enablement evaluation) |
| Mutation count | Exactly **5** env keys |

## Engineering validation

`npm run test:di:s4f7ao:five-flag-operator` — **24** cases (guards, mutation, attestation, dry-run, harness A→B, rollback failures).  
`npm run test:di:s4f7j:tiny-staging-wrapper` — **47** regression PASS after shared `s4f7j_resolve_*` lib helpers.

## Execution status (this slice)

| Field | Value |
|-------|--------|
| `PRODUCTION_MUTATION` | **NO** |
| `GATE_6` | **NOT_GRANTED** |
| `S4_ACTIVATION` | **NO** |
| `FIVE_FLAG_OPERATOR_READY` | **YES** (engineering + tests; not Production-certified) |

## Next safe action

Human Production authorization + pinned pre-env SHA (`84fed895…` post–S4F-7AM.1) + detached tool checkout review → single authorized `DRY_RUN=0` dispatch (out of scope here).
