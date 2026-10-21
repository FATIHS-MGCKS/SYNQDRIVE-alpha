import { deriveDiV0TripSpeedQualityAssessability } from '../di-v0-trip-speed-quality-assessability';
import type { DiV0TripSpeedQualityProjectionQualityV1 } from '../di-v0-trip-speed-quality-projection.types';

function quality(partial: Partial<DiV0TripSpeedQualityProjectionQualityV1>): DiV0TripSpeedQualityProjectionQualityV1 {
  return {
    totalIntervalCount: 100,
    numericSpeedCount: 100,
    trustedNumericCount: 1,
    trustedLimitedCount: 69,
    trustedLimitedStationaryCount: 69,
    trustedLimitedNumericCount: 0,
    untrustedCount: 30,
    numericCoveragePercent: 100,
    trustedNumericCoveragePercent: 1,
    trustedLimitedCoveragePercent: 69,
    nonUntrustedCoveragePercent: 70,
    trustedCoveragePercent: 1,
    reasonCodeBreakdown: {},
    missingEvidenceCount: 0,
    sourceConflictCount: 0,
    ...partial,
  };
}

describe('DiV0TripSpeedQuality assessability (provisional criteria V1)', () => {
  it('does not grant FULL when only combined non-untrusted coverage hits 70%', () => {
    const result = deriveDiV0TripSpeedQualityAssessability(
      quality({ trustedNumericCoveragePercent: 1, nonUntrustedCoveragePercent: 70 }),
      { maxSpeedAssessability: 'TRUSTED_MAX_AVAILABLE' },
      true,
    );
    expect(result.level).not.toBe('FULL');
    expect(result.level).toBe('PARTIAL');
  });

  it('grants FULL when trusted numeric coverage meets provisional 70% threshold', () => {
    const result = deriveDiV0TripSpeedQualityAssessability(
      quality({
        trustedNumericCount: 70,
        trustedLimitedCount: 0,
        untrustedCount: 30,
        trustedNumericCoveragePercent: 70,
        trustedLimitedCoveragePercent: 0,
        nonUntrustedCoveragePercent: 70,
      }),
      { maxSpeedAssessability: 'TRUSTED_MAX_AVAILABLE' },
      true,
    );
    expect(result.level).toBe('FULL');
    expect(result.reasons).toContain('TRUSTED_NUMERIC_COVERAGE_HIGH_PROVISIONAL');
  });
});
