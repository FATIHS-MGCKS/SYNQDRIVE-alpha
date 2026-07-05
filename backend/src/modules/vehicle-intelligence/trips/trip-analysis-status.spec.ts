import {
  areAnalysisStagesComplete,
  buildTripAnalysisApiFields,
  getTripAnalysisDisplayLabel,
  hasAnalysisStageFailure,
  inferTripAnalysisStatusFromLegacy,
  isTripAnalysisInProgress,
  parseAnalysisStagesJson,
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

  it('exposes totalAnalysisLatencyMs alias', () => {
    const fields = buildTripAnalysisApiFields({
      tripStatus: 'COMPLETED',
      tripAnalysisStatus: 'COMPLETED',
      analysisLatencyMs: 4200,
    });
    expect(fields.totalAnalysisLatencyMs).toBe(4200);
    expect(fields.analysisInProgress).toBe(false);
  });
});
