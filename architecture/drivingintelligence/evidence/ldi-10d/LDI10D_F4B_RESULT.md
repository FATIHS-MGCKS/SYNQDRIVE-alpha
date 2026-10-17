# LDI-10D F4-B — Ambiguous promotion evidence audit

Head: `76c203eb6a4045de011f7fe505502d7c8d0bf99c`

## Reproducibility (A)

| Check | Expected | Observed |
| --- | ---: | ---: |
| AMBIGUOUS→ASSOCIATED promotions | 36 | 36 |
| AMBIGUOUS→UNKNOWN | 119 | 119 |
| Baseline ASSOCIATED stable | 264 | 264 |
| No ASSOCIATED demotions | yes | yes |

## Decision classes (C)

| Class | Count |
| --- | ---: |
| TOPOLOGY_PLAUSIBLE | 4 |
| STILL_AMBIGUOUS | 29 |
| STRUCTURALLY_CONTRADICTED | 2 |
| INSUFFICIENT_EVIDENCE | 1 |

## Competitors within 5 m (promotions)

```json
{
  "1": 36
}
```

## Impossible graph transitions (Viterbi ASSOCIATED chain)

Count: **5**

- `2026-10-16T03:41:45Z`: 573848031 (service) → 427206838 (primary) — Non-promotion ASSOCIATED hop — Viterbi continuity cost tradeoff.
- `2026-10-16T03:46:05Z`: 72285288 (primary) → 846057098 (primary) — Non-promotion ASSOCIATED hop — Viterbi continuity cost tradeoff.
- `2026-10-16T03:50:23Z`: 256058120 (motorway) → 60126142 (motorway) — Promotion bucket on implausible graph hop — temporal prior may dominate emission.
- `2026-10-16T03:51:16Z`: 25588352 (motorway) → 96956756 (motorway_link) — Promotion bucket on implausible graph hop — temporal prior may dominate emission.
- `2026-10-16T03:51:47Z`: 245089899 (motorway_link) → 245089905 (motorway) — Non-promotion ASSOCIATED hop — Viterbi continuity cost tradeoff.

## Recurring ambiguity causes

- VITERBI_GRAPH_CONTINUITY_WIN: 33 promotion buckets
- BEARING_MISMATCH_180deg: 12 promotion buckets
- BEARING_MISMATCH_179deg: 9 promotion buckets
- BEARING_MISMATCH_178deg: 5 promotion buckets
- BEARING_MISMATCH_176deg: 2 promotion buckets
- BEARING_MISMATCH_95deg: 2 promotion buckets
- BEARING_MISMATCH_173deg: 1 promotion buckets
- BEARING_MISMATCH_80deg: 1 promotion buckets
- NARROW_VITERBI_COST_MARGIN: 1 promotion buckets
- BEARING_MISMATCH_93deg: 1 promotion buckets
- BEARING_MISMATCH_172deg: 1 promotion buckets
- BEARING_MISMATCH_174deg: 1 promotion buckets

## Candidate collapse & F4 next step

- **Justified:** NO
- **GO/NO-GO:** NO_GO
- Topology-only collapse on parallel carriageways, ramps, and service roads remains high-risk without independent road-ID ground truth.

- 5 implausible graph hops in Viterbi ASSOCIATED chain.
- 29/36 promotions remain STILL_AMBIGUOUS after topology-only review.
- Blind topology-based candidate collapse is not justified; require independent road-ID evidence or owner map review before further F4 matcher work.

## Road-ID accuracy

**NOT_ASSESSABLE** — no independent driven-road ground truth in fixtures.

## Artifacts

- `LDI10D_F4B_AMBIGUOUS_PROMOTIONS.json`
- `LDI10D_F4B_AMBIGUOUS_PROMOTIONS.csv`