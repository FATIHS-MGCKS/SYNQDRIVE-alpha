import { DocumentExtractionMergeService } from './document-extraction-merge.service';

describe('DocumentExtractionMergeService', () => {
  const svc = new DocumentExtractionMergeService();
  const schema = [
    { key: 'eventDate', label: 'Date', type: 'date' },
    { key: 'odometerKm', label: 'Odometer', type: 'number' },
    { key: 'workshopName', label: 'Workshop', type: 'string' },
    { key: 'treadDepthMm.fl', label: 'FL', type: 'number' },
    { key: 'treadDepthMm.fr', label: 'FR', type: 'number' },
  ];

  it('merges identical values from multiple chunks', () => {
    const merged = svc.merge(schema, [
      {
        chunkIndex: 0,
        pageNumbers: [1],
        fields: { eventDate: '2026-01-10', odometerKm: 50000 },
        recommendedHumanReviewNotes: [],
      },
      {
        chunkIndex: 1,
        pageNumbers: [2],
        fields: { eventDate: '2026-01-10', workshopName: 'ACME' },
        recommendedHumanReviewNotes: [],
      },
    ]);
    expect(merged.fields.eventDate).toBe('2026-01-10');
    expect(merged.fields.odometerKm).toBe(50000);
    expect(merged.conflicts).toHaveLength(0);
  });

  it('flags conflicting odometer as conflict with null selected value', () => {
    const merged = svc.merge(schema, [
      {
        chunkIndex: 0,
        pageNumbers: [1],
        fields: { odometerKm: 50000 },
        recommendedHumanReviewNotes: [],
      },
      {
        chunkIndex: 1,
        pageNumbers: [5],
        fields: { odometerKm: 52000 },
        recommendedHumanReviewNotes: [],
      },
    ]);
    expect(merged.fields.odometerKm).toBeNull();
    expect(merged.conflicts.some((c) => c.key === 'odometerKm')).toBe(true);
  });

  it('flags conflicting dates as conflict with null selected value', () => {
    const merged = svc.merge(schema, [
      {
        chunkIndex: 0,
        pageNumbers: [1],
        fields: { eventDate: '2026-01-10' },
        recommendedHumanReviewNotes: [],
      },
      {
        chunkIndex: 1,
        pageNumbers: [2],
        fields: { eventDate: '2026-02-01' },
        recommendedHumanReviewNotes: [],
      },
    ]);
    expect(merged.fields.eventDate).toBeNull();
    expect(merged.conflicts.some((c) => c.key === 'eventDate')).toBe(true);
  });

  it('merges nested fields across chunks deterministically', () => {
    const merged = svc.merge(schema, [
      {
        chunkIndex: 0,
        pageNumbers: [1],
        fields: { treadDepthMm: { fl: 5.1 } },
        recommendedHumanReviewNotes: [],
      },
      {
        chunkIndex: 1,
        pageNumbers: [2],
        fields: { treadDepthMm: { fr: 5.0 } },
        recommendedHumanReviewNotes: [],
      },
    ]);
    expect(merged.fields.treadDepthMm).toEqual({ fl: 5.1, fr: 5.0 });
  });

  it('is deterministic for conflicting non-critical strings', () => {
    const chunks = [
      {
        chunkIndex: 1,
        pageNumbers: [3],
        fields: { workshopName: 'Beta Garage' },
        recommendedHumanReviewNotes: [],
      },
      {
        chunkIndex: 0,
        pageNumbers: [1],
        fields: { workshopName: 'Alpha Garage' },
        recommendedHumanReviewNotes: [],
      },
    ];
    const a = svc.merge(schema, chunks);
    const b = svc.merge(schema, chunks);
    expect(a.fields.workshopName).toBe(b.fields.workshopName);
    expect(a.fields.workshopName).toBe('Alpha Garage');
  });
});
