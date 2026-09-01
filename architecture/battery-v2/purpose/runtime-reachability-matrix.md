# Battery V2 — Runtime Reachability Matrix (Phase 3)

**Reconstruction date:** 2026-09-01  
**Epistemic:** CONFIRMED from current code trace unless marked UNKNOWN  
**Purpose:** Answer "can this path actually execute?" — not merely "is it defined?"

## Lifecycle stages (column semantics)

| Stage | Meaning |
|-------|---------|
| **DEFINED** | Type/enum/policy exists in code |
| **CONFIGURED** | Feature flag or env default known |
| **ELIGIBLE** | Vehicle/profile/capability gates pass |
| **EXECUTABLE** | Job/handler/service can run in current code |
| **PERSISTED** | Writes durable DB rows |
| **PUBLISHED** | `BatteryPublication` or customer-facing publication path |
| **CONSUMED** | Downstream read model / aggregator uses output |
| **USER_VISIBLE** | Rental/master/operator UI shows result |

A ✓ at ELIGIBLE does not imply USER_VISIBLE. A ✓ at PERSISTED does not imply PUBLISHED.

## Phase 3 decision matrix

| Path | DEFINED | CONFIGURED | ELIGIBLE | EXECUTABLE | PERSISTED | PUBLISHED | CONSUMED | USER_VISIBLE | Feature flag(s) | Epistemic |
|------|---------|------------|----------|------------|-----------|-----------|----------|--------------|-----------------|-----------|
| **LV REST shadow** | ✓ | default OFF | ICE/PHEV chemistry | ✓ when REST_SHADOW on | ✓ measurements | ✗ (shadow blocks pub) | ✓ canonical diagnostic | ✗ prominent % | `BATTERY_V2_REST_SHADOW_ENABLED` | CONFIRMED |
| **LV publication** | ✓ | default OFF | STABLE assessment + flag | ✓ `updateLvPublication` | ✓ `battery_publications` | ✓ when flag on | ✓ `canonical.lv.primaryTruth` | partial (dual authority) | `BATTERY_V2_PUBLICATION_ENABLED` | CONFIRMED |
| **LV readiness** | ✓ | default OFF | STABLE pub + evidence tiers | ✓ when flag on | ✗ (policy only) | — | ✓ `RentalHealthService` | ✓ rental block when flag on | `BATTERY_V2_READINESS_ENABLED` | CONFIRMED |
| **HV M2 shadow** | ✓ | default OFF | capability + session eligible | ✓ recompute job | ✓ `hv_capacity_observations` | ✗ | ✓ evaluation API | ✗ default | `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED` | CONFIRMED |
| **HV M3 validation** | ✓ | default OFF | M2 + session | ✓ with M2 chain | ✓ session metadata | ✗ VALIDATION_ONLY | internal | ✗ | same | CONFIRMED |
| **HV cross-session** | ✓ | default OFF | ≥3 qualified sessions | ✓ shadow pipeline | ✓ `battery_assessments` | ✗ | ✓ `canonical.hv.capacityAssessment` | ✗ | same | CONFIRMED |
| **HV SOH selected** | ✓ | n/a | `isEv` + evidence | ✓ read-time | n/a | n/a | ✓ `canonical.hv.providerSoh` | ✓ when data exists | — | CONFIRMED |
| **HV SOH shadow gate** | ✓ | default OFF | verified ref + cross-session | ✓ shadow pipeline | ✓ assessments | internal only | ✓ `canonical.hv.sohAssessment` | ✗ | `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` | CONFIRMED |
| **HV publication** | ✓ | default OFF | SOH gate | ✓ internal gate pass | ✗ no `battery_publications` HV path | ✗ | ✗ not summary winner | ✗ | `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` | CONFIRMED |
| **Task generation** | ✓ | automation rule | evidence tiers | ✓ insight run | ✓ `orgTask` | — | ✓ tasks UI | ✓ | org rule `BATTERY_CRITICAL_HEALTH` | CONFIRMED |
| **HEV HV pipeline** | ✓ | flags | capabilities yes | ✓ jobs/snapshots | ✓ orphan rows possible | ✗ | ✗ `canonical.hv=null` | ✗ | `isEv` blocks read | CONFIRMED |
| **PHEV HV pipeline** | ✓ | flags | capabilities + `isEv` | ✓ full chain | ✓ | ✗ default | ✓ canonical | partial | LV+HV parallel | CONFIRMED |

## Profile comparison (HV reachability)

| Dimension | BEV | PHEV | HEV (`HYBRID`) |
|-----------|-----|------|----------------|
| `isEv` / `canonical.hv` | ✓ populated | ✓ populated | ✗ null |
| LV REST | forbidden | ✓ | ✓ (ICE policy) |
| HV measurements persist | ✓ | ✓ | ✗ `UNSUPPORTED_PROFILE` |
| HV snapshots / sessions | ✓ | ✓ | ✓ (no fuel gate) |
| HV jobs schedule | ✓ | ✓ | ✓ |
| `hvPipelineAllowed` on policy | true | true | true (override; **no runtime consumer**) |

See `purpose/profile-matrix.md` and `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001`.

## Known unreachable / broken job chains (CONFIRMED)

| Chain | Status | Gap |
|-------|--------|-----|
| REST target complete → assessment enqueue | **Not wired** | normal path |
| Assessment → `BATTERY_PUBLICATION_UPDATE` enqueue | **Not wired** | `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001` |
| `updateLvPublication` direct call | ✓ backfill only | |

## Explicit non-claims

This matrix does not prove production flag enablement, fleet mix, or user impact frequency.
