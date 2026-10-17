# LDI10C Phase 3 — QC implementation audit

Read-only trace against frozen LDI-08 pin replay (no code changes).

## `computeDiV0TripIntervals`

- **File:** `backend/src/modules/vehicle-intelligence/driving-intelligence/core/compute-trip-intervals.ts`
- **Role:** Derives L3 speed per shadow bucket; sets sourceRelation via assessSourceRelationAtLabel(l3, r1, calibration)

## `assessSourceRelationAtLabel`

- **File:** `backend/src/modules/vehicle-intelligence/driving-intelligence/core/claims/cross-source-relation.ts`
- **Policy:** CONFLICT_EXPLAINED when |OBD-L3| ≥ max(abs, 25% L3); CONFLICTING in between corroboration and conflict bands; OBD INTERVAL_ONLY

## `evaluateDiV0SpeedQcInterval`

- **File:** `backend/src/modules/vehicle-intelligence/driving-intelligence/speed-qc/evaluate-di-v0-speed-qc-interval.ts`
- **Frozen pin:** LDI08 rows built with DI_V0_SPEED_QC_POLICY_V2 in ldi03-ruptela-combined-pin.lib.ts

### Trust semantics (summary)

```json
{
  "TRUSTED": "OK / high confidence numeric path",
  "TRUSTED_LIMITED": "OK_MODERATE, stationary band, etc.",
  "UNTRUSTED": "Includes CROSS_SOURCE_CONFLICT when shadow.sourceRelation is CONFLICTING or CONFLICT_EXPLAINED (before leg geometry checks)",
  "CONFLICTED_candidate_tier": "LDI-10A: L3 vs OBD at candidate endpoints ≥ max(5 km/h, 25% L3) — separate from per-bucket QC label"
}
```

## Frozen evidence vs implementation

```json
{
  "observedPattern": "All 12 UNTRUSTED buckets across eight groups: qcReasonCodes=[CROSS_SOURCE_CONFLICT] and sourceRelation CONFLICTING|CONFLICT_EXPLAINED with integer OBD/HF speeds",
  "defectFound": false,
  "note": "Behavior matches documented early-exit in evaluateDiV0SpeedQcInterval; root cause is cross-source disagreement, not missing implementation"
}
```

## Reproduction

```bash
cd backend && npm run ldi10c:phase3-root-cause
```