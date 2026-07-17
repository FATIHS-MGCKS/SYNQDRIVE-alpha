import {
  assessRentalDrivingAnalysis,
  allowsStrongCustomerRecommendation,
  buildRentalAssessmentTripSnapshot,
} from './rental-driving-analysis.assessment';

describe('rental-driving-analysis.assessment (P61)', () => {
  const settledTrip = buildRentalAssessmentTripSnapshot({
    tripId: 'trip-1',
    tripStatus: 'COMPLETED',
    tripAnalysisStatus: 'COMPLETED',
    drivingImpactStatus: 'READY',
    analysisAssessability: 'FULL',
    analysisRunStatus: 'COMPLETED',
    hasAttribution: true,
    misuseStage: 'done',
  });

  it('returns COMPLETE when booking and all trip pipeline gates pass', () => {
    const result = assessRentalDrivingAnalysis({
      bookingStatus: 'COMPLETED',
      analysisCompleteness: 'FULL',
      assignedTripCount: 1,
      pendingCoreJobCount: 0,
      pendingRentalRecomputeJobCount: 0,
      trips: [settledTrip],
    });

    expect(result.status).toBe('COMPLETE');
    expect(result.missingComponents).toEqual([]);
    expect(result.allowsStrongCustomerRecommendation).toBe(true);
  });

  it('returns PROVISIONAL for active booking with incomplete trips', () => {
    const result = assessRentalDrivingAnalysis({
      bookingStatus: 'ACTIVE',
      analysisCompleteness: 'PARTIAL',
      assignedTripCount: 2,
      pendingCoreJobCount: 0,
      pendingRentalRecomputeJobCount: 0,
      trips: [
        settledTrip,
        buildRentalAssessmentTripSnapshot({
          tripId: 'trip-2',
          tripStatus: 'IN_PROGRESS',
          tripAnalysisStatus: 'PENDING',
          drivingImpactStatus: 'PENDING',
          analysisAssessability: 'FULL',
          analysisRunStatus: 'PENDING',
          hasAttribution: false,
          misuseStage: 'pending',
        }),
      ],
    });

    expect(result.status).toBe('PROVISIONAL');
    expect(result.missingComponents).toEqual(
      expect.arrayContaining([
        'BOOKING_NOT_COMPLETED',
        'ASSIGNED_TRIPS_NOT_FINALIZED',
      ]),
    );
    expect(result.allowsStrongCustomerRecommendation).toBe(false);
  });

  it('returns PROVISIONAL when completed booking still has unfinalized assigned trips', () => {
    const result = assessRentalDrivingAnalysis({
      bookingStatus: 'COMPLETED',
      analysisCompleteness: 'FULL',
      assignedTripCount: 2,
      pendingCoreJobCount: 0,
      pendingRentalRecomputeJobCount: 0,
      trips: [
        settledTrip,
        buildRentalAssessmentTripSnapshot({
          tripId: 'trip-2',
          tripStatus: 'IN_PROGRESS',
          tripAnalysisStatus: 'IN_PROGRESS',
          drivingImpactStatus: 'PENDING',
          analysisAssessability: 'FULL',
          analysisRunStatus: 'IN_PROGRESS',
          hasAttribution: false,
          misuseStage: 'pending',
        }),
      ],
    });

    expect(result.status).toBe('PROVISIONAL');
    expect(result.missingComponents).toEqual(
      expect.arrayContaining(['ASSIGNED_TRIPS_NOT_FINALIZED']),
    );
    expect(result.tripBreakdown.finalizedTripCount).toBe(1);
  });

  it('returns FAILED for technical analysis failures', () => {
    const result = assessRentalDrivingAnalysis({
      bookingStatus: 'COMPLETED',
      analysisCompleteness: 'FULL',
      assignedTripCount: 1,
      pendingCoreJobCount: 0,
      pendingRentalRecomputeJobCount: 0,
      trips: [
        buildRentalAssessmentTripSnapshot({
          tripId: 'trip-failed',
          tripStatus: 'COMPLETED',
          tripAnalysisStatus: 'FAILED',
          drivingImpactStatus: 'FAILED',
          analysisAssessability: 'FULL',
          analysisRunStatus: 'FAILED',
          hasAttribution: true,
          misuseStage: 'failed',
        }),
      ],
    });

    expect(result.status).toBe('FAILED');
    expect(result.technicalFailures).toEqual(
      expect.arrayContaining([
        'trip:trip-failed:analysis_failed',
        'trip:trip-failed:driving_impact_failed',
      ]),
    );
    expect(result.allowsStrongCustomerRecommendation).toBe(false);
  });

  it('returns NOT_ASSESSABLE when no assessable trip data exists', () => {
    const result = assessRentalDrivingAnalysis({
      bookingStatus: 'COMPLETED',
      analysisCompleteness: 'INSUFFICIENT',
      assignedTripCount: 1,
      pendingCoreJobCount: 0,
      pendingRentalRecomputeJobCount: 0,
      trips: [
        buildRentalAssessmentTripSnapshot({
          tripId: 'trip-skip',
          tripStatus: 'COMPLETED',
          tripAnalysisStatus: 'SKIPPED',
          drivingImpactStatus: 'SKIPPED',
          analysisAssessability: 'NOT_ASSESSABLE',
          analysisRunStatus: 'MISSING',
          hasAttribution: false,
          misuseStage: 'skipped',
        }),
      ],
    });

    expect(result.status).toBe('NOT_ASSESSABLE');
    expect(result.capabilityGaps).toEqual(
      expect.arrayContaining(['insufficient_scored_trips', 'all_trips_not_assessable']),
    );
    expect(result.allowsStrongCustomerRecommendation).toBe(false);
  });

  it('returns PARTIAL when pipeline settled but attribution or misuse gaps remain', () => {
    const result = assessRentalDrivingAnalysis({
      bookingStatus: 'COMPLETED',
      analysisCompleteness: 'FULL',
      assignedTripCount: 1,
      pendingCoreJobCount: 0,
      pendingRentalRecomputeJobCount: 0,
      trips: [
        buildRentalAssessmentTripSnapshot({
          tripId: 'trip-partial',
          tripStatus: 'COMPLETED',
          tripAnalysisStatus: 'COMPLETED',
          drivingImpactStatus: 'READY',
          analysisAssessability: 'FULL',
          analysisRunStatus: 'COMPLETED',
          hasAttribution: false,
          misuseStage: 'pending',
        }),
      ],
    });

    expect(result.status).toBe('PARTIAL');
    expect(result.missingComponents).toEqual(
      expect.arrayContaining(['ATTRIBUTION_NOT_COMPUTED', 'MISUSE_NOT_RECONCILED']),
    );
    expect(allowsStrongCustomerRecommendation(result.status)).toBe(false);
  });

  it('returns PROVISIONAL when core jobs are still pending', () => {
    const result = assessRentalDrivingAnalysis({
      bookingStatus: 'COMPLETED',
      analysisCompleteness: 'FULL',
      assignedTripCount: 1,
      pendingCoreJobCount: 2,
      pendingRentalRecomputeJobCount: 1,
      trips: [settledTrip],
    });

    expect(result.status).toBe('PROVISIONAL');
    expect(result.missingComponents).toContain('PENDING_CORE_JOBS');
  });
});
