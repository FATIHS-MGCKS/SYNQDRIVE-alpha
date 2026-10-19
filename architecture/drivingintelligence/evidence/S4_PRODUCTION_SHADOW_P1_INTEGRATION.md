# S4 production shadow — Direction-Aware Emission P1

**Status:** integration PR (research worker only). **Not** product authority.

## Flag (default OFF)

`DI_V0_S4_RESEARCH_DIRECTION_AWARE_EMISSION_P1_ENABLED` — requires existing road-matching research flags (`DI_V0_S4_RESEARCH_*`).

## Cohort (vehicle UUID allowlists, not DIMO tokenId)

| Vehicle | `vehicleId` | DIMO token |
|---------|-------------|------------|
| VW Tiguan WOB L 7503 | `19fedd4b-c4e8-4de8-a125-dab293326e7e` | 192922 |
| Tesla KS FH 660E | `68868291-5478-42cd-b0c4-cc77b2a78e21` | 186946 |

Set via `DI_V0_S4_RESEARCH_VEHICLE_ALLOWLIST` when enabling shadow (together with org allowlist).

## Route-Aware R4.1

Remains **offline / batch** (`scripts/research/*`, `s4-research` library). **Not** wired into `di-v0-s4-research-processor` synchronous path.

## Non-authoritative outputs

P1 results are stored under `windowsJson[].nonAuthoritativeShadowDecoders.directionAwareEmissionP1` with `authoritativeForProduct: false` and `evidenceClassification: COMPUTATIONAL_CANDIDATE_ONLY`. Forward V2 `viterbi` track unchanged.
