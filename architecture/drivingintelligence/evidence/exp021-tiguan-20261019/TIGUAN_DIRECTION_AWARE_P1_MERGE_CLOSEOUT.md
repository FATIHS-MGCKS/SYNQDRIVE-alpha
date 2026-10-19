# EXP021 P1 — Research merge closeout (PR #2084)

**STOP before production merge / deploy / flags.**

## Oneway policy (P1 research emission)

| OSM signal | Policy | Reverse-bearing discount |
|------------|--------|--------------------------|
| `oneway` absent (normal highway) | `DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL` | Allowed (`min(Δ_fwd, Δ_rev)`) |
| `oneway=yes` | `ONEWAY_FORWARD` | **No** (forward only) |
| `oneway=-1` | `ONEWAY_REVERSE` | **No** (reverse travel only; no forward shortcut) |
| `oneway=no` | `EXPLICIT_TWO_WAY` | Allowed |
| `junction=roundabout` / `mini_roundabout` | `IMPLICIT_ONEWAY_ROUNDABOUT` | **No** |
| `motorway` / `motorway_link` / `trunk_link` | `IMPLICIT_ONEWAY_HIGHWAY_CLASS` | **No** |
| `oneway=alternating` / `reversible` / other unsupported values | `ONEWAY_UNSUPPORTED_FORWARD_ONLY` | **No** |

Production `emissionCostFromHits` unchanged.

## Regression parity (frozen Tiguan + Tesla evidence)

- E002: **6/6**
- Tiguan reference lists (373): **333 MATCH / 33 CONFLICT / 7 UNKNOWN**
- Changed DP rows: **86** (`TIGUAN_DIRECTION_AWARE_P1_BEFORE_AFTER.csv`)
- New reference conflicts vs frozen A: **2** (`TIGUAN_DIRECTION_AWARE_P1_NEW_CONFLICTS_VS_FROZEN_A.csv`)
- Tesla: **135** way-id changes — observability only (`TESLA_DIRECTION_AWARE_P1_REGRESSION.json`)

## PR scope note

Branch `cursor/s4-route-aware-viterbi-r1-192d` bundles **route-aware Viterbi R1–R4.1** research with **EXP021 Tiguan evidence** and **direction-aware P1**. Not a single-file P1-only diff; review as combined S4 research workstream.
