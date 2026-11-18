import { describe, expect, it } from 'vitest';
import {
  mapRentalAssessmentToDrivingImpactStatus,
  publishesRentalDrivingStressScore,
  resolveRentalAnalysisStressScore,
} from './rental-assessment-score';

describe('publishesRentalDrivingStressScore (P6)', () => {
  it('allows COMPLETE and PARTIAL', () => {
    expect(publishesRentalDrivingStressScore('COMPLETE')).toBe(true);
    expect(publishesRentalDrivingStressScore('PARTIAL')).toBe(true);
  });

  it('blocks PROVISIONAL (STALE analogue), NOT_ASSESSABLE (INSUFFICIENT_EVIDENCE analogue), FAILED', () => {
    expect(publishesRentalDrivingStressScore('PROVISIONAL')).toBe(false);
    expect(publishesRentalDrivingStressScore('NOT_ASSESSABLE')).toBe(false);
    expect(publishesRentalDrivingStressScore('FAILED')).toBe(false);
    expect(publishesRentalDrivingStressScore(null)).toBe(false);
  });
});

describe('resolveRentalAnalysisStressScore', () => {
  const base = {
    id: 'a1',
    bookingId: 'b1',
    vehicleId: 'v1',
    bookingCustomerId: 'c1',
    periodStart: '',
    periodEnd: '',
    overallLevel: 'low',
    riskLevel: 'low',
    drivingScore: 81,
    drivingStressScore: 81,
    payload: {
      vehicleStressSummary: { drivingStressScore: 81 },
    },
  };

  it('returns numeric score only for COMPLETE or PARTIAL', () => {
    expect(
      resolveRentalAnalysisStressScore({
        ...base,
        assessmentStatus: 'COMPLETE',
      } as any),
    ).toBe(81);
    expect(
      resolveRentalAnalysisStressScore({
        ...base,
        assessmentStatus: 'PARTIAL',
      } as any),
    ).toBe(81);
    expect(
      resolveRentalAnalysisStressScore({
        ...base,
        assessmentStatus: 'PROVISIONAL',
      } as any),
    ).toBeNull();
  });

  it('does not fabricate score when underlying score exists but status blocks publish', () => {
    expect(
      resolveRentalAnalysisStressScore({
        ...base,
        assessmentStatus: 'NOT_ASSESSABLE',
        drivingScore: 99,
      } as any),
    ).toBeNull();
  });
});

describe('mapRentalAssessmentToDrivingImpactStatus', () => {
  it('maps rental statuses to trip quality hints', () => {
    expect(mapRentalAssessmentToDrivingImpactStatus('PARTIAL')).toBe('PARTIAL');
    expect(mapRentalAssessmentToDrivingImpactStatus('PROVISIONAL')).toBe('STALE');
    expect(mapRentalAssessmentToDrivingImpactStatus('NOT_ASSESSABLE')).toBe('UNSUPPORTED');
    expect(mapRentalAssessmentToDrivingImpactStatus('COMPLETE')).toBeNull();
  });
});