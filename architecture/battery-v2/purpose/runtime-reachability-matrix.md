# Battery V2 — Runtime Reachability Matrix (Phase 3)

**Reconstruction date:** 2026-09-01 (final consistency pass)  
**Epistemic:** CONFIRMED from current code trace unless marked UNKNOWN

## Phase 3 decision matrix

| Path | DEFINED | CONFIGURED | ELIGIBLE | EXECUTABLE | PERSISTED | PUBLISHED | CONSUMED | USER_VISIBLE | Feature flag(s) | Epistemic |
|------|---------|------------|----------|------------|-----------|-----------|----------|--------------|-----------------|-----------|
| **LV REST canonical pipeline** (`REST_SHADOW` flag) | ✓ | default OFF | ICE/HEV/PHEV per policy; BEV forbidden | ✓ when flag on | ✓ measurements | ✗ not auto e2e — handoffs missing; pub separately flag-gated | ✓ canonical diagnostic | ✗ prominent % | `BATTERY_V2_REST_SHADOW_ENABLED` | CONFIRMED |
| **LV publication** | ✓ | default OFF | publication-eligible assessment + evidence/freshness gates; maturity **PROVISIONAL or STABLE** + `PUBLICATION_ENABLED` | ✓ handler exists; **auto chain NOT e2e** | ✓ `battery_publications` | ✓ when flag on + invoked | ✓ `canonical.lv.primaryTruth` | partial (dual authority) | `BATTERY_V2_PUBLICATION_ENABLED` | CONFIRMED |
| **LV readiness** | ✓ | default OFF | multiple independent block paths when flag on (see below) | ✓ when flag on | ✗ (policy only) | — | ✓ `RentalHealthService` | ✓ rental block when flag on | `BATTERY_V2_READINESS_ENABLED` | CONFIRMED |
| **HV M2 shadow** | ✓ | default OFF | capability + session eligible | ✓ recompute job | ✓ `hv_capacity_observations` | ✗ | ✓ evaluation API | ✗ default | `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED` | CONFIRMED |
| **HV M3 validation** | ✓ | default OFF | M2 + session | ✓ with M2 chain | ✓ session metadata | ✗ VALIDATION_ONLY | internal | ✗ | same | CONFIRMED |
| **HV cross-session** | ✓ | default OFF | ≥3 qualified sessions | ✓ shadow pipeline | ✓ `battery_assessments` | ✗ | ✓ `canonical.hv.capacityAssessment` | ✗ | same | CONFIRMED |
| **HV SOH selected** | ✓ | n/a | `isEv` (read gate) + evidence | ✓ read-time | n/a | n/a | ✓ `canonical.hv.providerSoh` | ✓ when data exists | — | CONFIRMED |
| **HV SOH shadow gate** | ✓ | default OFF | verified ref + cross-session | ✓ shadow pipeline | ✓ assessments | internal only | ✓ `canonical.hv.sohAssessment` | ✗ | `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` | CONFIRMED |
| **HV publication** | ✓ | default OFF | SOH gate | ✓ internal gate pass | ✗ no `battery_publications` HV path | ✗ | ✗ not summary winner | ✗ | `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` | CONFIRMED |
| **Task generation** | ✓ | automation rule | evidence tiers | ✓ insight run | ✓ `orgTask` | — | ✓ tasks UI | ✓ | org rule `BATTERY_CRITICAL_HEALTH` | CONFIRMED |
| **HEV HV side-effects** | ✓ | flags | measurement types forbidden; snapshots when evSoc; sessions/capacity via flags+caps | ✓ side-effect writes possible | ✓ side-effect rows | ✗ | ✗ `canonical.hv` absent (`isEv` read gate) | ✗ | separate write vs read gates | CONFIRMED |
| **PHEV LV+HV (implemented paths)** | ✓ | flags | capabilities + `isEv` | ✓ M2/M3/recharge/cross-session when flags+caps pass | ✓ | ✗ default | ✓ canonical | partial | Not all advertised HV methods implemented | CONFIRMED |

## LV publication eligibility (concise)

From `lv-publication.policy.ts` when `BATTERY_V2_PUBLICATION_ENABLED` and handler invoked:

- supported LV profile, non-shadow publication-eligible assessment
- valid evidence count, contamination gate, confidence threshold
- compatible cycles, assessment-evidence freshness
- maturity **PROVISIONAL** or **STABLE** (not STABLE-only)

## LV readiness blocking paths (when flag ON)

Independent hard-block-capable inputs (`battery-readiness.policy.ts`):

- confirmed workshop defect
- battery warning light
- safety-critical battery DTC
- stable qualified critical LV evidence
- fresh provider SOH below readiness threshold with required confidence

Proxy/shadow/live-only paths remain **non-hard-blocking**.

## Profile comparison

| Dimension | BEV | PHEV | HEV (`HYBRID`) |
|-----------|-----|------|----------------|
| `isEv` / `canonical.hv` (read gate) | ✓ | ✓ | ✗ absent |
| LV REST | forbidden | ✓ | ✓ |
| BatteryMeasurement HV writes | ✓ | ✓ | ✗ `UNSUPPORTED_PROFILE` |
| HV snapshot ingestion (`evSoc`) | ✓ | ✓ | ✓ (not fuelType gated) |
| HV charge sessions / capacity shadow | flags + caps | flags + caps | flags + caps (side-effects) |
| SESSION_CHARGE / GROSS_CAPACITY | listed, no compute | listed, no compute | listed, no compute |

## Known unreachable job chains

| Chain | Gap |
|-------|-----|
| REST complete → assessment | `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001` |
| Assessment → publication | `BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001` |
| E2E canonical pipeline | `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001` |
