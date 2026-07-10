import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';

describe('DocumentExtractionPlausibilityService extraction conflicts', () => {
  const svc = new DocumentExtractionPlausibilityService();

  it('adds BLOCKER for conflicting odometer values', () => {
    const result = svc.runChecks(
      'SERVICE',
      { odometerKm: null },
      {},
      {
        extractionConflicts: [
          {
            key: 'odometerKm',
            selectedValue: null,
            candidateValues: [
              { value: 50000, sourcePages: [1], chunkIndex: 0 },
              { value: 52000, sourcePages: [3], chunkIndex: 1 },
            ],
            sourcePages: [1, 3],
            conflict: true,
          },
        ],
      },
    );
    expect(result.overallStatus).toBe('BLOCKER');
    expect(result.checks.some((c) => c.code === 'FIELD_CONFLICT_ODOMETERKM')).toBe(true);
  });

  it('adds WARNING for conflicting non-critical dates', () => {
    const result = svc.runChecks(
      'SERVICE',
      { eventDate: null },
      {},
      {
        extractionConflicts: [
          {
            key: 'eventDate',
            selectedValue: null,
            candidateValues: [
              { value: '2026-01-10', sourcePages: [1], chunkIndex: 0 },
              { value: '2026-02-01', sourcePages: [2], chunkIndex: 1 },
            ],
            sourcePages: [1, 2],
            conflict: true,
          },
        ],
      },
    );
    expect(result.checks.some((c) => c.code === 'FIELD_CONFLICT_EVENTDATE' && c.status === 'WARNING')).toBe(
      true,
    );
  });
});
