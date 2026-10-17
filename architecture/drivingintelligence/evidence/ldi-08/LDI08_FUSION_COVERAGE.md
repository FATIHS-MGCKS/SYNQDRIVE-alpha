# LDI08 — Fusion coverage

**Trip:** `f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9` · **Vehicle:** `8c850ff1-4201-432b-af2e-2711dbc7ca48`
**Pin:** `DI_V0_S4_EVIDENCE_V1:sha256:79635496216a2588666db3f1be87609f803d073421db6ebc64e65f7c88b264fa` (verified LDI-06 hash: **YES**)

## GPS-L3 / QC (primary reference)

- Trusted or limited buckets: **294** / **362**
- Fraction: **81.22%** (LDI-06 expected **81.22%**, Δ=0.0000pp)

## HF / OBD (corroboration only)

- HF numeric buckets: **16.85%** (61 exported rows)
- OBD numeric buckets: **16.85%** (61 exported rows)
- HF cadence: median **2000** ms between numeric HF buckets

## Multi-stream assessability

- GPS+L3 trusted + OBD numeric + HF speed conjunction: **28** seconds
- Native events on trip: **2** (cornering overlap rows: **2**)

## Policy

- No interpolation across missing HF/OBD/GPS buckets.
- OBD is corroboration only; L3 QC is primary speed reference.
- Native events are provider-reported observations, not validation labels.

```json
{
  "schema": "LDI03_COVERAGE_V1",
  "shadowIntervalCount": 362,
  "gpsL3TrustedCoverage": {
    "trustedOrLimitedBuckets": 294,
    "fractionOfShadowGrid": 0.8121546961325967
  },
  "hfCoverage": {
    "numericSpeedBuckets": 61,
    "fractionOfShadowGrid": 0.1685082872928177
  },
  "obdCoverage": {
    "numericSpeedBuckets": 61,
    "fractionOfShadowGrid": 0.1685082872928177
  },
  "nativeEventAvailability": {
    "drivingEventCount": 2,
    "harshBrakeRelated": 0,
    "harshAccelRelated": 0
  },
  "multiStreamOverlap": {
    "numericThreeWayPlusGps": {
      "buckets": 28,
      "fractionOfShadowGrid": 0.07734806629834254
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
    "buckets": 346,
    "fractionOfShadowGrid": 0.9558011049723757
  }
}
```