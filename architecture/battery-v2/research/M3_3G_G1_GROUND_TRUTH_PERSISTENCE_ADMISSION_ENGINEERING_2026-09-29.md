# M3.3G G1 — Ground-truth persistence & admission engineering

**Date:** 2026-09-29 (G1.1 correctness hardening on PR **#1837**)  
**Baseline:** G0 `M3_3G_ARCHITECTURE_RESULT=PASS` on main (PR **#1836**)  
**Storage:** **OPTION_C** — scientific `BatteryGroundTruthEvent` + append-only `BatteryGroundTruthRevocation`

## G1.1 correctness hardening (PR #1837)

```text
REVOCATION_DB_TRANSACTION_ATOMIC=YES
SUPERSESSION_DB_TRANSACTION_ATOMIC=YES
ONE_ACTIVE_SUCCESSOR_PER_PRIOR=YES
REVOKED_GT_AUTO_RESURRECTION=NO
SUPERSEDED_GT_AUTO_RESURRECTION=NO
SOURCE_BINDING_FAIL_CLOSED=YES
FINGERPRINT_FREEZES_NUMERIC_SOURCE_CONTENT=YES
GT_PARENT_DELETE_POLICY=RESTRICT_ON_ORG_AND_VEHICLE
SCIENTIFIC_PAYLOAD_IMMUTABLE=YES
LIFECYCLE_STATUS_MUTABLE=YES
LIFECYCLE_TRANSITIONS_HAVE_APPEND_ONLY_EVIDENCE=YES
```

- Repository methods accept transaction client (`tx`) for atomic revoke/supersede.
- Supersession persists replacement **inside** the same transaction that marks prior `SUPERSEDED` (with `FOR UPDATE` lock).
- Partial unique index `battery_ground_truth_one_confirmed_successor_per_prior` enforces one active successor.
- Prior `REVOKED`/`SUPERSEDED` fingerprint cannot re-admit via `admitAndPersist` (typed reasons).
- Source resolver requires bound org/vehicle on service events, documents, and evidence; cross-pointer provenance checks.
- Fingerprint `M3_3G_GROUND_TRUTH_FINGERPRINT_V1` hashes full admitted scientific source identity (including numeric fields) without duplicating columns on GT rows.
- GT parent FKs: `ON DELETE RESTRICT` for `organization_id` / `vehicle_id` (no silent cascade delete).

## G1 scope (delivered)

| Item | Status |
|------|--------|
| Prisma model + additive migration | **YES** |
| Admission projector `M3_3G_GROUND_TRUTH_ADMISSION_V1` | **YES** |
| Fingerprint `M3_3G_GROUND_TRUTH_FINGERPRINT_V1` | **YES** |
| Tenant source resolver (fail-closed) | **YES** |
| Internal `BatteryGroundTruthService.admitAndPersist` | **YES** (not wired to document/UI hooks) |
| Manual service-event `organizationId` on create | **YES** |
| Legacy `organization_id` backfill SQL (service events only) | **YES** |
| Read-only inspect CLI | **`npm run battery:ground-truth:inspect`** |
| PostgreSQL CI suite | **`test:battery:v2:ground-truth:postgres:ci`** (embedded in longitudinal Postgres CI) |

## Explicit non-effects (preserved)

```text
RUNTIME_EMISSION_WIRED=NO
F5_REPORT_GT_LINKAGE=NO
E3_RUNTIME_ACTIVATED=NO
PRODUCTION_DEPLOY=NO
PRODUCTION_GT_WRITES=NO
NO_GROUND_TRUTH_BACKFILL=YES
GT_ROWS_CREATED_BY_MIGRATION=0
D3_SUSTAINED_SHADOW=UNCHANGED
NAT-008_INFRASTRUCTURE_COMPLETE=NO  # requires G2/G3 emission + F5 flags
NAT-009_INFRASTRUCTURE_COMPLETE=NO
```

## Append-only model

```text
GROUND_TRUTH_APPEND_ONLY_MODEL=
  Scientific payload fields on BatteryGroundTruthEvent are write-once at insert;
  LIFECYCLE_STATUS_MUTABLE=YES for verificationStatus only via explicit supersede/revoke;
  LIFECYCLE_TRANSITIONS_HAVE_APPEND_ONLY_EVIDENCE=YES (BatteryGroundTruthRevocation + supersession chain);
  corrections use new CONFIRMED row + supersedesGroundTruthEventId;
  no silent payload rewrite.
```

## Revocation

```text
REVOCATION_MODEL=
  BatteryGroundTruthRevocation (reasonCode, revokedAt, revokedByUserId);
  paired verificationStatus=REVOKED on target event;
  no physical delete.
```

## Idempotency

```text
GROUND_TRUTH_IDEMPOTENCY_KEY=organizationId+sourceContentFingerprint@CONFIRMED
```

Partial unique index: `battery_ground_truth_events_active_fingerprint_key` (`verification_status = CONFIRMED`).

## Tenant / service events

```text
SERVICE_EVENT_ORG_NOT_NULL_CHANGE=DEFER_SCHEMA_CONSTRAINT
NEW_MANUAL_SERVICE_EVENT_ORG_POPULATED=YES
LEGACY_SERVICE_EVENT_ORG_BACKFILL_DESIGNED=YES
```

Brake/manual paths may still omit `organizationId` on some `vehicleServiceEvent.create` calls — column remains nullable until broader closure.

## Code map

| Path | Role |
|------|------|
| `backend/prisma/schema.prisma` | `BatteryGroundTruthEvent`, enums, revocation |
| `backend/prisma/migrations/20260929120000_battery_ground_truth_events/` | DDL + service-event org backfill |
| `backend/src/.../ground-truth/*` | Admission, fingerprint, repository, service, inspection |
| `backend/scripts/ops/battery-ground-truth-inspect.ts` | Read-only inspection |
| `backend/scripts/test/battery-ground-truth-postgres-ci.sh` | CI gate |

## Next

**M3.3G G2** — confirmed capture + document apply emission (no automatic emission in G1).
