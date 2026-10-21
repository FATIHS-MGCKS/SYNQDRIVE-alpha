# M3.3A.1 — Pre-merge semantic + concurrency hardening

**Date:** `2026-09-21`  
**Applies to:** PR #1709 (M3.3A foundation)  
**Mode:** pre-merge hardening — flag remains **OFF**, no deploy

## Summary

| Area | Fix |
|------|-----|
| REST_WAKE semantics | Removed 60s time-only promotion; added **`PARKED_REST_CANDIDATE`**; **`REST_WAKE_VOLTAGE`** requires `restWakeCadenceQualified` or `restWakeSourceSemantic` (both false until M3.3B) |
| `actualRestAgeMs` | **`computeActualRestAgeMs`** — provider `PROVIDER_FIELD_TIMESTAMP` only; no ingest wall clock |
| State provenance | `stateObservedAt` / `stateTimestampSource` from **VLS shared snapshot**, not LV field |
| Anchor link | ENGINE_OFF observation linked to session with **`actualRestAgeMs=0`** when provider-qualified |
| Late trip association | **`BATTERY_LV_REST_SESSION_OPEN`** hook + reconciliation repair; **ENDED** sessions eligible within lookback |
| Active session | Partial unique index + **`claimOrCreateActiveRestSession`** (advisory lock + reuse) |
| Valid rest count | `restObservationCount` vs **`validRestObservationCount`** (alignment + provider age) |

## PR governance (#1708 / #1709)

- #1708: docs-only audit (3 architecture files).
- #1709: full implementation; **overlaps** audit files until #1708 merges to `main`.
- **Recommended:** merge #1708 → rebase #1709 onto `main` so #1709 diff is implementation-only.

## DB

Migration `20260921140000_battery_m3_3a_1_hardening`:
- enum `PARKED_REST_CANDIDATE`
- column `rest_observation_count`
- partial unique index `battery_rest_session_one_active_per_vehicle`

## Tests

- Unit: `generalized-evidence/*.spec.ts` (excluding integration)
- PostgreSQL: `BATTERY_V2_GENERALIZED_EVIDENCE_INTEGRATION=1` → `generalized-evidence.integration.spec.ts`

## FINAL MACHINE-READABLE BLOCK

```
M3_3A_1_HARDENING_RESULT=COMPLETE

SUB_8H_GENERIC_SAMPLE_CAN_BE_REST_WAKE_BY_TIME_ALONE=NO
REST_WAKE_REQUIRES_CADENCE_OR_SOURCE_SEMANTIC=YES

ACTUAL_REST_AGE_FROM_PROVIDER_SIGNAL_TIME_ONLY=YES
INGEST_TIME_CAN_CREATE_AUTHORITATIVE_REST_AGE=NO
ACTUAL_REST_AGE_IS_AUTHORITY_WHEN_PROVIDER_TIME_QUALIFIED=YES

STATE_TIMESTAMP_DOES_NOT_INHERIT_LV_TIMESTAMP=YES
M3_2B_PROVENANCE_SEMANTICS_PRESERVED=YES

ANCHOR_OBSERVATION_LINKED_TO_SESSION=YES
ANCHOR_ACTUAL_REST_AGE_MS_ZERO=YES (when provider-qualified)

LATE_TRIP_ASSOCIATION_REQUIRES_FUTURE_LV_EVENT=NO
ENDED_SESSION_LATE_ASSOCIATION_SUPPORTED=YES

MAX_ACTIVE_REST_SESSIONS_PER_VEHICLE=1
DB_LEVEL_ACTIVE_SESSION_PROTECTION=YES (partial unique index + transactional claim)
LOGICAL_MULTI_REPLICA_SESSION_DUPLICATION_POSSIBLE=NO

MISALIGNED_REST_EVIDENCE_COUNTS_AS_VALID=NO

POSTGRES_MIGRATION_TEST=PASS (db push + integration A/B)
POSTGRES_CONCURRENCY_TEST=PASS (integration C/D/E/F)
POSTGRES_LATE_ASSOCIATION_TEST=PASS (integration H/I)

AUTHORITATIVE_BATTERY_BEHAVIOR_CHANGED=NO
PRODUCTION_CHANGED=NO
```
