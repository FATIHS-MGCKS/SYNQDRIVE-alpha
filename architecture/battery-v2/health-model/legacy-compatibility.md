# Battery V2 — Legacy Compatibility (Phase 2)

**Reconstruction date:** 2026-09-01

## Legacy paths still active

| Path | Store / service | User-facing? | Authority |
|------|-----------------|--------------|-----------|
| `GET battery-health/v2` | `BatteryFeatures` via `BatteryV2Service` | Yes (compat route) | **LEGACY** |
| `GET battery-health` | `BatteryHealthService` snapshots | Yes | **LEGACY** |
| `GET battery-health/trend` | Snapshot trend | Yes | **LEGACY** |
| `GET hv-battery-status` | `HvBatteryHealthService` | Yes (compat) | **COMPAT** |
| Legacy pairwise HV capacity | `HvBatteryHealthService` | Only if `BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENABLED` | **LEGACY** (disabled default) |
| `degradation_model` SOH | Legacy publication path | Blocked from publish | **DEAD for publication** |

## Canonical paths (preferred)

| Path | Authority |
|------|-----------|
| `battery-health-summary` / `detail` | `CanonicalBatteryHealthService` |
| Rental health tab | Canonical summary/detail |
| `BatteryTaskService` | Canonical summary |

## Conflict rules (CONFIRMED)

- Canonical read ignores stale legacy pairwise SOH when provider SOH path exists
- Legacy `degradation_model` HV SOH must not publish (`soh-publication.ts`)
- When `BATTERY_V2_REST_SHADOW_ENABLED` + `BATTERY_V2_PUBLICATION_ENABLED`, legacy rest capture may be suppressed

## Shadow vs legacy

| Layer | Customer-visible by default? |
|-------|------------------------------|
| Canonical DTO | Yes (summary/detail APIs) |
| Shadow HV capacity/SOH assessments | No (`publicationEligible: false`) |
| `battery_features` rest/crank | Yes on v2 legacy route only |

## Remaining gaps

- Master/admin battery surfaces not exhaustively mapped
- Per-screen authority when canonical and legacy routes both reachable — **partial**
