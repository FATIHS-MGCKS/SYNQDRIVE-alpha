# LDI10C Phase 3 — Control comparison (acceleration only)

Compare **8 UNCLEAR** vs **8 PLAUSIBLE** acceleration groups (16/16 accel groups on trip).

| Feature (mean) | UNCLEAR accel | PLAUSIBLE accel |
|--------------|---------------|-----------------|
| UNTRUSTED buckets in window | 1.50 | 0.00 |
| CONFLICTING sourceRelation buckets | 1.50 | 0.00 |
| CONFLICTED candidate steps | 2.00 | 0.00 |
| OBD-present buckets | 2.25 | 0.50 |
| Mean |accel| m/s² | 1.26 | 1.40 |
| Duration ms | 3000.00 | 2000.00 |

## Systematic bias

```json
{
  "accelClassOnlyBecauseAllUnclearAreAccel": true,
  "discriminator": "Among 16 acceleration groups, UNCLEAR ⊆ those with ≥1 CONFLICTING/CONFLICT_EXPLAINED sourceRelation bucket inside maneuver window",
  "plausibleAccelConflictingBuckets": true,
  "qcPipelineNote": "UNTRUSTED is applied when S1 marks cross-source conflict; occurs when sparse integer OBD is present and disagrees with L3 — not an acceleration-specific QC rule",
  "thresholdModification": "NONE — read-only phase"
}
```

**Conclusion:** UNCLEAR acceleration groups are exactly those whose maneuver windows intersect S1 `sourceRelation` CONFLICTING/CONFLICT_EXPLAINED buckets (integer OBD vs L3). Plausible acceleration groups have **zero** such buckets despite OBD presence on some windows.