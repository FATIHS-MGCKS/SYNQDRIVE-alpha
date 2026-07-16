import {
  emptyAnalysisStagesDocument,
  parseAnalysisStagesDocument,
  updateStageRecord,
} from './trip-analysis-stage-record';

describe('trip-analysis-stage-record', () => {
  it('parses legacy flat stage strings', () => {
    const doc = parseAnalysisStagesDocument({
      behavior: 'done',
      route: 'done',
      misuse: 'pending',
      drivingImpact: 'pending',
    });
    expect(doc.behavior?.state).toBe('done');
    expect(doc.route?.state).toBe('done');
  });

  it('parses enriched stage records with metadata', () => {
    const doc = parseAnalysisStagesDocument({
      route: {
        state: 'done',
        attempts: 2,
        completedAt: '2026-07-16T10:00:00.000Z',
        errorCode: null,
      },
    });
    expect(doc.route?.attempts).toBe(2);
    expect(doc.route?.completedAt).toBe('2026-07-16T10:00:00.000Z');
  });

  it('updateStageRecord preserves unrelated stages', () => {
    const base = emptyAnalysisStagesDocument();
    const withRoute = updateStageRecord(base, 'route', {
      state: 'done',
      completedAt: new Date('2026-07-16T10:00:00.000Z'),
    });
    const withFailure = updateStageRecord(withRoute, 'eventContext', {
      state: 'failed',
      errorCode: 'EVENT_CONTEXT_FAILED',
      completedAt: new Date('2026-07-16T10:05:00.000Z'),
    });

    expect(withFailure.route?.state).toBe('done');
    expect(withFailure.eventContext?.state).toBe('failed');
    expect(withFailure.eventContext?.errorCode).toBe('EVENT_CONTEXT_FAILED');
    expect(withFailure.behavior?.state).toBe('pending');
  });
});
