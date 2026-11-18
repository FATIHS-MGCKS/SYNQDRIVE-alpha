import {
  resolveBookingDetailDrivingStressScore,
  resolveBookingDetailUsageAssessmentStatus,
} from './booking-detail-usage-stress.util';

describe('booking-detail usage driving stress gate (P6 P2-2)', () => {
  const score = { drivingScore: 72 };

  it('publishes score for COMPLETE', () => {
    expect(
      resolveBookingDetailDrivingStressScore({
        ...score,
        assessmentStatus: 'COMPLETE',
      }),
    ).toBe(72);
  });

  it('publishes score for PARTIAL', () => {
    expect(
      resolveBookingDetailDrivingStressScore({
        ...score,
        assessmentStatus: 'PARTIAL',
      }),
    ).toBe(72);
  });

  it('hides score for PROVISIONAL (stale / interim; consumer-audit STALE analogue)', () => {
    expect(
      resolveBookingDetailDrivingStressScore({
        ...score,
        assessmentStatus: 'PROVISIONAL',
      }),
    ).toBeNull();
  });

  it('hides score for NOT_ASSESSABLE (INSUFFICIENT_EVIDENCE analogue)', () => {
    expect(
      resolveBookingDetailDrivingStressScore({
        ...score,
        assessmentStatus: 'NOT_ASSESSABLE',
      }),
    ).toBeNull();
  });

  it('hides score for FAILED', () => {
    expect(
      resolveBookingDetailDrivingStressScore({
        ...score,
        assessmentStatus: 'FAILED',
      }),
    ).toBeNull();
  });

  it('hides score when assessment is missing', () => {
    expect(resolveBookingDetailDrivingStressScore(null)).toBeNull();
    expect(
      resolveBookingDetailDrivingStressScore({
        ...score,
        assessmentStatus: null,
      }),
    ).toBeNull();
  });

  it('does not fabricate score when drivingScore is missing', () => {
    expect(
      resolveBookingDetailDrivingStressScore({
        assessmentStatus: 'COMPLETE',
        drivingScore: null,
      }),
    ).toBeNull();
  });

  it('does not publish non-finite scores (F3)', () => {
    expect(
      resolveBookingDetailDrivingStressScore({
        assessmentStatus: 'COMPLETE',
        drivingScore: Number.NaN,
      }),
    ).toBeNull();
    expect(
      resolveBookingDetailDrivingStressScore({
        assessmentStatus: 'PARTIAL',
        drivingScore: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull();
  });

  it('exposes assessmentStatus on usage when analysis exists', () => {
    expect(
      resolveBookingDetailUsageAssessmentStatus({
        assessmentStatus: 'PARTIAL',
        drivingScore: 40,
      }),
    ).toBe('PARTIAL');
    expect(resolveBookingDetailUsageAssessmentStatus(null)).toBeNull();
  });
});