# Technical code diff — direction-aware emission P1

## New files (research-only)

- `s4-research/emission-direction-aware-p1.ts` — `resolveWayTravelDirectionPolicy`, `headingDeltaForTravelPolicy`, `emissionCostFromHitsDirectionAwareP1`
- `s4-research/viterbi-matching-direction-aware-p1.ts` — forward Viterbi DP with P1 emission
- `s4-research/__tests__/emission-direction-aware-p1.unit.spec.ts`

## Unchanged

- `viterbi-dp-costs.ts` `emissionCostFromHits` (production-parity baseline)
- Transition model, NULL cost 100, candidate radius, TOP_K

## Policy summary

| OSM signal | Eligible orientations for heading |
|------------|-----------------------------------|
| (none) / unknown | min(Δ_fwd, Δ_rev) |
| oneway=no | min(Δ_fwd, Δ_rev) |
| oneway=yes | forward only |
| oneway=-1 | reverse only |
| junction=roundabout | forward only |
| motorway_link class | forward only |
