# LDI-10D Phase 3A — Stop-and-go audit

## Why Phase 2B reported STOP_GO_CONTEXT_SUPPORTED=0

- Phase 2B tested stop-and-go only inside 32 maneuver windows with rule minSpeed<8 and before/after rebound within same window.
- Trip-wide standstill requires speed<=3kph; trip minimum trusted speeds largely remain above 3kph during motion.
- No 2+ second trusted standstill sequence with confirmed post-rise and pre-decel in same reconstructed chain.
- QC UNTRUSTED buckets at low speed prevent CONFIRMED classification where speed dips occur.

## Trip-wide low-speed statistics

```json
{
  "lte3Trusted": 0,
  "lte5Trusted": 0,
  "lte8Any": 15
}
```

## Phase 3A STOP_AND_GO_CANDIDATE events

Count: **0**

Maneuver-centric windows miss trip-level stop-and-go spanning gap between groups.