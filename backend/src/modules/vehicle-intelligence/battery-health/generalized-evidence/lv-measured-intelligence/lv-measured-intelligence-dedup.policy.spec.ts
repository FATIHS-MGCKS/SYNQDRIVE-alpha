import {
  dedupeKeyForObservationRow,
  dedupeObservationsBySourceMeasurementId,
} from './lv-measured-intelligence-dedup.policy';

describe('dedupeObservationsBySourceMeasurementId', () => {
  it('keeps one row per sourceMeasurementId preferring newer voltageObservedAt', () => {
    const rows = dedupeObservationsBySourceMeasurementId([
      {
        id: 'a1',
        sourceMeasurementId: 'm1',
        voltageObservedAt: new Date('2026-01-01T08:00:00Z'),
        createdAt: new Date('2026-01-01T08:01:00Z'),
      },
      {
        id: 'a2',
        sourceMeasurementId: 'm1',
        voltageObservedAt: new Date('2026-01-01T09:00:00Z'),
        createdAt: new Date('2026-01-01T09:01:00Z'),
      },
      {
        id: 'b1',
        sourceMeasurementId: 'm2',
        voltageObservedAt: new Date('2026-01-01T10:00:00Z'),
        createdAt: new Date('2026-01-01T10:01:00Z'),
      },
    ]);
    expect(rows.map((r) => r.id).sort()).toEqual(['a2', 'b1']);
  });

  it('does not collapse rows when sourceMeasurementId is blank — falls back to observation id', () => {
    const rows = dedupeObservationsBySourceMeasurementId([
      {
        id: 'obs-1',
        sourceMeasurementId: '   ',
        voltageObservedAt: new Date('2026-01-01T08:00:00Z'),
        createdAt: new Date('2026-01-01T08:00:00Z'),
      },
      {
        id: 'obs-2',
        sourceMeasurementId: '',
        voltageObservedAt: new Date('2026-01-01T09:00:00Z'),
        createdAt: new Date('2026-01-01T09:00:00Z'),
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(dedupeKeyForObservationRow(rows[0])).toBe('observation:obs-2');
  });
});
