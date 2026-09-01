# Battery V2 — Drive Profile Matrix

**Reconstruction date:** 2026-09-01 (Phase 2)  
**Epistemic status:** CONFIRMED where traced to code; INFERRED/UNKNOWN where noted

## Resolver split (important)

| Layer | Branches on ICE/HEV/PHEV/BEV? | Source |
|-------|------------------------------|--------|
| `resolveHvMethodProfile()` | **No** — capability-driven only | `hv-method-profile.resolver.ts` |
| `resolveBatteryPolicy()` | **Yes** — drive profile + chemistry | `battery-policy-profile.resolver.ts` |
| `CanonicalBatteryHealthService` `isEv` | **Yes** — `ELECTRIC` / `PLUGIN_HYBRID` only | `canonical-battery-health.service.ts` |

## Profile matrix

| Profile | LV rest/crank | HV pipeline (policy) | HV method profile | Canonical `isEv` | Provider SOH path | M2/M3 shadow | Recharge segments |
|---------|---------------|----------------------|-------------------|------------------|-------------------|--------------|-------------------|
| **ICE** | Yes (lead/AGM/EFB policies) | **No** (`hvPipelineAllowed: false` unless HEV override) | Only if capability rows exist | `false` | N/A (non-EV canonical) | Unsupported unless capabilities list HV signals | Fallback only if segments unavailable |
| **HEV** | Yes (ICE policies) | **Yes** (`isHvMeasurementSupported(HEV)`) | Capability-driven | **UNKNOWN** if `fuelType=HYBRID` only | Only if `isEv` + signal | Same as PHEV/BEV when enabled | Same |
| **PHEV** | Yes (`PHEV_AUX`) | **Yes** | Capability-driven | `true` (`PLUGIN_HYBRID`) | Eligible when `hv.provider_soh` has data | Flag-gated shadow | Native preferred, fallback when segments unavailable |
| **BEV** | LV rest/crank **forbidden** (`EV_AUX_*`) | **Yes** | Capability-driven | `true` (`ELECTRIC`) | Eligible when signal has data | Flag-gated shadow | Native preferred, fallback when segments unavailable |

## Capability missing / stale behavior

| Condition | Effect |
|-----------|--------|
| Signal `NOT_LISTED` | Method unsupported in HV method profile |
| `AVAILABLE_NULL` | Listed but no data — method unsupported |
| `AVAILABLE_STALE` | Treated as **has data** for method eligibility (`capabilityHasData`) |
| `QUERY_ERROR` | Not counted as data |
| 3 consecutive losses | `UNAVAILABLE` after lifecycle policy |
| `dimo.segments.recharge` absent | M3 / SESSION methods unsupported; reconcile uses **telemetry poll fallback** |

## Engine-off REST semantics

| Profile | Opening gate | Measurement quality |
|---------|--------------|---------------------|
| ICE / HEV / PHEV | `isEngineOffForRestWindowOpening` — ignition-off + speed ≤0.5 km/h can outrank load proxy | `isEngineOffForRest` — conservative; load >5% may reject |
| BEV | LV REST forbidden by policy | N/A |

## Unsupported vs unavailable vs insufficient

| Term | Meaning in canonical read model |
|------|--------------------------------|
| `unsupported` | Drive profile / policy forbids measurement type |
| `unavailable` | Supported in principle but no qualifying evidence |
| `insufficient_data` | Partial evidence; quality gates failed |
| `stale` | Evidence exists but outside freshness window |

## Open gaps

- `BAT-V2-GAP-HEV-IS-EV-001` — HEV `fuelType` vs canonical `isEv` gate
- `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001` — `SESSION_CHARGE_CAPACITY` eligibility only
- `BAT-V2-GAP-HV-GROSS-CAPACITY-METHOD-001` — `GROSS_CAPACITY_REFERENCE` eligibility only
- PHEV-specific opening shapes beyond ICE split — **UNKNOWN**
