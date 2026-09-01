# Battery V2 — Drive Profile Matrix

**Reconstruction date:** 2026-09-01 (Phase 2, authority correction pass)  
**Epistemic status:** CONFIRMED where traced to code; INFERRED/UNKNOWN where noted

## Resolver split (important)

| Layer | Branches on ICE/HEV/PHEV/BEV? | Source |
|-------|------------------------------|--------|
| `resolveHvMethodProfile()` | **No** — capability-driven only | `hv-method-profile.resolver.ts` |
| `resolveBatteryPolicy()` | **Yes** — drive profile + chemistry | `battery-policy-profile.resolver.ts` |
| `CanonicalBatteryHealthService` `isEv` | **Yes** — `ELECTRIC` / `PLUGIN_HYBRID` only (**not `HYBRID`**) | `canonical-battery-health.service.ts` |

## Profile matrix

| Profile | LV rest/crank | HV pipeline (policy) | HV measurement types (ICE catalog) | HV method profile | Canonical `isEv` | Provider SOH path | M2/M3 shadow | Recharge segments |
|---------|---------------|----------------------|-----------------------------------|-------------------|------------------|-------------------|--------------|-------------------|
| **ICE** | Yes (lead/AGM/EFB policies) | **No** (`hvPipelineAllowed: false`) | **Forbidden** (`HV_ALL_MEASUREMENT_TYPES`) | Only if capability rows exist | `false` | N/A (non-EV canonical) | Unsupported unless capabilities list HV signals | Fallback only if segments unavailable |
| **HEV** | Yes (ICE policies) | **Yes** (`materializePolicy`: `definition.hvPipelineAllowed \|\| isHvMeasurementSupported(HEV)`) | **Still forbidden** by inherited ICE catalog | Capability-driven | **`false`** if `fuelType=HYBRID` only | Blocked by `isEv` gate | Same as PHEV/BEV when pipeline + capabilities allow | Same |
| **PHEV** | Yes (`PHEV_AUX`) | **Yes** | Allowed (`HV_ALL` in supported set) | Capability-driven | `true` (`PLUGIN_HYBRID`) | Eligible when `hv.provider_soh` has data | Flag-gated shadow | Native preferred, fallback when segments unavailable |
| **BEV** | LV rest/crank **forbidden** (`EV_AUX_*`) | **Yes** | Allowed | Capability-driven | `true` (`ELECTRIC`) | Eligible when signal has data | Flag-gated shadow | Native preferred, fallback when segments unavailable |

## HEV multi-layer authority contradiction

**Contradiction:** `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` (UNRESOLVED; production impact UNKNOWN)

| Layer | HEV (`fuelType=HYBRID`) behavior |
|-------|----------------------------------|
| `isHvMeasurementSupported(HEV)` | `true` — drive-profile helper says HV paths apply |
| ICE policy catalog (`resolveBatteryPolicy` → ICE family) | `forbiddenMeasurementTypes: HV_ALL_MEASUREMENT_TYPES`, `definition.hvPipelineAllowed: false` |
| `materializePolicy()` | `hvPipelineAllowed = definition.hvPipelineAllowed \|\| isHvMeasurementSupported(HEV)` → **`true` for HEV** |
| HV method profile | Capability-driven independently |
| `CanonicalBatteryHealthService isEv` | Only `ELECTRIC` / `PLUGIN_HYBRID` — **`HYBRID` excluded** |

An HEV resolved policy can simultaneously contain `hvPipelineAllowed = true` while HV measurement types remain forbidden by the inherited ICE policy definition. Canonical read treats `HYBRID` as non-EV (`isEv=false`), blocking the canonical HV slice regardless of pipeline flags.

**Narrower gap (linked):** `BAT-V2-GAP-HEV-IS-EV-001` — whether HEV vehicles receive canonical HV slice.

Do **not** decide which layer is “correct” without a product decision.

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

- `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` — multi-layer HEV HV authority (linked to `BAT-V2-GAP-HEV-IS-EV-001`)
- `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001` — `SESSION_CHARGE_CAPACITY` eligibility only
- `BAT-V2-GAP-HV-GROSS-CAPACITY-METHOD-001` — `GROSS_CAPACITY_REFERENCE` eligibility only
- PHEV-specific opening shapes beyond ICE split — **UNKNOWN**
