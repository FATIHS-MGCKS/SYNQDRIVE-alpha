# HV SOH Selection — Resolution Dossier (Phase 4)

**Gap:** `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001`  
**Related:** `BAT-V2-GAP-HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001`  
**Priority:** P2  
**Readiness:** IMPLEMENTATION_READY

## CURRENT STATE

Conflict resolver picks winner → single usability check in `canonical-battery-health.service.ts` → no reselection. Reachable: stale `provider-soh` wins conflict ranking → fails usability → null despite usable `capacity-estimate`.

## TIE MECHANISM (demonstrated reachable case)

Evidence strength (`battery-evidence-strength.policy.ts`):

- `PROVIDER_OEM_SOH` base tier rank = **7**
- `ESTIMATED` (capacity) base tier rank = **4**
- `STALE_TIER_PENALTY` = **3**

Stale provider effective tier: `7 - 3 = 4`  
Fresh capacity effective tier: `4`

`resolveEvidenceConflict` sorts by `effectiveTierScore` descending; **first candidate wins on tie**. Provider (`provider-soh`) ranks before capacity (`capacity-estimate`) at equal effective score.

`canonical-battery-health.service.ts` then requires:

```typescript
if (hvSohWinner?.id === 'provider-soh' && providerSohUsable) { ... }
```

`providerSohUsable` requires decision-fresh observation (`observationFreshnessIsDecisionFresh`). Stale provider fails usability — **no iteration to next ranked candidate** — `hvHealthPercent` stays null even when capacity estimate is fresh and present.

**Implementation surfaces:** `battery-evidence-strength.policy.ts` (`effectiveTierScore`, `resolveEvidenceConflict`, `resolveHvSohEvidenceConflict`), `canonical-battery-health.service.ts` (winner usability gate), associated specs.

## OPTIONS

| Option | Behavior | Epistemic correctness | Verdict |
|--------|----------|----------------------|---------|
| **A** Filter unusable before rank | Pre-filter candidates | High | Changes conflict semantics |
| **B** Iterate ranked until usable | Post-rank walk | High | **RECOMMENDED** |
| **C** Winner authoritative even if unusable | Status quo | Honest "unknown" | Accept for VLS-only path |
| **D** Split authority vs display fallback | Two fields | Complex UI | Future |

## RECOMMENDED OPTION

**Option B** for `canonical.hv.providerSoh` selection only. Preserve conflict ranking order; after winner fails usability, try next ranked candidate. Log skipped candidates for audit.

**Provider timestamp (related gap):** **Option A** — `VehicleLatestState.tractionBatterySohPercent` without evidence `observedAt` never `providerSohUsable`. Live signal may still display under `liveState`.

## TRUTH TABLE (target)

| Conflict ranking (effective tier) | Winner id | Winner usable? | Selected source |
|-----------------------------------|-----------|----------------|-----------------|
| reported > provider > capacity | reported | yes | DOCUMENT/MANUAL |
| provider (stale, eff=4) = capacity (fresh, eff=4) | provider-soh | **no** (stale) | **null today** → capacity after Option B |
| provider (VLS-only, no observedAt) | provider-soh | no | null |

## TEST PLAN

Extend `canonical-battery-health.service` and `battery-evidence-strength.policy` specs for tie + iteration path; no production mutation.

## ROLLBACK

Behavior flag `BATTERY_V2_HV_SOH_ITERATE_USABLE_CANDIDATES` default OFF.

## GRAPH IDS

Gap remains until runtime merge.
