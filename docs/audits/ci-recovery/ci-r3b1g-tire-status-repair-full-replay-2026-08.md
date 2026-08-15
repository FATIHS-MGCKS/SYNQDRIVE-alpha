# CI-R3B1G — Tire Status Predecessor Repair & Full Replay

**Phase:** R3B1G  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Branch:** `fix/ci-r3b1g-tire-status-full-replay-2026-08`  
**Status:** `CI_R3B1G_TIRE_STATUS_REPAIR_FULL_REPLAY_PARTIAL`

---

## Baseline

| Field | Value |
|-------|-------|
| Branch | `fix/ci-r3b1g-tire-status-full-replay-2026-08` |
| PRE_R3B1G_SHA | `795962d438457e05b5c55c0a7724b2c4b6f45305` |
| Base R3B1F.1.1 SHA | `795962d438457e05b5c55c0a7724b2c4b6f45305` |
| Production exposure | **E_UNKNOWN** |

---

## One authorized repair

| Field | Value |
|-------|-------|
| Relation | `vehicle_tire_setups` |
| Column | `status` |
| Type | `TireSetupStatus` |
| Nullable | false |
| Default | ACTIVE |
| Migration | `20260716182730_ci_r3b_tire_setup_status_predecessor` |
| SQL SHA-256 | `55838c640e292a17a8409a5c49df035173b8668a00b4c08b91f3cde0eda25fca` |
| Boundary after | `20260716182500_ci_r3b_post_vendor_predecessor_slot13` |
| Boundary before | `20260716183000_tire_lifecycle_invariants` |
| Contract equivalence | PASS |
| IF NOT EXISTS | False |

---

## Targeted proof

| Check | Result |
|-------|--------|
| Pre-repair replay to Slot 13 | PASS |
| status absent before repair | PASS |
| Actual repair migration | PASS |
| Post-repair catalog parity | PASS |
| Migration 157 | PASS |
| vehicle_tire_setups partial index | PASS |
| tires partial index | PASS |

---

## Full replay

| Field | Value |
|-------|-------|
| Migration directories | 304 |
| Normal migrations applied | 248 |
| Special migrations | 1 |
| Failed migrations | 1 |
| Manual interventions | 0 |
| Last successful | `20260721240000_iam_last_selected_organization` |
| HEAD reached | None |
| R3B1G repair applied | PASS |
| Migration 157 applied | PASS |


## Full replay blocker

| Field | Value |
|-------|-------|
| First failing migration | `20260721250000_iam_versioned_role_assignments` |
| Failure ordinal | 249 |
| SQLSTATE | 42703 |
| Classification | NEW_UNRELATED_HISTORICAL_DEFECT |
| Last applied migration | `20260721240000_iam_last_selected_organization` |


## Final convergence

| Gate | Result |
|------|--------|
| 19/19 objects | NOT_REACHED/19 |
| 9/9 tables | NOT_REACHED |
| 10/10 enums | NOT_REACHED |
| 54/54 properties | NOT_REACHED/54 |
| Parity pass | False |

---

## Immutability

| Check | Result |
|-------|--------|
| Preexisting migration SQL modified | 0 |
| New migration directories | 1 |
| schema.prisma changed | NO |
| runtime changed | NO |

---

## Safety

- Production DDL/DML: **NO**
- Deployment: **NO**
- Merge: **NO**
- R3B.2: **NO**
- Full fresh replay executed: **YES**

---

## Final status

**CI_R3B1G_TIRE_STATUS_REPAIR_FULL_REPLAY_PARTIAL**
