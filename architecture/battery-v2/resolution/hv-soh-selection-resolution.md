# HV SOH Selection — Resolution Dossier (Phase 4)

**Gap:** `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001`  
**Related:** `BAT-V2-GAP-HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001`  
**Priority:** P2  
**Readiness:** IMPLEMENTATION_READY

## CURRENT STATE

Conflict resolver picks winner → single usability check → no reselection. Reachable: stale `provider-soh` wins → unusable → null despite usable `capacity-estimate`.

## OPTIONS

| Option | Behavior | Epistemic correctness | Verdict |
|--------|----------|----------------------|---------|
| **A** Filter unusable before rank | Pre-filter candidates | High | Changes conflict semantics |
| **B** Iterate ranked until usable | Post-rank walk | High | **RECOMMENDED** |
| **C** Winner authoritative even if unusable | Status quo | Honest "unknown" | Accept for VLS-only |
| **D** Split authority vs display fallback | Two fields | Complex UI | Future |

## RECOMMENDED OPTION

**Option B** for `canonical.hv.providerSoh` selection only. Preserve conflict ranking order; after winner fails usability, try next ranked candidate. Log skipped candidates for audit.

**Provider timestamp (related gap):** **Option A** — `VehicleLatestState.tractionBatterySohPercent` without evidence `observedAt` never `providerSohUsable`. Live signal may still display under `liveState`.

## TRUTH TABLE (target)

| Rank order after conflict | First usable | Selected source |
|---------------------------|--------------|-----------------|
| reported > provider > capacity | reported | DOCUMENT/MANUAL |
| provider (stale) > capacity (fresh) | capacity | CAPACITY_ESTIMATE |
| provider (VLS-only) | none | null |

## TEST PLAN

Extend `canonical-battery-health.service` specs for iteration path; no production mutation.

## ROLLBACK

Behavior flag `BATTERY_V2_HV_SOH_ITERATE_USABLE_CANDIDATES` default OFF.

## GRAPH IDS

Gap remains until runtime merge.
