# Battery V2 — HV SOH Authority

**Reconstruction maturity:** SUBSTANTIAL (selected SOH conflict path + shadow SOH gate path traced)  
**Epistemic:** CONFIRMED from `battery-evidence-strength.policy.ts` and `canonical-battery-health.service.ts`

## Two separate canonical concepts (do not collapse)

| Concept | Graph ID | DTO field | Role |
|---------|----------|-----------|------|
| **Selected HV health / SOH** | `BAT-V2-AUTH-HV-SELECTED-SOH-001` | `canonical.hv.healthPercent`, `hvSohSource`, etc. | User-facing selected SOH % from evidence-strength + freshness conflict resolution |
| **HV SOH gate assessment** | `BAT-V2-ASSESS-HV-SOH-GATE-001` | `canonical.hv.sohAssessment` | Shadow cross-session capacity → verified reference → gate assessment; **not overwritten** by provider SOH |

Provider SOH and SOH gate assessment **may coexist** in the canonical DTO. Provider SOH does **not** `authoritative_over` the SOH gate assessment node.

## Evidence-strength + freshness conflict policy

HV SOH authority is **not** “provider SOH always wins.” It is a freshness-aware evidence conflict policy:

**Policy:** `BAT-V2-POL-HV-EVIDENCE-STRENGTH-001`  
**Resolver:** `resolveHvSohEvidenceConflict()` → `resolveEvidenceConflict()`  
**Authority:** `BAT-V2-AUTH-HV-SOH-CONFLICT-001`

### Tier ranks (base priority, higher wins)

| Tier | Rank |
|------|------|
| `WORKSHOP_OR_BMS_VERIFIED` | 9 |
| `DOCUMENT_VERIFIED` | 8 |
| `PROVIDER_OEM_SOH` | 7 |
| `QUALIFIED_TELEMETRY_STABLE` | 6 |
| `QUALIFIED_TELEMETRY_PROVISIONAL` | 5 |
| `ESTIMATED` | 4 |
| `PROXY` | 3 |
| `LIVE_TELEMETRY` | 2 |
| `UNKNOWN` | 1 |

Stale evidence receives an **effective-tier penalty** (`STALE_TIER_PENALTY = 3`) when competing.

### Correct semantic (equal freshness)

- Fresh **workshop/BMS verified** outranks fresh **provider SOH**
- Fresh **document/manual verified** outranks fresh **provider SOH**
- Fresh **provider SOH** outranks **ESTIMATED** / capacity-derived evidence
- Freshness can alter effective authority (stale higher-tier may lose to fresh lower-tier)

### Selected SOH candidates (`CanonicalBatteryHealthService`)

1. Provider-reported SOH (`provider-soh` candidate, tier `PROVIDER_OEM_SOH`)
2. Workshop / document / manual reported SOH (`reported-soh`, tier `WORKSHOP_OR_BMS_VERIFIED` or `DOCUMENT_VERIFIED`)
3. Legacy measured capacity-derived SOH when `BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENABLED` (`capacity-estimate`, tier `ESTIMATED`)
4. Else → **unavailable** (no fabricated %)

**Freshness thresholds:** provider SOH 45 days; reported SOH uses `reportedSohObservation` threshold.

## Provider SOH value vs observation timestamp

```typescript
providerSoh = hvProviderSohEvidence.numericValue ?? VehicleLatestState.tractionBatterySohPercent
providerSohObservedAt = hvProviderSohEvidence.observedAt ?? null  // NOT from latestState
providerSohUsable = providerSoh != null && decisionFresh(providerSohObservedAt)
```

**Gap:** `BAT-V2-GAP-HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001`  
A latest-state-only provider SOH value does **not** automatically become a decision-fresh selected provider SOH.

## Winner selection vs winner usability (control flow)

After `resolveHvSohEvidenceConflict()` picks `hvSohWinner`, canonical read checks winner-specific `...Usable` flags:

```typescript
if (hvSohWinner?.id === 'provider-soh' && providerSohUsable) { ... }
else if (hvSohWinner?.id === 'reported-soh' && reportedSohUsable) { ... }
else if (hvSohWinner?.id === 'capacity-estimate' && hvMeasuredSoh != null) { ... }
```

**No second-candidate reselection** if the winner fails its usability check.

**Gap:** `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001` — CONFIRMED control flow; UNKNOWN whether production data reaches a problematic combination.

## Calculated SOH (shadow SOH gate) — separate path

**Service:** `hv-soh-gate-assessment.service.ts` + `hv-soh-gate.policy.ts`  
**Requires:** VERIFIED `VehicleBatteryReferenceCapacity` + compatible `capacityType` + cross-session capacity input.

**Formula:** `estimatedSohPct = (estimatedCapacityKwh / referenceCapacityKwh) * 100` (with gate policies).

**Publication:** `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` (default OFF). Assessments carry `publicationEligible: false`.

Loaded independently via `findLatestHvSohGateAssessment()` and mapped to `canonical.hv.sohAssessment` by `canonical-battery.builder.ts`.

## No fabricated HV SOH invariant

**CONFIRMED** in code:

- `hv-battery-health.service.ts`: no age/km fallback model
- `canonical-battery-health.service.ts`: HV SOH only from real data basis
- `soh-publication.ts`: legacy `degradation_model` values must not publish HV SOH

| State | User-facing behavior |
|-------|---------------------|
| NO DATA | `unavailable` / unknown — not 0% |
| INSUFFICIENT DATA | Quality slice reflects partial evidence |
| STALE DATA | Stale freshness; not promoted |
| UNSUPPORTED METHOD | Profile/method not eligible |

## Gaps

- Fleet-wide provider SOH signal availability — often `NOT_LISTED`
- PHEV-specific provider SOH behavior — **UNKNOWN**
- `BAT-V2-GAP-HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001` — latestState value without evidence timestamp
- `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001` — no fallback after winner fails usability
