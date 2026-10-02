#!/usr/bin/env bash
# M3.3-HV-H3 — static contract checks (read-only CLI; H2-only evidence input).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HV_H3="$ROOT/backend/src/modules/vehicle-intelligence/battery-health/hv-h3"
HV_H2="$ROOT/backend/src/modules/vehicle-intelligence/battery-health/hv-h2"
APP_MODULE="$ROOT/backend/src/app.module.ts"

fail() { echo "H3 contract validation FAILED: $*" >&2; exit 1; }

test -d "$HV_H3" || fail "missing hv-h3 module directory"

grep -q 'M3_3_HV_H3_LONGITUDINAL_TREND_REPORT_V1' "$HV_H3/m3-3-hv-h3.constants.ts" \
  || fail "missing H3 report contract version"
grep -q 'METHOD_IDENTITY_REQUIRED = true' "$HV_H3/m3-3-hv-h3.constants.ts" \
  || fail "METHOD_IDENTITY_REQUIRED must be true"
grep -q 'CROSS_METHOD_POOLING_DEFAULT = false' "$HV_H3/m3-3-hv-h3.constants.ts" \
  || fail "CROSS_METHOD_POOLING_DEFAULT must be false"
grep -q 'CROSS_PROVIDER_POOLING_DEFAULT = false' "$HV_H3/m3-3-hv-h3.constants.ts" \
  || fail "CROSS_PROVIDER_POOLING_DEFAULT must be false"
grep -q 'H3_AUTOMATIC_RUNTIME_REACHABLE = false' "$HV_H3/m3-3-hv-h3.constants.ts" \
  || fail "H3_AUTOMATIC_RUNTIME_REACHABLE must be false"
grep -q 'runM3_3HvH2LongitudinalInputReport' "$HV_H3/m3-3-hv-h3-trend-report.service.ts" \
  || fail "H3 must consume H2 report only"
grep -q 'buildM3_3HvH3LongitudinalTrendReportV1' "$HV_H3/m3-3-hv-h3-series-builder.ts" \
  || fail "missing pure H3 builder"
grep -q 'M3_3_HV_H3_M2_SESSION_AGGREGATION' "$HV_H3/m3-3-hv-h3.constants.ts" \
  || fail "M2 session balancing must be declared"
grep -q 'THEIL_SEN_MEDIAN_PAIRWISE_SLOPE_V1' "$HV_H3/m3-3-hv-h3.constants.ts" \
  || fail "missing Theil-Sen estimator version"
grep -q 'degradationConclusion: null' "$HV_H3/m3-3-hv-h3-series-builder.ts" \
  || fail "degradationConclusion must remain null"
grep -q 'healthConclusion: null' "$HV_H3/m3-3-hv-h3-series-builder.ts" \
  || fail "healthConclusion must remain null"
grep -q 'customerPublicationEligible: false' "$HV_H3/m3-3-hv-h3-series-builder.ts" \
  || fail "customerPublicationEligible must be false"
grep -q 'CALENDAR_TIME' "$HV_H3/m3-3-hv-h3.constants.ts" \
  || fail "H3 V1 exposure axis must be CALENDAR_TIME"
grep -q 'validationContext' "$HV_H3/m3-3-hv-h3-series-builder.ts" \
  || fail "GT validation context must be preserved separately from fit points"
grep -q 'validateM3_3HvH3CandidateInputContract' "$HV_H3/m3-3-hv-h3-input-contract.util.ts" \
  || fail "H3 must validate H2 method contracts at boundary"
grep -q 'DUPLICATE_M3_SESSION_EVIDENCE' "$HV_H3/m3-3-hv-h3.constants.ts" \
  || fail "M3 duplicate session anomaly code required"
grep -q 'M3_3_HV_H3_RELATIVE_DIFFERENCE_REFERENCE' "$HV_H3/m3-3-hv-h3.constants.ts" \
  || fail "relative difference reference must be declared"
grep -q 'resolveM3_3HvH3MaxPointsPerSeries' "$HV_H3/m3-3-hv-h3-report-bounds.util.ts" \
  || fail "maxPointsPerSeries bounds validation required"
grep -q 'buildM3_3HvH3ExposureAxisAuditV1(h2.truncated)' "$HV_H3/m3-3-hv-h3-series-builder.ts" \
  || fail "exposure audit must propagate H2 truncation"
grep -q 'inputAnomalies' "$HV_H3/m3-3-hv-h3-series-builder.ts" \
  || fail "H3 report must surface input anomalies"

if grep -rq 'hv-h3' "$APP_MODULE" 2>/dev/null; then
  fail "hv-h3 must not be registered in app.module.ts (H3_AUTOMATIC_RUNTIME_REACHABLE=NO)"
fi

if grep -rqE "rest-session-features/longitudinal/|f5-natural-calibration|evaluateM3_3E_" "$HV_H3" 2>/dev/null; then
  fail "hv-h3 must not import LV D3/F5/E2/E3 pipelines"
fi

if grep -rq 'SHADOW_ROLLING_MEDIAN' "$HV_H3/m3-3-hv-h3-series-builder.ts" 2>/dev/null; then
  grep -q 'legacyDerivedContext' "$HV_H3/m3-3-hv-h3-series-builder.ts" \
    || fail "SHADOW_ROLLING_MEDIAN must be legacy context only"
fi

echo "M3.3-HV-H3 domain contracts: OK"
