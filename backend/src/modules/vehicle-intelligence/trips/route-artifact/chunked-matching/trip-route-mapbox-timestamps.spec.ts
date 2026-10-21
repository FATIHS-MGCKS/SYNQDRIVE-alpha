import { resolveChunkTimestamps } from './trip-route-mapbox-timestamps';

describe('resolveChunkTimestamps', () => {
  it('accepts strictly increasing timestamps', () => {
    const result = resolveChunkTimestamps([
      { timestamp: '2026-08-01T10:00:00.000Z' },
      { timestamp: '2026-08-01T10:00:07.000Z' },
    ]);
    expect(result.include).toBe(true);
    expect(result.timestamps).toEqual([
      Math.floor(Date.parse('2026-08-01T10:00:00.000Z') / 1000),
      Math.floor(Date.parse('2026-08-01T10:00:07.000Z') / 1000),
    ]);
  });

  it('omits equal timestamps', () => {
    const result = resolveChunkTimestamps([
      { timestamp: '2026-08-01T10:00:00.000Z' },
      { timestamp: '2026-08-01T10:00:00.000Z' },
    ]);
    expect(result.include).toBe(false);
    expect(result.reason).toBe('equal_timestamp');
  });

  it('omits invalid timestamps', () => {
    const result = resolveChunkTimestamps([
      { timestamp: 'not-a-date' },
      { timestamp: '2026-08-01T10:00:07.000Z' },
    ]);
    expect(result.include).toBe(false);
    expect(result.reason).toBe('invalid_timestamp');
  });

  it('omits out-of-order timestamps', () => {
    const result = resolveChunkTimestamps([
      { timestamp: '2026-08-01T10:00:10.000Z' },
      { timestamp: '2026-08-01T10:00:07.000Z' },
    ]);
    expect(result.include).toBe(false);
    expect(result.reason).toBe('out_of_order_timestamp');
  });
});
