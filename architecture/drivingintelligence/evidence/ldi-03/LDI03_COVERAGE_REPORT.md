# LDI03 — Coverage report

Separate numeric speed coverage vs event assessability (no additive fusion score).

```json
{
  "schema": "LDI03_COVERAGE_V1",
  "shadowIntervalCount": 1090,
  "gpsL3TrustedCoverage": {
    "trustedOrLimitedBuckets": 950,
    "fractionOfShadowGrid": 0.8715596330275229
  },
  "hfCoverage": {
    "numericSpeedBuckets": 109,
    "fractionOfShadowGrid": 0.1
  },
  "obdCoverage": {
    "numericSpeedBuckets": 109,
    "fractionOfShadowGrid": 0.1
  },
  "nativeEventAvailability": {
    "drivingEventCount": 0,
    "harshBrakeRelated": 0,
    "harshAccelRelated": 0
  },
  "multiStreamOverlap": {
    "numericThreeWayPlusGps": {
      "buckets": 66,
      "fractionOfShadowGrid": 0.060550458715596334
    },
    "fourWayIncludingNativeEventOnBucket": {
      "buckets": 0,
      "fractionOfShadowGrid": 0
    },
    "note": "Not summed across sources — single-bucket conjunction only; native requires event on same bucket"
  },
  "eventAssessability": {
    "nativeBrakeOverlapRows": 0,
    "nativeAccelOverlapRows": 0,
    "insufficientEvidenceRows": 1
  },
  "positionPresentCoverage": {
    "buckets": 1086,
    "fractionOfShadowGrid": 0.9963302752293578
  }
}
```