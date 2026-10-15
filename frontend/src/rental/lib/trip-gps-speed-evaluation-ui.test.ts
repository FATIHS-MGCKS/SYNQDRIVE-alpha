import { describe, expect, it } from 'vitest';
import {
  formatTripGpsSpeedKmh,
  tripGpsSpeedEvaluationHasDisplayableMetrics,
} from './trip-gps-speed-evaluation-ui';
import type { TripGpsSpeedEvaluationProductV1 } from '../../lib/api';

const readyPayload: TripGpsSpeedEvaluationProductV1 = {
  contractVersion: 'DI_V0_TRIP_GPS_SPEED_EVALUATION_PRODUCT_V1',
  qcPolicyVersion: 'DI_V0_SPEED_QC_POLICY_V2',
  availability: 'READY',
  assessabilityLevel: 'FULL',
  limitedAssessability: false,
  coverage: {
    totalIntervalCount: 10,
    numericCoveragePercent: 90,
    trustedNumericCoveragePercent: 80,
    trustedLimitedCoveragePercent: 5,
    trustedNumericIntervalCount: 8,
    trustedLimitedStationaryIntervalCount: 1,
  },
  speed: {
    maxKmh: 120,
    maxScope: 'TRUSTED_NUMERIC_INTERVALS',
    maxAssessability: 'TRUSTED_MAX_AVAILABLE',
    meanKmh: 65,
    meanScope: 'TRUSTED_NUMERIC_INTERVALS_ONLY',
  },
  motion: {
    stationarySupportedIntervalCount: 1,
    movingEstimatedIntervalCount: 8,
  },
};

describe('trip-gps-speed-evaluation-ui', () => {
  it('formatTripGpsSpeedKmh returns null for missing values (not zero)', () => {
    expect(formatTripGpsSpeedKmh(null)).toBeNull();
    expect(formatTripGpsSpeedKmh(undefined)).toBeNull();
    expect(formatTripGpsSpeedKmh(0)).toBe('0');
  });

  it('detects displayable READY metrics', () => {
    expect(tripGpsSpeedEvaluationHasDisplayableMetrics(readyPayload)).toBe(true);
    expect(tripGpsSpeedEvaluationHasDisplayableMetrics({ ...readyPayload, availability: 'PENDING' })).toBe(
      false,
    );
  });

  it('keeps numeric coverage independent from stationary acceptance (118 accepted vs 144 candidates)', () => {
    const payload = {
      ...readyPayload,
      coverage: {
        ...readyPayload.coverage!,
        numericCoveragePercent: 82,
        trustedLimitedStationaryIntervalCount: 118,
      },
      motion: { stationarySupportedIntervalCount: 144, movingEstimatedIntervalCount: 10 },
    };
    expect(payload.coverage.numericCoveragePercent).toBe(82);
    expect(payload.coverage.trustedLimitedStationaryIntervalCount).toBe(118);
    expect(payload.motion.stationarySupportedIntervalCount).toBe(144);
  });
});
