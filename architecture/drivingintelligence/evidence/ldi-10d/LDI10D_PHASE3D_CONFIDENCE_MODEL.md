# Phase 3D confidence model (research)

Weighted evidence checklist per bucket — **not** MAE-calibrated probability.

```json
{
  "schema": "LDI10D_PHASE3D_CONFIDENCE_MODEL_V1",
  "headSha": "0cabca3af016583ae452b91eef32fb41c1317488",
  "purpose": "Evidence-only confidence — NOT calibrated accuracy",
  "notAccuracyClaim": "Scores reflect observable support (position, gaps, QC, abstention). Not validated as error probability without independent reference calibration.",
  "features": [
    "position_present",
    "not_row_absent",
    "not_frozen_coordinate",
    "regular_timestamp",
    "not_geometry_outlier_inferred",
    "trusted_qc",
    "replay_l3_numeric"
  ],
  "bands": {
    "HIGH": ">=0.75",
    "MEDIUM": ">=0.5",
    "LOW": ">=0.25",
    "NONE": "<0.25"
  },
  "distribution": {
    "HIGH": 790,
    "MEDIUM": 0,
    "LOW": 346,
    "NONE": 0
  }
}
```