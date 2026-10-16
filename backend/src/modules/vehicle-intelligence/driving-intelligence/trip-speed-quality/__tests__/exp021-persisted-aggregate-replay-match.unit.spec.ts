import {
  evaluateExp021PersistedAggregateReplayMatch,
  exp021CanonicalPersistedV2WhereClause,
} from '../exp021-persisted-aggregate-replay-match';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../../speed-qc/di-v0-speed-qc-policy.version';
import { DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1 } from '../di-v0-trip-speed-quality-projection.version';

describe('evaluateExp021PersistedAggregateReplayMatch', () => {
  const replay = {
    trustedNumericCoveragePercent: 50,
    numericCoveragePercent: 55,
    trustedLimitedStationaryCount: 2,
    qcTrustedMaxKmh: 80,
  };

  it('returns N/A when no persisted row (never PASS on empty comparison set)', () => {
    const result = evaluateExp021PersistedAggregateReplayMatch({ persisted: null, replay });
    expect(result.status).toBe('N/A');
    expect(result.reason).toBe('NO_PERSISTED_CURRENT_V2_ROW');
  });

  it('returns PASS when aggregate fields match replay', () => {
    const result = evaluateExp021PersistedAggregateReplayMatch({
      persisted: {
        id: 'p1',
        qc_policy_version: DI_V0_SPEED_QC_POLICY_V2,
        projection_version: DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1,
        lifecycle_status: 'CURRENT',
        created_at: new Date('2026-10-15T21:00:00.000Z'),
        projection_json: {
          quality: {
            trustedNumericCoveragePercent: 50,
            numericCoveragePercent: 55,
            trustedLimitedStationaryCount: 2,
          },
          speed: { qcTrustedMaxKmh: 80 },
        },
      },
      replay,
    });
    expect(result.status).toBe('PASS');
  });

  it('returns FAIL on mismatch', () => {
    const result = evaluateExp021PersistedAggregateReplayMatch({
      persisted: {
        id: 'p1',
        qc_policy_version: DI_V0_SPEED_QC_POLICY_V2,
        projection_version: DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1,
        lifecycle_status: 'CURRENT',
        created_at: new Date(),
        projection_json: {
          quality: {
            trustedNumericCoveragePercent: 1,
            numericCoveragePercent: 55,
            trustedLimitedStationaryCount: 2,
          },
          speed: { qcTrustedMaxKmh: 80 },
        },
      },
      replay,
    });
    expect(result.status).toBe('FAIL');
  });

  it('documents canonical filter — projection_version=V2 is not valid', () => {
    const canonical = exp021CanonicalPersistedV2WhereClause();
    expect(canonical.projectionVersion).toBe(DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1);
    expect(canonical.projectionVersion).not.toBe('V2');
  });
});
