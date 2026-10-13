/**
 * Versioned assessability criteria for trip speed quality projection V1.
 * Thresholds are PROVISIONAL (pilot / pre-production calibration).
 */
export const DI_V0_TRIP_SPEED_QUALITY_ASSESSABILITY_CRITERIA_V1 = {
  criteriaVersion: 'DI_V0_TRIP_SPEED_QUALITY_ASSESSABILITY_CRITERIA_V1',
  provisional: true,
  /**
   * FULL numeric trip assessability requires trusted numeric interval coverage only.
   * TRUSTED_LIMITED (stationary or numeric) does not satisfy this gate.
   */
  full: {
    minTrustedNumericCoveragePercent: 70,
    minTrustedNumericIntervalCount: 1,
  },
  partial: {
    minTrustedNumericIntervalCount: 1,
  },
} as const;
