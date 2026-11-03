# Feature flag before / after matrix (deploy `cf20c49f`, flags unchanged)

**Policy:** Preserve effective production values. **No new opt-in flags enabled** during release.  
**Source:** redacted grep of `/opt/synqdrive/shared/backend.env` (2026-10-19 audit).

Legend: **P** = present in env, **A** = absent (default), **Δ** = planned change at deploy.

---

## Driving Intelligence S4

| Flag / setting | Before (prod) | After (planned) | Behavior without flag change |
|----------------|---------------|-----------------|------------------------------|
| `DI_V0_S4_MASTER_ENABLED` | P | P (Δ none) | Production S4 on |
| `DI_V0_S4_WORKER_ENABLED` | P | P | Worker on |
| `DI_V0_S4_DISCOVERY_ENABLED` | P | P | Unchanged |
| `DI_V0_S4_POSITION_ENABLED` | P | P | Unchanged |
| `DI_V0_S4_R1_ENABLED` | P | P | Unchanged |
| `DI_V0_S4_ORGANIZATION_ALLOWLIST` | P | P | Same cohort |
| `DI_V0_S4_VEHICLE_ALLOWLIST` | P | P | Same cohort |
| `DI_V0_S4_RESEARCH_*` | A | A | Research worker **off** |
| `DI_V0_S4_RESEARCH_DIRECTION_AWARE_EMISSION_P1_ENABLED` | A | A | **#2085 not merged** — remains off |

**S4 research code on disk after deploy:** PASSIVE until research flags enabled.

---

## Trip FSM / TDL

| Flag | Before | After |
|------|--------|-------|
| `TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED` | P | P (no Δ) |
| `TRIP_FSM_SHADOW_VEHICLE_IDS` | P | P |
| `TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED` | P | P |
| `TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS` | P | P |
| `TRIP_START_BOUNDARY_ADMISSION_SHADOW_ROUTE_FETCH_ENABLED` | P | P |
| `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED` | P | P |

**Trip-boundary policy promotion:** **NONE**

---

## DTC-01 / DTC-02

| Flag | Before | After |
|------|--------|-------|
| `DTC_01F_COHORT_GATE_ENABLED` | A | A |
| `DTC_01F_COHORT_MIXED_MODE_ENABLED` | A | A |
| `DTC_01F_COHORT_VEHICLE_ALLOWLIST` | A | A |

Mixed-mode routing code ships **PASSIVE**. Polling/webhook/source-head: **no deploy-time reset**.

---

## VSI

| Flag | Before | After |
|------|--------|-------|
| `VSI_P3A_PER_LINK_CATALOG_WRITE_ENABLED` | A (default false) | A |
| `VSI_P3A_PER_LINK_CATALOG_RESOLVER_ENABLED` | A (default false) | A |

Migration adds table; **no runtime writes** with flags off.

---

## PDI

| Flag | Before | After |
|------|--------|-------|
| `PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED` | A | A |

Operator CLI binary in release; **no intake** without gate + operator action.

---

## APDS / Battery

| Area | Before | After |
|------|--------|-------|
| `BATTERY_V2_*` (multiple) | P | P — **preserve all values** |
| `BATTERY_HV_H4_A3_RECONCILIATION_*` | P | P |
| APDS-specific | (subset under battery/vsi) | No new activation in delta |

**No additional battery jobs, publication gates, or cohorts** in this release plan.

---

## Research workers / deploy meta

| Flag | Before | After |
|------|--------|-------|
| `SYNQDRIVE_DEPLOYED_GIT_SHA` | P (c6d5ab99) | Updated by deploy script to **cf20c49f** |
| `SYNQDRIVE_DEPLOY_GIT_SHA` | P | Updated at promote |
| `SYNQDRIVE_BUILD_ID` / replica peer IDs | P | May update on rolling restart |

---

## Blast radius (no flag change)

| Surface | Risk |
|---------|------|
| **Scheduler** | Rolling restart — expect brief leader re-election; deploy script enforces single leader |
| **DB** | One additive migration |
| **Queues** | Low — no new consumers without flags |
| **Webhooks** | DTC unchanged |
| **S4 worker** | Code path unchanged for authoritative decoder |

**FEATURE_FLAG_CHANGES=NONE_PLANNED**
