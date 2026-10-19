# Tiguan E002 — Heading / Emission Root Cause R2

**Pin:** `9f0693bef572a065e45f5dad91ef236ba4f2ccd9` · **Trip:** 632dc9c5-a8d9-45ce-a269-abe89d22d677 · **Mode:** offline research only

## Phase 1 — Heading provenance (E002 window)

See `TIGUAN_E002_HEADING_PROVENANCE.csv`.

**Summary:** GPS displacement **~18.6 m/s** (~**67 km/h** implied) — **reliable movement heading** (~152–156°).  
Way **5048137** (B 3 primary, **no `oneway` tag**, `cutting=yes`) — closest segment bearing **~331°** forward / **~151°** reverse.  
Baseline compares heading only to **forward** digitization → **~178° delta** → heading emission **~228** + distance **~2** vs **NULL state 100**.

## Phase 2 — Direction validation (E002 instance)

| Scenario | Applies to E002? |
|----------|------------------|
| 1. Bidirectional road, reversed OSM geometry vs motion | **YES** — primary explanation |
| 2. True one-way, correct direction | No (`oneway` absent) |
| 3. True one-way, forbidden direction | No |
| 4. Nearly stationary / jitter | No (18 m/s) |
| 5. Moving with reliable heading | **YES** |
| 6. GPS gaps | No (PRESENT) |
| 7. Underpass parallel way competition | Weak — single dominant candidate within 25 m |

## Phase 3 — Ablation (mechanism, not tuned to labels)

| Mode | Mechanism | E002 buckets with non-null way |
|------|-----------|-------------------------------|
| A | Frozen baseline emission | 0 / 6 |
| B | Min heading delta to forward **or** reverse segment bearing | 6 / 6 |
| C | Skip heading penalty if displacement < 8 m | 0 / 6 |
| D | B + C | 6 / 6 |

**Mechanism resolving ~178° mismatch:** **B (direction-aware segment orientation)** — not C (displacement is reliable).

## Phase 4 — Full trip vs 373 way-comparable seconds

`TIGUAN_E002_ABLATION_METRICS.csv` — trip-wide agreement counts (reference lists, ±1 s not re-swept).

**B vs frozen A (373 denominator):** new matches **95**, new conflicts **8**, new UNKNOWN **0** (mostly UNKNOWN→MATCH on reference lists — **not** independent ground truth).

| Ablation | Match | Conflict | UNKNOWN | Note |
|----------|-------|----------|---------|------|
| A (baseline emission) | 253 | 35 | 85 | Parity with frozen Forward V2 |
| B (bidirectional bearing) | 347 | 24 | 2 | −11 conflicts vs A; −83 UNKNOWN |
| C (displacement gate only) | 334 | 10 | 29 | Does **not** fix E002 (displacement reliable) |
| D (B+C) | 365 | 8 | 0 | **Do not** equate 0 UNKNOWN with accuracy |

**35 baseline conflicts:** Trip-wide reference-list conflicts **35→24** under B, with **8** newly conflicting seconds vs frozen A.

**85 baseline UNKNOWN:** **83** become MATCH under B on the same denominator — bidirectional heading orientation, including all **6** E002 seconds.

**C01 Hebbel/Schwab:** Decoder geometry already on Hebbel; reference label risk remains non-decoder.

**13 prior variant-diff buckets:** Not re-simulated in R2; bidirectional ablation may affect parallel B-3 segments — per-bucket review still required.

## Phase 5 — Causal verdict

```
E002_HEADING_SOURCE=GPS_DISPLACEMENT_BEARING_PREV_TO_CUR_BUCKET
E002_DISPLACEMENT_RELIABILITY=RELIABLE (~18m/s, ~67km/h implied)
OSM_DIRECTION_REVERSED=YES_SEGMENT_FORWARD_BEARING_OPPOSITE_TO_MOTION (~331° vs ~153°)
OSM_ONEWAY_CONSTRAINT=NONE_TAGGED_BIDIRECTIONAL_PRIMARY
HEADING_COST_ROOT_CAUSE=BASELINE_EMISSION_USES_UNORIENTED_SEGMENT_BEARING_ONLY
NULL_DP_BEHAVIOR=NULL_EMIT_100_BEATS_HIGH_HEADING_PENALTY_PATH
ABLATION_A_B_C_D=A:0/6 ways; B:6/6; C:0/6; D:6/6
NEW_MATCHES(B_vs_frozen_A)=95
NEW_CONFLICTS(B_vs_frozen_A)=8
NEW_UNKNOWN(B_vs_frozen_A)=0
C01_REFERENCE_REVIEW=UNCHANGED_DECODER_ALREADY_ON_HEBBEL_WAY; NOT_E002_SCOPE
INDEPENDENT_ACCURACY=NOT_CLAIMED; REFERENCE_MULTI_WAY_LISTS
NEXT_MINIMAL_FIX=Research/orientation: use min(Δheading, Δheading_rev) on non-oneway ways OR gate heading penalty when reverse orientation fits within bearingCompatDeg
FINAL_VERDICT=E002_UNKNOWN_CAUSED_BY_OPPOSITE_DIGITIZATION_BEARING_IN_EMISSION_NOT_BY_MISSING_GPS_OR_ONEWAY_VIOLATION
```

Runtime harness: 5468 ms
