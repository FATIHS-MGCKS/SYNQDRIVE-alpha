# LDI-10D Phase 3E — Evidence quality integration

## Phase 3D inputs (unchanged authority)

| Metric | Value |
| --- | --- |
| TRUSTED_SPEED buckets | 775 |
| QC_UNTRUSTED tags | 347 |
| ROW_ABSENT | 269 |
| Recoverable (research estimate) | ~91 (not measured; trusted-speed authority unchanged) |

## Contextual events vs QC

{
  "eventsTotal": 66,
  "completeEvidence": 60,
  "partialEvidence": 3,
  "qcBlocked": 3,
  "spatiallyAmbiguous": 66,
  "contextSupported": 31,
  "unassessable": 0,
  "byClassification": {
    "OBSERVED": 27,
    "CONTEXT_SUPPORTED": 31,
    "INFERRED_CANDIDATE": 7,
    "UNKNOWN": 1
  }
}

QC gaps and ROW_ABSENT reduce junction/curve confidence but do not interpolate missing GPS.