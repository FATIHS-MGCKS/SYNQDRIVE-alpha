# EXP021 P1 — Final research safety gate

**PR:** #2084 · **HEAD:** `d38c1c4e4b1b22386445cfe5346ad525a1f3cf32` · **Mode:** offline read-only · **NO MERGE**

Reference uncertainty: device UTC ±1 s not independently calibrated; reference way lists are multi-way and not metric ground truth.

## Tiguan — 86 changed DP rows (policy on chosen P1 way)

| Policy bucket | Row count |
|---------------|----------:|
| EXPLICIT_BIDIRECTIONAL (oneway=no) | 0 |
| INFERRED_BIDIRECTIONAL_DEFAULT (no oneway tag) | 86 |
| EXPLICIT_ONEWAY | 0 |
| IMPLICIT_ONEWAY (roundabout / motorway_link) | 0 |
| UNSUPPORTED_OR_AMBIGUOUS | 0 |

Rows where P1 applied **reverse** orientation under an allowed bidirectional policy: **86** / 86.

Rows with **improper** REVERSE under oneway/implicit-oneway policy: **0** (must be 0).

INFERRED_DEFAULT rows using reverse discount: **86** — mechanism risk if true oneway untagged; see UNKNOWN_POLICY_RISK.

**Preserved artifacts:** `TIGUAN_DIRECTION_AWARE_P1_BEFORE_AFTER.csv` (86 rows unchanged), E002 recovery **6/6**.

Detail: `TIGUAN_DIRECTION_AWARE_P1_86_POLICY_AUDIT.csv`

## UNKNOWN_DEFAULT bidirectional risk (task 3)

All **86** Tiguan transitions that flipped under P1 selected a P1 way with **no `oneway` tag** → `DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL`. In every row P1 used **REVERSE** segment orientation (reverse-bearing discount). **Zero** rows applied REVERSE on `oneway=yes`, `oneway=-1`, roundabout, or `motorway_link` chosen ways (**improper_reverse=0**).

**Interpretation:** The mechanism risk is **latent untagged one-ways** in OSM, not a policy-code violation on tagged geometry in this 86-row set. Reference list `401665362` at 10:31:03–04Z is tagged `oneway=yes` but was **not** in the top-4 candidate set at GPS — P1 could not “illegally” discount reverse on that way because it was never emitted.

## New conflicts vs frozen A (10:31:03–04Z) — independent review (task 4)

**Reference (video/OSM list, ±1 s):** `401665362;442110883` — **37915960 is not** in the reference multi-way list.

## 2026-10-19T10:31:03Z

- Way 401665362: policy=ONEWAY_FORWARD, oneway=yes, highway=residential
  not in top-4 candidates at GPS
- Way 442110883: policy=DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL, oneway=absent, highway=residential
  dist=4.95m fwdBear=166.9 p1_emit=9.896170087934813 orient=REVERSE base_emit=197.49973909844527
- Way 37915960: policy=DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL, oneway=absent, highway=residential
  dist=3.09m fwdBear=88.1 p1_emit=6.181282972156682 orient=REVERSE base_emit=199.76546028307797
- Baseline way: NULL
- P1 way: 37915960
- Candidates: 37915960,442110883,205795202

## 2026-10-19T10:31:04Z

- Way 401665362: policy=ONEWAY_FORWARD, oneway=yes, highway=residential
  not in top-4 candidates at GPS
- Way 442110883: policy=DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL, oneway=absent, highway=residential
  dist=9.48m fwdBear=166.9 p1_emit=134.94281196647077 orient=REVERSE base_emit=182.96030699402237
- Way 37915960: policy=DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL, oneway=absent, highway=residential
  dist=1.82m fwdBear=66.3 p1_emit=3.6323724493749108 orient=REVERSE base_emit=199.0575099776315
- Baseline way: NULL
- P1 way: 37915960
- Candidates: 37915960,442110883,205795202

**Verdict (reference-side, not ground truth):** Baseline was **UNKNOWN** (NULL). P1 assigns **37915960** (~3 m, REVERSE heading fit) over **442110883** (~5–10 m, also REVERSE-fit but higher distance cost). Reference includes **442110883** (untagged bidirectional) but **not 37915960** → labeled **CONFLICT** under strict list membership. **401665362** (`oneway=yes`) is reference-listed but **not** a nearby candidate — cannot validate one-way compliance against that hypothesis at this GPS fix. **Reference uncertainty applies** (multi-way list + ±1 s).

## Tesla — 135 way-id changes

| Policy bucket (chosen P1 way) | Count |
|-------------------------------|------:|
| INFERRED_BIDIRECTIONAL_DEFAULT | 107 |
| EXPLICIT_BIDIRECTIONAL (`oneway=no`) | 27 |
| EXPLICIT_ONEWAY | 1 |
| IMPLICIT_ONEWAY | 0 |

- Improper reverse on chosen P1 way: **0**
- New CONFIRMED hops with no graph reachability from prev: **0** (baseline had 2; compare regression JSON)
- New UNKNOWN vs baseline: **0** · New AMBIGUOUS vs baseline: **22**

Detail: `TESLA_DIRECTION_AWARE_P1_135_WAY_CHANGE_AUDIT.csv`

## Production scope

- `emissionCostFromHits` in `viterbi-dp-costs.ts` — research grep shows P1 only in `s4-research/*` and `scripts/research/*`
- No worker / feature-flag imports of direction-aware P1 detected in audit script scope

## OUTPUT block

```
DIRECTION_POLICY_BREAKDOWN=EXPLICIT_BIDIR:0;INFERRED_DEFAULT:86;EXPLICIT_ONEWAY:0;IMPLICIT_ONEWAY:0;UNSUPPORTED:0
UNKNOWN_POLICY_RISK=86_INFERRED_DEFAULT_REVERSE_ROWS;IMPROPER_REVERSE=0
NEW_CONFLICT_2_REVIEW=BASELINE_UNKNOWN;P1_WAY_37915960_NOT_IN_REF_LIST;REF_442110883_WAS_CANDIDATE;REF_401665362_ONEWAY_NOT_IN_TOP4;REFERENCE_UNCERTAINTY_APPLIES
E002_PARITY=6/6
TESLA_SAFETY_REGRESSION=way_changes=135;improper_reverse=0;topo_impossible_p1=0;new_unknown=0
PRODUCTION_SCOPE_ISOLATED=YES_RESEARCH_ONLY
REQUIRED_CI=NOT_GREEN_AT_HEAD_d38c1c4e4;FAIL_S4_unit_suites_S4A-S4F;FAIL_VehicleDetail_Typecheck;MANY_PENDING;module_registry_PASS
RESEARCH_MERGE_VERDICT=STOP_NO_MERGE
```
