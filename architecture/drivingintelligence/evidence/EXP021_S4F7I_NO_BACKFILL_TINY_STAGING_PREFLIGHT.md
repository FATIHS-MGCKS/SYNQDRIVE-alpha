# EXP-021 S4F-7I — Production NO_BACKFILL cutoff + Tiny allowlist staging preflight

**Date (UTC):** 2026-10-02  
**Scope:** Read-only Production preflight + staging packet design. **No** Production mutation.

## Repository / Production anchors

| Field | Value |
|-------|--------|
| `CURRENT_MAIN_SHA` | `dcd5314b2603bf5ab7eb77c31b4cf24855f55667` |
| `CURRENT_PRODUCTION_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261002014651_v4994` |
| `PRODUCTION_SHA_EXPECTED_MATCH` | YES |
| `PRODUCTION_RELEASE_EXPECTED_MATCH` | YES |

## GLOBAL kill authority (mandatory)

| Field | Value |
|-------|--------|
| `GLOBAL_ROW_COUNT` | 1 |
| `GLOBAL_KILL_STATE` | KILLED |
| `EFFECTIVE_KILL_STATE` | KILLED |

## S4 dormancy (Production `backend.env`)

No `DI_V0_S4_*` keys present (grep); boolean flags default **OFF**. `DIMO_GLOBAL_BUDGET_ENABLED` present (S4F-6 rollout).

| Check | Result |
|-------|--------|
| `ALL_S4_ENABLE_FLAGS_FALSE` | YES |
| `ORG_ALLOWLIST_EFFECTIVE_NONE` | YES |
| `VEHICLE_ALLOWLIST_EFFECTIVE_NONE` | YES |
| `PRODUCTION_NOT_BEFORE_STATE` | MISSING |

## Tiny vehicle revalidation (Production DB)

| Field | Value |
|-------|--------|
| `TINY_ORGANIZATION_ID` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `TINY_VEHICLE_ID` | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| `TINY_VEHICLE_LABEL` | `KS MS 661` / Audi A4 |
| `TINY_SOURCE` | `RUPTELA_R1` (registry `hardware_type=LTE_R1`) |
| `TINY_VEHICLE_EXISTS` | YES |
| `TINY_VEHICLE_BELONGS_TO_ORG` | YES |
| `TINY_REGISTRY_LIFECYCLE` | ACTIVE |
| `TINY_VEHICLE_STATUS` | AVAILABLE |
| `TINY_PROVIDER_LINK_ACTIVE` | YES (`DIMO` / `DIMO`, `is_active=true`) |
| `TINY_CROSS_TENANT_MISMATCH` | NO |

## Historical trip exposure (Tiny-specific)

| Metric | Value |
|--------|--------|
| `TINY_HISTORICAL_COMPLETED_TRIP_COUNT` | 510 |
| `EARLIEST_HISTORICAL_TRIP_END_TIME` | `2026-04-11T05:56:54.746Z` |
| `LATEST_HISTORICAL_TRIP_END_TIME` | `2026-10-02T05:00:52.833Z` |
| Hypothetical discovery-eligible (quiet period, no NOT_BEFORE, no existing PRIMARY WI) | **499** |
| Existing S4 work/evidence for vehicle | **0** |

## Deployed S4B NOT_BEFORE semantics (`ee958854…`)

Production deployed `di-v0-s4b-discovery.service.ts` matches repository:

| Field | Value |
|-------|--------|
| `NOT_BEFORE_COMPARISON_OPERATOR` | `>=` (inclusive lower bound on `vehicle_trips.end_time`) |
| `NOT_BEFORE_APPLIES_TO_FIELD` | `vehicle_trips.end_time` (direct predicate; settlement anchor uses separate `GREATEST(end_time, created_at, repairs)` for quiet-period only) |
| `NOT_BEFORE_TIMEZONE_AUTHORITY` | UTC (`AT TIME ZONE 'UTC'` on timestamp columns; env value parsed as canonical `Z`) |
| `NOT_BEFORE_REQUIRED_CANONICAL_FORMAT` | `YYYY-MM-DDTHH:mm:ss.SSSZ` |

Parser authority: `di-v0-s4b-discovery-containment.ts` (`DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_CANONICAL`).

## Proposed cutoff (not written to Production)

