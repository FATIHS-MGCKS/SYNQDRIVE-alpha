# Direction-aware emission P1 — safety evaluation (research)

- Algorithm pin: `9f0693bef572a065e45f5dad91ef236ba4f2ccd9`
- Emission id: `S4_RESEARCH_EMISSION_DIRECTION_AWARE_P1`
- Viterbi id: `S4_RESEARCH_VITERBI_FORWARD_V2_DIRECTION_AWARE_EMISSION_P1`

## Oneway / forbidden direction

Unit tests assert `oneway=yes`, `oneway=-1`, roundabout, and motorway_link classes do **not** apply reverse-bearing min-delta.

## Tiguan reference agreement (373 way-comparable seconds)

| Variant | MATCH | CONFLICT | UNKNOWN |
|---------|------:|---------:|--------:|
| Baseline forward Viterbi | 253 | 35 | 85 |
| P1 direction-aware emission | 333 | 33 | 7 |

E002 buckets with non-null way (P1): **6 / 6**
UNKNOWN→MATCH (reference lists): **76** (not independent accuracy)
New conflicts vs live baseline Viterbi: **2**
New conflicts vs frozen variant A (373 denom): **2**
UNKNOWN→MATCH vs frozen A: **76** (ablation B reported 83; P1 uses oneway-safe policy)
C01 window way changes: **0**

## Root cause (E002)

Bidirectional B3 primary digitized opposite to motion; P1 min heading delta aligns reverse segment bearing (~151°) with GPS (~153°).

## Merge readiness

**STOP** — research module only; baseline `emissionCostFromHits` unchanged; no production wiring.
