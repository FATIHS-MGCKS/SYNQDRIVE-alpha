import {
  areAnalysisStagesComplete,
  buildAssessabilityForLteR1Completed,
  buildAssessabilityForSmart5Skip,
  buildTripAnalysisApiFields,
  deriveAnalysisAssessability,
  getTripAnalysisDisplayLabel,
  hasAnalysisStageFailure,
  inferTripAnalysisStatusFromLegacy,
  isTripAnalysisInProgress,
  isTripDetailsLimited,
  parseAnalysisStagesJson,
  shouldFullySkipAnalysis,
} from './trip-analysis-status';

describe('trip-analysis-status', () => {
  it('maps in-progress statuses to customer label', () => {
    expect(getTripAnalysisDisplayLabel('PENDING')).toBe('Analyse läuft noch');
    expect(getTripAnalysisDisplayLabel('IN_PROGRESS')).toBe('Analyse läuft noch');
    expect(getTripAnalysisDisplayLabel('PARTIAL')).toBe('Analyse läuft noch');
    expect(getTripAnalysisDisplayLabel('COMPLETED')).toBe('Analyse abgeschlossen');
    expect(getTripAnalysisDisplayLabel('FAILED')).toBe('Analyse fehlgeschlagen');
    expect(getTripAnalysisDisplayLabel('SKIPPED')).toBe('Nicht genügend Daten');
  });

  it('detects in-progress analysis', () => {
    expect(isTripAnalysisInProgress('PARTIAL')).toBe(true);
    expect(isTripAnalysisInProgress('COMPLETED')).toBe(false);
  });

  it('completes only when all stages are terminal without failures', () => {
    const stages = parseAnalysisStagesJson({
      behavior: 'done',
      route: 'skipped',
      misuse: 'done',
      drivingImpact: 'skipped',
    });
    expect(areAnalysisStagesComplete(stages)).toBe(true);
    expect(hasAnalysisStageFailure(stages)).toBe(false);
  });

  it('does not complete when a stage failed', () => {
    const stages = parseAnalysisStagesJson({
      behavior: 'done',
      route: 'done',
      misuse: 'failed',
      drivingImpact: 'skipped',
    });
    expect(areAnalysisStagesComplete(stages)).toBe(false);
    expect(hasAnalysisStageFailure(stages)).toBe(true);
  });

  it('infers legacy completed trips as analysis completed', () => {
    expect(
      inferTripAnalysisStatusFromLegacy({
        tripStatus: 'COMPLETED',
        behaviorEnrichmentStatus: 'COMPLETED',
      }),
    ).toBe('COMPLETED');
  });

  it('exposes totalAnalysisLatencyMs alias and assessability fields', () => {
    const fields = buildTripAnalysisApiFields({
      tripStatus: 'COMPLETED',
      tripAnalysisStatus: 'COMPLETED',
      analysisLatencyMs: 4200,
      behaviorEnrichmentStatus: 'COMPLETED',
      behaviorSummaryJson: {
        analysisAssessability: 'LIMITED',
        analysisLimitReason: 'INSUFFICIENT_HF',
        hfInsufficientForAbuse: true,
        nativeBehaviorEventsAvailable: true,
        nativeEventCount: 3,
        hfPointsTotal: 4,
        hfPointsCleaned: 2,
      },
    });
    expect(fields.totalAnalysisLatencyMs).toBe(4200);
    expect(fields.analysisInProgress).toBe(false);
    expect(fields.analysisAssessability).toBe('LIMITED');
    expect(fields.analysisLimitReason).toBe('INSUFFICIENT_HF');
    expect(fields.hfInsufficientForAbuse).toBe(true);
    expect(fields.nativeEventCount).toBe(3);
  });

  describe('assessability', () => {
    it('LTE_R1 sparse HF with native events is LIMITED not fully skipped', () => {
      const ctx = buildAssessabilityForLteR1Completed({
        nativeEventCount: 2,
        nativeQuerySucceeded: true,
        hfInsufficientForAbuse: true,
        hfPointsTotal: 4,
        hfPointsCleaned: 2,
        hardwareType: 'LTE_R1',
      });
      expect(ctx.analysisAssessability).toBe('LIMITED');
      expect(ctx.analysisLimitReason).toBe('INSUFFICIENT_HF');
      expect(ctx.shortTermMisuseAssessable).toBe(false);
      expect(ctx.nativeBehaviorEventsAvailable).toBe(true);
      expect(shouldFullySkipAnalysis(ctx)).toBe(false);
    });

    it('LTE_R1 zero native events after successful query is NOT_ASSESSABLE', () => {
      const ctx = buildAssessabilityForLteR1Completed({
        nativeEventCount: 0,
        nativeQuerySucceeded: true,
        hfInsufficientForAbuse: true,
        hfPointsTotal: 3,
        hfPointsCleaned: 0,
        hardwareType: 'LTE_R1',
      });
      expect(ctx.analysisAssessability).toBe('NOT_ASSESSABLE');
      expect(ctx.analysisLimitReason).toBe('NO_NATIVE_EVENTS');
      expect(shouldFullySkipAnalysis(ctx)).toBe(true);
    });

    it('SMART5 insufficient HF points is NOT_ASSESSABLE', () => {
      const ctx = buildAssessabilityForSmart5Skip('INSUFFICIENT_POINTS', 'SMART5', 4, 2);
      expect(ctx.analysisAssessability).toBe('NOT_ASSESSABLE');
      expect(ctx.analysisLimitReason).toBe('INSUFFICIENT_HF');
      expect(shouldFullySkipAnalysis(ctx)).toBe(true);
    });
  });

  describe('detailsLimited', () => {
    it('is true for SKIPPED analysis status', () => {
      expect(
        isTripDetailsLimited({
          endTime: new Date(),
          tripAnalysisStatus: 'SKIPPED',
          behaviorEnrichmentStatus: 'COMPLETED',
        }),
      ).toBe(true);
    });

    it('is true for SKIPPED_NO_HF_DATA enrichment', () => {
      expect(
        isTripDetailsLimited({
          endTime: new Date(),
          behaviorEnrichmentStatus: 'SKIPPED_NO_HF_DATA',
        }),
      ).toBe(true);
    });

    it('is true when hfInsufficientForAbuse is set', () => {
      expect(
        isTripDetailsLimited({
          endTime: new Date(),
          behaviorEnrichmentStatus: 'COMPLETED',
          behaviorSummaryJson: { hfInsufficientForAbuse: true, nativeBehaviorEventsAvailable: true },
        }),
      ).toBe(true);
    });

    it('is true for NOT_ASSESSABLE assessability', () => {
      const assess = deriveAnalysisAssessability({
        behaviorEnrichmentStatus: 'COMPLETED',
        behaviorSummaryJson: {
          analysisAssessability: 'NOT_ASSESSABLE',
          analysisLimitReason: 'NO_NATIVE_EVENTS',
        },
      });
      expect(assess.analysisAssessability).toBe('NOT_ASSESSABLE');
      expect(
        isTripDetailsLimited({
          endTime: new Date(),
          behaviorEnrichmentStatus: 'COMPLETED',
          behaviorSummaryJson: {
            analysisAssessability: 'NOT_ASSESSABLE',
          },
        }),
      ).toBe(true);
    });
  });
});
