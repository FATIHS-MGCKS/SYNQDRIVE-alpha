/** Lifecycle status for a registered enforcement data flow. */
export const ENFORCEMENT_COVERAGE_STATUS = {
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  PARTIALLY_ENFORCED: 'PARTIALLY_ENFORCED',
  ENFORCED: 'ENFORCED',
  ENFORCEMENT_ERROR: 'ENFORCEMENT_ERROR',
  DISABLED: 'DISABLED',
} as const;

export type EnforcementCoverageStatus =
  (typeof ENFORCEMENT_COVERAGE_STATUS)[keyof typeof ENFORCEMENT_COVERAGE_STATUS];

export const ENFORCEMENT_COVERAGE_TEST_STATUS = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  MISSING: 'MISSING',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
} as const;

export type EnforcementCoverageTestStatus =
  (typeof ENFORCEMENT_COVERAGE_TEST_STATUS)[keyof typeof ENFORCEMENT_COVERAGE_TEST_STATUS];

export const ENFORCEMENT_COVERAGE_RUNTIME_HEALTH = {
  OK: 'OK',
  DEGRADED: 'DEGRADED',
  ERROR: 'ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

export type EnforcementCoverageRuntimeHealth =
  (typeof ENFORCEMENT_COVERAGE_RUNTIME_HEALTH)[keyof typeof ENFORCEMENT_COVERAGE_RUNTIME_HEALTH];

/** Standard enforcement points checked across data flows. */
export const ENFORCEMENT_POINT = {
  POLICY_DECISION_GATE: 'policy_decision_gate',
  TENANT_SCOPE_VALIDATION: 'tenant_scope_validation',
  AUDIT_ON_DENY: 'audit_on_deny',
  METRICS_EMIT: 'metrics_emit',
  DATA_MINIMIZATION: 'data_minimization',
  UNIT_TEST_COVERAGE: 'unit_test_coverage',
} as const;

export type EnforcementPoint = (typeof ENFORCEMENT_POINT)[keyof typeof ENFORCEMENT_POINT];

export const ENFORCEMENT_COVERAGE_DOMAIN = {
  LIVE_GPS: 'live-gps',
  TELEMETRY_INGEST: 'telemetry-ingest',
  TRIP_LOCATION: 'trip-location',
  VEHICLE_HEALTH: 'vehicle-health',
  DRIVING_BEHAVIOR: 'driving-behavior',
  NOTIFICATION: 'notification',
  EXTERNAL_ACCESS: 'external-access',
  AUTHORIZATION_DECISION: 'authorization-decision',
} as const;

export type EnforcementCoverageDomain =
  (typeof ENFORCEMENT_COVERAGE_DOMAIN)[keyof typeof ENFORCEMENT_COVERAGE_DOMAIN];

export const ENFORCEMENT_COVERAGE_DENY_REASON = {
  UNREGISTERED_PRODUCTIVE_PATH: 'ENFORCEMENT_COVERAGE_UNREGISTERED_PATH',
  BASELINE_DRIFT: 'ENFORCEMENT_COVERAGE_BASELINE_DRIFT',
} as const;
