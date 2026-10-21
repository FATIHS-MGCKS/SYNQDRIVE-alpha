# EXP021 Phase 5A — Frozen variants M5, M7A, M7

Binding: research git `477ecad737294efbf18472cf8d903d447ca1e397` on branch `cursor/di-master-architecture-research-20261021`.
Decoder composition is implemented in the **research harness** (`phase3_lib.ts`); product `s4-research` library primitives are used 1:1 where noted. These variants are **research candidates**, not production matchers.

## Shared stack (all three)

| Layer | Implementation | Source (worktree-relative) |
|---|---|---|
| Candidate generation | `nearestWayCandidates`, top-K | `s4-research/osm-parse` |
| Segmenting | flush on non-`PRESENT` GPS buckets | `phase3_lib.decodeGeneric` |
| Decode | Viterbi **backtrack** R1 (not forward greedy) | `phase3_lib.decodeSegmentGeneric` + library parity for M5 base |
| Emission | **Direction-aware P1** | `s4-research/emission-direction-aware-p1` |
| Transition | **Route-aware R4.1** (Dijkstra between projections) | `s4-research/viterbi-matching-route-aware`, `route-query`, `route-aware-transition` |
| Headings (input) | consecutive fix bearing | `baselineHeadings()` → `geo.bearingDeg` |
| Temporal mode | **offline batch**: full trip bucket grid, 1 Hz UTC labels | loaders build `Bucket[]` from pinned grids / S4 containers |
| OSM | frozen Overpass `elements[]` with geometry, corridor margin **75 m** | `buildRoadContextFromOverpass` |
| Algorithm config | `DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG` | `s4-research/config.ts` |
| Route config | `DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG` | `s4-research/route-aware-config.ts` |

### `DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG` (frozen values)

| Field | Value |
|---|---|
| `uncertaintyRadiusM` | 25 |
| `signalSearchRadiusM` | 35 |
| `bearingCompatDeg` | 45 |
| `competitorGapM` | 5 |
| `viterbiTopK` | 4 |
| `junctionAttachMaxM` | 45 |

### `DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG` (frozen values)

| Field | Value |
|---|---|
| `maxRoutingExpansions` | 12000 |
| `maxRouteDistanceM` | 8000 |
| `l3MinTrustSpeedKmh` | 8 |
| `l3SpeedSlackFactor` | 1.85 |
| `fallbackMaxPlausibleSpeedKmh` | 130 |
| `weightRouteDistancePerM` | 0.02 |
| `weightTimeViolationPerKmh` | 4 |
| `weightTopologyUncertainty` | 6 |
| `weightDirectionChange` | 3 |
| `penaltyDirectionForbidden` | 1000000 |
| `penaltyRouteNotFound` | 250 |

### Input bucket schema (research harness)

Each second: `bucketLabelUtc` (ISO UTC), `availability` ∈ {`PRESENT`,`ROW_ABSENT`,…}, `latitude`/`longitude` when present, optional `l3SpeedKmh` (from pinned grid or shadow join), optional `qcTrustLevel`.

---

## M5 — frozen definition

**Description:** Backtrack + P1 emission + Route-Aware R4.1; **legacy GAP confidence** (library competitor-gap semantics).

**`runModel` options:**

```text
emission: P1
transition: ROUTE_AWARE
decode: BACKTRACK
confidence: GAP
graph: <directed routing graph>
nullMemory: false
standstillGuardM: undefined
headings: baselineHeadings(buckets)  // unguarded
```

**Confidence (GAP):** `CONFIRMED` iff chosen way is in candidates and (single candidate OR distance(2nd) − distance(1st) ≥ `competitorGapM` (= 5 m)). **Independent of whether the chosen way is nearest** (known structural defect; see Phase 3 T2 analysis).

**Library note:** No single library export named “M5”; composed in harness. Primitives `buildViterbiMatchesRouteAwareR4_1` uses legacy emission when not using P1 path — M5 uses composed P1 + route-aware backtrack DP in `decodeSegmentGeneric`.

---

## M7A — frozen definition

**Description:** M5 path + **cost/evidence calibration** (heading guard, standstill same-way guard, null-state memory); still **GAP** confidence.

**Heading guard** (`guardedHeadings`, defaults):

| Rule | Threshold |
|---|---|
| Null heading if consecutive displacement | **< 1.5 m** |
| Null heading if L3 on current bucket | **< 5 km/h** (when L3 present) |

**`runModel` options:**

```text
emission: P1
transition: ROUTE_AWARE
decode: BACKTRACK
confidence: GAP
graph: <directed routing graph>
nullMemory: true
standstillGuardM: 2
headings: guardedHeadings(buckets, baselineHeadings(buckets))  // 1.5 m, 5 km/h
```

**Mechanisms:**

- **nullMemory:** off-road (null) states remember `last` on-road way; re-entry pays topological transition from `last` (closes null→way teleport bypass).
- **standstillGuardM = 2:** same-way transition cost forced to **0** when GPS displacement **< 2 m** (closes R4.1 oneway backward-jitter hazard).

---

## M7 — frozen definition

**Description:** M7A path + **margin ∧ gap** confidence calibration (thresholds frozen in Phase 2/3; **not tuned in Phase 4/5A**).

**`runModel` options:** same as M7A except:

```text
confidence: MARGIN_AND_GAP
marginTau: 10
```

**Confidence (MARGIN_AND_GAP):** For each decided second, `pathMargin` = second-best DP cost − chosen cost (Viterbi forward–backward decomposition in harness). Then:

- `CONFIRMED` iff `pathMargin ≥ 10` **AND** chosen way is **nearest** hit **AND** legacy GAP would be `CONFIRMED` (nearest-gap ≥ 5 m).
- Otherwise `AMBIGUOUS` (if way chosen) or `UNKNOWN`.

**Cost-unit note:** route distance weight 0.02/m ⇒ margin τ=10 ≈ **5 m** equivalent gap scale (Phase 3 documentation).

**Abstention variants (out of scope for this freeze):** `M5ABST`, `M7ABST` (gap ≥ 15 m), `M8` (posterior), `M7C` (displacement-only guard) — documented in `phase3_lib.snapshot.ts` but not part of the 5A freeze triple.

---

## Entry points and reproducible invocation

| Purpose | Command |
|---|---|
| Full Phase 3 real-drive benchmark (4 drives, all models) | See `REPRODUCE.md` §1 |
| Phase 5A smoke (Tiguan dev set, M5/M7A/M7 only) | See `REPRODUCE.md` §2 |

**Pinned harness library:** `/opt/cursor/artifacts/exp021-phase5a-baseline-freeze/scripts/phase3_lib.snapshot.ts` (sha in `FREEZE_MANIFEST.json`). Canonical working copy remains `/opt/cursor/artifacts/exp021-scientific-audit-phase3/scripts/phase3_lib.ts` (must match snapshot sha for freeze).

**Vendored dependency (M6 only, not M5/M7A/M7):** `/opt/cursor/artifacts/exp021-scientific-audit-phase2/scripts/vendored_b6_180c74da8/` @ parent commit `180c74da8` — listed for completeness, unused by frozen triple.
