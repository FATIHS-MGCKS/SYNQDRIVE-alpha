import { buildDataSummaryQuery, parseDataSummaryResponse } from './data-summary.query';

describe('data-summary.query', () => {
  it('builds dataSummary query with eventDataSummary fields', () => {
    const query = buildDataSummaryQuery(186946);
    expect(query).toContain('dataSummary(tokenId: 186946)');
    expect(query).toContain('eventDataSummary');
    expect(query).toContain('numberOfEvents');
  });

  it('parses GraphQL data payload', () => {
    const parsed = parseDataSummaryResponse({
      dataSummary: {
        numberOfSignals: 42,
        lastSignalSeen: '2026-07-16T10:00:00.000Z',
        eventDataSummary: [{ name: 'behavior.harshAcceleration', numberOfEvents: 3 }],
      },
    });
    expect(parsed?.numberOfSignals).toBe(42);
    expect(parsed?.eventDataSummary?.[0]?.name).toBe('behavior.harshAcceleration');
  });

  it('returns null for invalid payload', () => {
    expect(parseDataSummaryResponse(null)).toBeNull();
    expect(parseDataSummaryResponse({})).toBeNull();
  });
});
