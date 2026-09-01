# Battery V2 — Publication & Readiness Reachability (Phase 3)

**Gap:** `BAT-V2-GAP-PUB-READINESS-001` (refined to SUBSTANTIAL)  
**Epistemic:** CONFIRMED from config + code trace

## Separate concepts (do not collapse)

| Concept | Artifact / service | Customer-facing? |
|---------|-------------------|------------------|
| **Assessment** | `battery_assessments` | Usually no (shadow/diagnostic) |
| **Publication record** | `battery_publications` | When STABLE/PROVISIONAL |
| **Canonical read** | `CanonicalBatteryHealthService` + builder | Yes (API) |
| **Readiness decision** | `evaluateBatteryReadiness` | Rental block when flag on |
| **User-visible UI** | Rental health, tasks, insights | Partial / path-dependent |

## Flag defaults (`battery-health-v2.config.ts`)

| Flag | Default | Effect when OFF |
|------|---------|-----------------|
| `BATTERY_V2_REST_SHADOW_ENABLED` | **false** | No REST shadow pipeline |
| `BATTERY_V2_PUBLICATION_ENABLED` | **false** | No LV publication persist |
| `BATTERY_V2_READINESS_ENABLED` | **false** | Readiness returns READY noop |
| `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED` | **false** | No HV shadow recompute |
| `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` | **false** | SOH gate `PUBLICATION_DISABLED` reason |

## Stage model (cutover policy)

| Stage | REST shadow | Publication | Readiness | Legacy rest capture |
|-------|-------------|-------------|-----------|---------------------|
| 1 | ON | OFF | OFF | ON (when pub off) |
| 2 | ON | ON | OFF | OFF |
| 3 | ON | ON | ON | OFF |
| Legacy-only | OFF | OFF | — | ON |

## LV publication pipeline

```
REST measurement (shadow) → battery_assessments (CANONICAL or SHADOW mode)
  → BatteryPublicationService.updateLvPublication (flag-gated)
  → battery_publications row
  → LvCanonicalBatteryResolver primaryTruth
```

**Confirmed gaps:**

- REST target completion does **not** enqueue assessment or publication jobs.
- `BATTERY_PUBLICATION_UPDATE` handler exists; **not enqueued** in normal production path (backfill calls `updateLvPublication` directly).
- `getSummary` LV aggregate (`healthPercent`, `healthStatus`) still reads **`battery_features`** — dual authority with `battery_publications`.

## HV "publication"

- No HV `battery_publications` consumer path identified.
- `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` unblocks internal `sohGatePassed` only.
- SOH gate assessments always `publicationEligible: false`.
- `summary.hv.sohPct` winner: provider → reported → legacy capacity — **not** SOH gate assessment.

## Readiness (`battery-readiness.policy.ts`)

**Inputs:** canonical publication maturity, `summary.lv` aggregate, warning light, DTC, HV provider SOH, shadow signals.

**Hard LV rental block (when flag ON):** requires `publicationMaturity === 'STABLE'` + VALID rest + evidence tier.

**Explicit non-blocks:** REST shadow, HV capacity shadow, proxy/live-only paths.

**Consumer:** `RentalHealthService.evaluateBattery` → `rental_blocked` module state. Tasks use separate `evaluateBatteryAlerts` path.

**Important:** `blocksVehicleAvailability: false` on battery tasks — tasks do **not** equal rental unavailability.

## Necessary vs sufficient (CONFIRMED code, not production enablement)

| Outcome | Necessary (code) | Sufficient (code) |
|---------|------------------|-------------------|
| LV publication row | `PUBLICATION_ENABLED` + `updateLvPublication` call | STABLE/PROVISIONAL policy pass |
| Canonical primaryTruth from publication | publication row exists | resolver read path |
| Rental readiness block (LV critical) | `READINESS_ENABLED` + STABLE + VALID rest | policy branch |
| HV SOH gate pass | shadow pipeline + verified ref + `HV_SOH_PUBLICATION_ENABLED` | gate policy |
| User sees HV SOH % | `isEv` + selected SOH evidence | `canonical.hv.providerSoh` |

Production enablement checklist remains in `architecture/BATTERY_V2_PRODUCTION_CUTOVER_2026-08-26.md` — **not PRODUCTION_VALIDATED**.
