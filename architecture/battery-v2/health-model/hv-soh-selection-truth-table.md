# Battery V2 — HV SOH Selection Truth Table (Phase 3)

**Gap:** `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001`  
**Epistemic:** CONFIRMED control flow; partial reachability analysis

## Control flow (confirmed)

1. `resolveHvSohEvidenceConflict()` ranks candidates by `effectiveTierScore` (tier − stale penalty).
2. Winner ID selected: `provider-soh` | `reported-soh` | `capacity-estimate`.
3. Apply branch checks winner-specific usability — **no second-candidate reselection**.

```typescript
if (hvSohWinner?.id === 'provider-soh' && providerSohUsable) { ... }
else if (hvSohWinner?.id === 'reported-soh' && reportedSohUsable) { ... }
else if (hvSohWinner?.id === 'capacity-estimate' && hvMeasuredSoh != null) { ... }
```

## Usability gates

| Candidate | Usability condition |
|-----------|---------------------|
| `provider-soh` | `providerSoh != null` AND decision-fresh `providerSohObservedAt` (evidence only, not VLS) |
| `reported-soh` | `reportedSoh != null` AND decision-fresh reported observation |
| `capacity-estimate` | `hvMeasuredSoh != null` (legacy pairwise flag required) |

## Truth table (realistic combinations)

| Provider present | Provider usable | Reported present | Reported usable | Capacity present | Conflict winner | Winner usable? | Final `canonical.hv.providerSoh.percent` | 2nd candidate usable? | 2nd used? |
|------------------|-----------------|------------------|-----------------|------------------|-----------------|----------------|-------------------------------------------|----------------------|-----------|
| ✓ fresh evidence | ✓ | — | — | — | provider | ✓ | provider % | — | — |
| ✓ VLS only | ✗ | — | — | — | provider (if sole) | ✗ | **null** | — | ✗ |
| ✓ stale | ✗ | ✓ fresh doc | ✓ | — | reported | ✓ | reported % | — | — |
| ✓ stale | ✗ | ✓ fresh doc | ✓ | ✓ legacy | reported | ✓ | reported % | capacity maybe | ✗ (reported wins) |
| ✓ stale | ✗ | ✗ | — | ✓ legacy | provider (tie @4) | ✗ | **null** | **capacity yes** | **✗ REACHABLE** |
| ✓ stale | ✗ | ✗ stale | ✗ | ✓ legacy | provider or capacity (tie) | varies | null if provider wins | — | ✗ |

## Reachability verdict

| Scenario | Code reachable? | Production frequency |
|----------|-----------------|----------------------|
| Winner fails usability, no other candidate | **Yes** (VLS-only provider) | UNKNOWN |
| Winner fails usability, fresh reported exists | **No** (reported wins conflict) | N/A |
| Winner fails usability, usable capacity exists | **Yes** (stale provider ties/beats stale capacity; provider wins tie order) | UNKNOWN |
| Requires legacy pairwise flag for capacity path | **Yes** | UNKNOWN |

**Not a production defect** without production evidence. Gap precision upgraded: **code-reachable** for provider-winner + capacity-fallback-missed path.

## Canonical DTO carrier

Selected SOH maps to `canonical.hv.providerSoh.percent` with `.source` identifying authority — not `canonical.hv.healthPercent` (field does not exist on `CanonicalBatteryDto`).
