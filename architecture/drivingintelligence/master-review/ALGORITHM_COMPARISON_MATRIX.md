# Algorithm Comparison Matrix

**Base SHA:** `0a16ffb5b0add0bec30fefc4e55a41973428677b` (`origin/main`).  
**Implementation status:** CONFIRMED = identifier on main @ base SHA; AMBIGUOUS = branch/open PR; UNKNOWN = not found.

**Validation tier (per variant):** MEASURED | INDEPENDENTLY_VALIDATED | DRIVER_REPORTED | PROXY_ONLY | SIMULATED | NOT_VERIFIED — **CONFIRMED code ≠ higher accuracy.**

## Summary matrix (authority)

| ID | Variant | Code ID / version | Pin SHA (main) | Objective | Evidence used | Compute | GT independent | Env | Status |
|----|---------|-------------------|----------------|-----------|---------------|---------|----------------|-----|--------|
| A | Production S4 / Route V2 shadow | S4 shadow + pinned `DI_V0_S4_EVIDENCE_V1` | main | Work-item completion, pinned replay | S4D snapshot, L3 read-only | Full trip async | NO | Production shadow path | CONFIRMED library; activation REPORTED gated |
| B | Baseline bucket matcher | `S4_RESEARCH_BASELINE_BUCKET_V2` | #2065 merge | Min local distance per bucket | GPS buckets, OSM V2 | O(buckets×candidates) | NO | Research | CONFIRMED |
| C | Viterbi forward | `S4_RESEARCH_VITERBI_FORWARD_V2` | #2065 | Forward DP score | + heading/topology hooks | O(buckets×states) | NO | Research | CONFIRMED |
| D | Viterbi backpointer | decoder R1 | PR #2081 **OPEN** | Backtrack best path | Same as C + backptr | Higher memory | NO | Research branch | AMBIGUOUS on main |
| E | Strict OSM node-id topology | topology R1 | #2082 `784c4b0c…` | Adjacency from node IDs | OSM topology graph | Parse + replay | NO | Research | CONFIRMED merged |
| F | Directed routing | one-way penalties | in s4-research / route PR | Penalize illegal direction | way direction tags | INFERRED medium | NO | Research | CONFIRMED partial |
| G | Route-aware R1–R4.1 | route-aware Viterbi | #2084 `cf20c49f…` | Route-constrained DP | + route context | INFERRED higher | NO | Research | CONFIRMED merged |
| H | Direction-aware emission P1 | P1 emission | #2085 + harness | Heading-aware emission | GPS heading provenance | Tiguan/Tesla replay | NO | Shadow + research | CONFIRMED |
| I | B6 safety gates | admission gates | branch `180c74da8`… | Block unsafe promotions | Policy CSV audits | Offline | NO | Research branch | **NOT on main** |
| J | Legacy geometry V1 | `LDI10D_LEGACY_GEOMETRY_V1` | pins JSON | Historical replay only | Frozen pins | — | NO | Offline artifact | CONFIRMED |

## Tesla 1136-bucket replay (REPORTED — PR B evidence)

| Algorithm | ASSOCIATED | AMBIGUOUS | UNKNOWN |
|-----------|------------|-----------|---------|
| Baseline V2 | 264 | 512 | 360 |
| Viterbi forward V2 | 300 | 357 | 479 |

**Comparability warning (VERIFIED):** Different decoders change UNKNOWN mass — do not treat ASSOCIATED delta as accuracy.

## Tiguan variants A–E

Source: `exp021-tiguan-20261019/TIGUAN_A_B_C_D_E_COMPARISON.csv` — **REPORTED** same fixture, comparable decoder definitions per file header.

## Physical plausibility

| Issue | Variants affected |
|-------|-------------------|
| Service road false attach | B, C (REPORTED Tiguan failure cases) |
| Impossible graph hop | C, G — F4-B flags |
| Reverse on one-way | F, H |
| Grade-separated crossover | All using 2D node adjacency |

## Extended attributes

| ID | Merge / pin commit (main) | Inputs | Output | Runtime | Coverage | Validation tier | Error classes | Production | Pros | Cons | Risks |
|----|---------------------------|--------|--------|---------|----------|-----------------|---------------|------------|------|------|-------|
| A | S4 shadow stack @ `0a16ffb5b` | Pinned S4D gzip, L3 read-only | Work item COMPLETED + road hypotheses | Async worker | Fleet allowlist gated | NOT_VERIFIED accuracy | FAILED, kill, budget | Deployed path REPORTED | Pinned replay | Ops complexity | False prod activation |
| B | #2065 | 1 Hz buckets, OSM V2 | Per-bucket baseline hypothesis | Library O(n×k) | Tesla 1136 buckets | MEASURED counts only | AMBIGUOUS, UNKNOWN | Research | Simple | No global path | Service roads |
| C | #2065 | + forward DP | Separate Viterbi stream | Library | Same fixture | MEASURED counts | +graph conflict | Research | Global consistency | UNKNOWN mass ↑ | Overfit fixture |
| D | **#2081 OPEN** | C + backpointer | Decoded path | NOT on main | NOT_VERIFIED | SIMULATED branch | — | None | Optimal path retrieval | Not merged | Stale branch |
| E | #2082 | Node-id adjacency | Topology R1 replay | Library | Tiguan four-way replay REPORTED | NOT_VERIFIED | False adjacency at rounded nodes | Research | Stricter graph | No layer/level | Grade sep |
| F | #2084 family | Directed ways | Penalized transitions | Library | Frozen routes | NOT_VERIFIED | Reverse drive | Research | One-way plausibility | Penalty tuning | Wrong OSM dir |
| G | #2084 | Route context | Route-aware Viterbi | Library | Offline harness | NOT_VERIFIED | Route mismatch | Research | Corridor constraint | Compute | Bad route input |
| H | #2085 | Heading emission P1 | Shadow wiring + harness | Shadow REPORTED | Tesla+Tiguan | PROXY_ONLY audits | 135 way changes Tesla | Shadow | Heading signal use | NO_ACCURACY_CLAIM | Regression unknown |
| I | `180c74da8` **not on main** | P1 policy CSV | Gate promotions | Harness only | 2-trip REPORTED | SIMULATED | improper_reverse=0 REPORTED | None | Safety guard | Not merged | Drift from P1 prod |
| J | pins only | V1 geometry | Historical diff | Offline | 488/1136 diff | MEASURED label delta | Projection bug | None | Audit trail | Obsolete | Misleading if reused |

Merge commits (VERIFIED via GitHub): #2065 `6311d8c375dc5652bd64212ca4ed208175dc8148` (source lineage PR B doc); #2082/#2084/#2085 — see [EVOLUTION_TIMELINE.md](./EVOLUTION_TIMELINE.md).
