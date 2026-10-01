#!/usr/bin/env bash
# M3.3-HV-H4 — static contract checks (read-only coverage report; no cumulative exposure).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HV_H4="$ROOT/backend/src/modules/vehicle-intelligence/battery-health/hv-h4"
APP_MODULE="$ROOT/backend/src/app.module.ts"

fail() { echo "H4 contract validation FAILED: $*" >&2; exit 1; }

test -d "$HV_H4" || fail "missing hv-h4 module directory"

grep -q 'M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1' "$HV_H4/m3-3-hv-h4.constants.ts" \
  || fail "missing H4 exposure source authority version"
grep -q 'H4_AUTOMATIC_RUNTIME_REACHABLE = false' "$HV_H4/m3-3-hv-h4.constants.ts" \
  || fail "H4_AUTOMATIC_RUNTIME_REACHABLE must be false"
grep -q 'EXISTING_RETENTION_AGGREGATES_PRESERVE_CHARGE_THROUGHPUT = false' "$HV_H4/m3-3-hv-h4.constants.ts" \
  || fail "retention aggregate charge throughput flag must be false"
grep -q 'NATIVE_FALLBACK_CHARGING_ADDED_SEMANTIC_EQUIVALENCE_PROVEN = false' "$HV_H4/m3-3-hv-h4.constants.ts" \
  || fail "native/fallback semantic equivalence must remain unproven"
grep -q 'buildM3_3HvH4ExposureSourceAuthorityContractV1' "$HV_H4/m3-3-hv-h4-exposure-source-authority.v1.ts" \
  || fail "missing exposure source authority builder"
grep -q 'cumulativeExposureValues: false' "$HV_H4/m3-3-hv-h4-coverage-report.builder.ts" \
  || fail "coverage report must not emit cumulative exposure values"
grep -q 'VehicleEnergyEvent.energyDeltaKwh' "$HV_H4/m3-3-hv-h4-charge-session-source-authority.ts" \
  || fail "energy semantic firewall must prohibit VehicleEnergyEvent.energyDeltaKwh"
grep -q 'resolveM3_3HvH4ReplacementBoundaries' "$HV_H4/m3-3-hv-h4-lifecycle.util.ts" \
  || fail "H4 must reuse H2 replacement GT semantics"
grep -q 'runM3_3HvH4ReadOnlyTransaction' "$HV_H4/m3-3-hv-h4-coverage-report.service.ts" \
  || fail "coverage report must use read-only transaction"
grep -q 'M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1' "$HV_H4/m3-3-hv-h4.constants.ts" \
  || fail "missing A2 bounded charge throughput contract version"
grep -q 'boundedObservedChargeThroughputKwh' "$HV_H4/m3-3-hv-h4-charge-throughput.types.ts" \
  || fail "missing boundedObservedChargeThroughputKwh field"
grep -q 'buildM3_3HvH4ChargeThroughputReportV1' "$HV_H4/m3-3-hv-h4-charge-throughput-report.builder.ts" \
  || fail "missing A2 charge throughput report builder"
grep -q 'SOURCE_TRUNCATED' "$HV_H4/m3-3-hv-h4-charge-throughput-report.builder.ts" \
  || fail "A2 must fail closed on source truncation"
grep -q 'OVERLAPPING_ELIGIBLE_NATIVE_SESSIONS' "$HV_H4/m3-3-hv-h4-charge-throughput-report.builder.ts" \
  || fail "A2 must fail closed on overlapping native sessions"
grep -q 'loadM3_3HvH4DataV1' "$HV_H4/m3-3-hv-h4-data.loader.ts" \
  || fail "shared H4 data loader required"
grep -q 'DUPLICATE_NATIVE_PROVIDER_SEGMENT_ID' "$HV_H4/m3-3-hv-h4-charge-throughput-report.builder.ts" \
  || fail "A2 must fail closed on duplicate native providerSegmentId"
grep -q 'M3_3_HV_H4_SESSION_KNOWLEDGE_ASOF_POLICY' "$HV_H4/m3-3-hv-h4.constants.ts" \
  || fail "missing A2.1 session knowledge as-of policy"
grep -q 'NEUMAIER_COMPENSATED_SUM_V1' "$HV_H4/m3-3-hv-h4.constants.ts" \
  || fail "missing A2.1 Neumaier summation"
grep -q 'buildM3_3HvH4SegmentSourceFingerprintV1' "$HV_H4/m3-3-hv-h4-charge-throughput-fingerprint.v1.ts" \
  || fail "missing A2.1 hardened segment fingerprint builder"
grep -q 'metadata.providerSegmentId' "$HV_H4/m3-3-hv-h4-charge-throughput-session.v1.ts" \
  || fail "provider identity must use metadata.providerSegmentId"

if grep -rq 'hv-h4' "$APP_MODULE" 2>/dev/null; then
  fail "hv-h4 must not be registered in app.module.ts (H4_AUTOMATIC_RUNTIME_REACHABLE=NO)"
fi

echo "M3.3-HV-H4 domain contracts: OK"