| Field | Value |
|-------|--------|
| `CUTOFF_AUTHORITY_SOURCE` | PostgreSQL `clock_timestamp()` at preflight capture (UTC) |
| `PROPOSED_NOT_BEFORE_UTC` | `2026-10-02T05:55:28.839Z` |
| `PROPOSED_NOT_BEFORE_CANONICAL` | `2026-10-02T05:55:28.839Z` |
| Trips with `end_time >= cutoff` at capture | 0 |
| Trips with `end_time < cutoff` at capture | 510 |
| `NO_HISTORICAL_PRE_CUTOFF_TRIP_CAN_BE_DISCOVERED` | YES (when this canonical value is staged) |
| `PRE_CUTOFF_TRIPS_ALLOWED` | NO |
| `POST_CUTOFF_PRE_ACTIVATION_TRIPS_ALLOWED` | YES |

## Proposed allowlists (parse-only; not applied)

| Env key | Proposed value |
|---------|----------------|
| `DI_V0_S4_ORGANIZATION_ALLOWLIST` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `DI_V0_S4_VEHICLE_ALLOWLIST` | `c10351f8-b6a2-4258-947f-631aeaa6d359` |

| Check | Result |
|-------|--------|
| `ORG_ALLOWLIST_PARSE_COUNT` | 1 |
| `VEHICLE_ALLOWLIST_PARSE_COUNT` | 1 |
| `WILDCARD_PRESENT` | NO |
| `MALFORMED_ALLOWLIST_ENTRY_PRESENT` | NO |

## Channel / activation staging plan

| Field | Recommendation |
|-------|----------------|
| `INTENDED_TINY_CHANNEL_SET` | POSITION + R1_OBD |
| `PRE_ACTIVATION_POSITION_STAGE_REQUIRED` | NO (keep OFF until activation sequence) |
| `PRE_ACTIVATION_R1_STAGE_REQUIRED` | NO |
| `PRE_ACTIVATION_NATIVE_STAGE_REQUIRED` | NO |
| `NATIVE_REQUIRED` | NO |

Preferred **future staged** env (config-only, **not applied**):

- All six S4 enable flags: **OFF**
- Allowlists + NOT_BEFORE: as proposed above
- `GLOBAL`: **KILLED** (unchanged)

## Control-plane proof (code evaluation)

With proposed allowlists + NOT_BEFORE present but **MASTER=OFF**, **DISCOVERY=OFF**, **WORKER=OFF**, **GLOBAL=KILLED**:

| Check | Result |
|-------|--------|
| `DISCOVERY_EFFECTIVE_ENABLED_AFTER_PROPOSED_STAGING` | NO (`MASTER`, `ROLE_FLAG`, `POSITION`, `DB_NOT_KILLED`) |
| `WORKER_EFFECTIVE_ENABLED_AFTER_PROPOSED_STAGING` | NO |
| `MAINTENANCE_EFFECTIVE_ENABLED_AFTER_PROPOSED_STAGING` | NO |

Allowlist / NOT_BEFORE presence alone does not satisfy `isDiV0S4DiscoveryConfigured` until MASTER+DISCOVERY+POSITION+valid containment+allowlists are enabled.

## S4 persistence (Production)

All counts **0** (unchanged).

## Future config-only mutation packet (do not execute)

```
DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=2026-10-02T05:55:28.839Z
DI_V0_S4_ORGANIZATION_ALLOWLIST=faa710c9-6d91-4079-a7d5-91fdccdec14a
DI_V0_S4_VEHICLE_ALLOWLIST=c10351f8-b6a2-4258-947f-631aeaa6d359
```

| Field | Value |
|-------|--------|
| `FUTURE_STAGING_ENV_MUTATION_KEY_COUNT` | 3 |
| `FUTURE_STAGING_ENABLE_FLAG_MUTATION_COUNT` | 0 |
| `STAGING_REQUIRES_PM2_RESTART` | YES (Nest/backend reads env at process start) |
| `FUTURE_STAGING_ROLLBACK_PRESERVES_GLOBAL_KILLED` | YES (restore pre-staging `backend.env` bytes; no DB rollback) |

## Tiny gate (unchanged)

| Field | Value |
|-------|--------|
| `EXPLICIT_OPERATOR_AUTHORIZATION_GATE` | NOT_SATISFIED |
| `FROZEN_TINY_GATE_SATISFIED_COUNT` | 5 |
| `FROZEN_TINY_GATE_TOTAL` | 6 |
| `TINY_ACTIVATION_READY` | NO |

## Decision

**`NO_BACKFILL_TINY_STAGING_READINESS=PASS`**

**`NEXT_ACTION`:** `WAIT_CI_AND_MERGE_EVIDENCE_THEN_REQUEST_SEPARATE_AUTHORIZATION_FOR_CONFIG_ONLY_TINY_STAGING_WITH_GLOBAL_KILLED`
