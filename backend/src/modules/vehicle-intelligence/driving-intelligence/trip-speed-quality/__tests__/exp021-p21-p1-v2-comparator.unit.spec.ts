import { DI_V0_SPEED_QC_REASON } from '../../speed-qc/di-v0-speed-qc-reason-codes';
import type { DiV0SpeedQcIntervalVerdict } from '../../speed-qc/di-v0-speed-qc.types';
import type { DiV0TripSpeedQualityShadowRow } from '../build-di-v0-trip-speed-quality-projection.v1';
import {
  auditP21V1V2Interval,
  assertV2StationaryAcceptanceContract,
  computeMultiTripRegressionVerdict,
} from '../../../../../../scripts/ops/exp021-p21-p1-v2-policy-compare.lib';

function verdict(
  partial: Pick<DiV0SpeedQcIntervalVerdict, 'trustLevel'> & Partial<DiV0SpeedQcIntervalVerdict>,
): DiV0SpeedQcIntervalVerdict {
  return {
    qcPolicyVersion: 'DI_V0_SPEED_QC_POLICY_V1',
    trustLevel: partial.trustLevel,
    reasonCodes: partial.reasonCodes ?? [],
    inputEvidenceIdentity: { pinnedSnapshotHash: 'test' },
    originalEstimatedSpeedKmh: partial.originalEstimatedSpeedKmh ?? null,
    qcTrustedSpeedKmh: partial.qcTrustedSpeedKmh ?? null,
    supportAssessment: {
      prevLabel: null,
      centerLabel: 'c',
      nextLabel: null,
      calendarSupportComplete: true,
      legDistancesM: { prevToCenter: null, centerToNext: null },
      legImpliedSpeedMps: { prevToCenter: null, centerToNext: null },
      legDeltaSeconds: { prevToCenter: null, centerToNext: null },
      supportQualityFlags: [],
    },
    sourceCorroboration: {
      r1PresentAtCenter: false,
      r1SpeedKmhAtCenter: null,
      r1CorroboratesL3: false,
      r1IndependentWitness: false,
      r1IntervalOnlyAtCenter: false,
    },
    physicalPlausibility: {
      calibrationKind: 'PROVISIONAL',
      maxLegSpeedMpsApplied: 0,
      maxLongitudinalAccelMps2Applied: 0,
      impliedAccelPrevCenterNextMps2: null,
    },
  };
}

function shadowRow(partial: Partial<DiV0TripSpeedQualityShadowRow>): DiV0TripSpeedQualityShadowRow {
  return {
    intervalStart: new Date(),
    intervalEnd: new Date(),
    referenceTime: new Date(),
    motionState: 'MOVING_SUPPORTED',
    positionState: 'MOVING',
    estimatedSpeedKmh: 40,
    speedEvidenceState: 'NUMERIC',
    valueConfidence: 'HIGH',
    sourceRelation: 'AGREEING',
    abstentionReason: null,
    evidenceSources: [],
    sourceQualityFlags: [],
    ...partial,
  };
}

describe('exp021 P21 V1/V2 comparator', () => {
  it('detects interval qc change outside allowed stationary-null path', () => {
    const row = shadowRow({ estimatedSpeedKmh: 40, motionState: 'MOVING_SUPPORTED', speedEvidenceState: 'NUMERIC' });
    const v1 = verdict({ trustLevel: 'TRUSTED', qcTrustedSpeedKmh: 40, reasonCodes: [DI_V0_SPEED_QC_REASON.OK] });
    const v2 = verdict({ trustLevel: 'TRUSTED', qcTrustedSpeedKmh: 41, reasonCodes: [DI_V0_SPEED_QC_REASON.OK] });
    const { violations } = auditP21V1V2Interval({
      tripId: 't1',
      referenceTime: '2026-01-01T00:00:00Z',
      row,
      v1,
      v2,
    });
    expect(violations.some((v) => v.kind === 'CHANGE_OUTSIDE_ALLOWED_PATH')).toBe(true);
  });

  it('detects null→0 on stationary candidate', () => {
    const row = shadowRow({
      estimatedSpeedKmh: null,
      motionState: 'STATIONARY_SUPPORTED',
      speedEvidenceState: 'STATIONARY_BAND',
      positionState: 'FROZEN_STOP_SUPPORTED',
    });
    const v1 = verdict({ trustLevel: 'UNTRUSTED', reasonCodes: [DI_V0_SPEED_QC_REASON.NO_NUMERIC] });
    const v2 = verdict({ trustLevel: 'UNTRUSTED', qcTrustedSpeedKmh: 0, reasonCodes: [DI_V0_SPEED_QC_REASON.NO_NUMERIC] });
    const { violations, counters } = auditP21V1V2Interval({
      tripId: 't1',
      referenceTime: '2026-01-01T00:00:01Z',
      row,
      v1,
      v2,
    });
    expect(counters.nullToZeroConversions).toBe(1);
    expect(violations.some((v) => v.kind === 'NULL_TO_ZERO')).toBe(true);
  });

  it('detects invalid stationary acceptance contract', () => {
    const row = shadowRow({
      estimatedSpeedKmh: null,
      motionState: 'STATIONARY_SUPPORTED',
      speedEvidenceState: 'STATIONARY_BAND',
      positionState: 'FROZEN_STOP_SUPPORTED',
      sourceRelation: 'CONFLICTING',
    });
    const v2 = verdict({
      trustLevel: 'TRUSTED_LIMITED',
      reasonCodes: [DI_V0_SPEED_QC_REASON.OK_STATIONARY_NULL_SPEED],
    });
    expect(assertV2StationaryAcceptanceContract(row, v2).ok).toBe(false);
  });

  it('does not PASS batch gates when read-only not observed', () => {
    expect(
      computeMultiTripRegressionVerdict({
        manifestTripCount: 10,
        evaluatedTripCount: 10,
        excludedCount: 0,
        readOnlyObserved: false,
        repeatableReadObserved: true,
        manifestIdentityOk: true,
        allTripsRegressionPass: true,
      }),
    ).toBe('GATE_FAIL');
  });

  it('detects mismatch even when aggregate trusted max could match', () => {
    const row = shadowRow({ estimatedSpeedKmh: 50 });
    const v1 = verdict({ trustLevel: 'TRUSTED', qcTrustedSpeedKmh: 50, reasonCodes: [DI_V0_SPEED_QC_REASON.OK] });
    const v2 = verdict({ trustLevel: 'TRUSTED', qcTrustedSpeedKmh: 50.1, reasonCodes: [DI_V0_SPEED_QC_REASON.OK] });
    const { violations } = auditP21V1V2Interval({
      tripId: 't-agg',
      referenceTime: '2026-01-01T00:00:02Z',
      row,
      v1,
      v2,
    });
    expect(violations.some((v) => v.kind === 'QC_TRUSTED_SPEED_MISMATCH' || v.kind === 'CHANGE_OUTSIDE_ALLOWED_PATH')).toBe(
      true,
    );
  });
});
