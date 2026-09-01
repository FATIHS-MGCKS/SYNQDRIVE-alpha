# Battery V2 — Readiness, Alerts, Tasks

## Rental readiness

Battery state flows into rental health via `RentalHealthService` → canonical battery summary. Exact readiness threshold wiring — **partial** (trace `mapRentalBatteryModule`).

## Tasks

**Service:** `battery-task.service.ts`  
**Source:** `CanonicalBatteryHealthService` via `fetchCanonicalBatterySummarySafe()`  
**Policy:** `battery-task.policy.ts` + automation rules

Battery tasks materialize from canonical summary evaluation — not from legacy `battery_features` directly.

## Publication / readiness flags

| Flag | Default | Effect |
|------|---------|--------|
| `BATTERY_V2_PUBLICATION_ENABLED` | OFF | LV publication layer |
| `BATTERY_V2_READINESS_ENABLED` | OFF | Readiness layer |
| `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` | OFF | HV SOH publication-**intent** / reason metadata (`PUBLICATION_DISABLED` when OFF); **not** execution authority; **not** a working customer publication pipeline |
| `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED` | OFF | HV shadow capacity + SOH gate **execution** pipeline |

**CONFIRMED:** Shadow and SOH gate assessments carry `publicationEligible: false` (even when publication-intent flag ON). Canonical read does not auto-publish shadow SOH to customer-facing fields. No HV `BatteryPublication` carrier identified.

## Alerts / insights

Battery insight candidates feed task automation (`BatteryInsightCandidate`). Full alert catalog — **partial**.

## Gaps

- `BAT-V2-GAP-PUB-READINESS-001` — exact production enablement gates partially mapped (flags known; consumer impact incomplete)
- Notification engine battery-specific rules — **UNKNOWN**
