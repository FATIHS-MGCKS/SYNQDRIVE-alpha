import { buildAvailableSignalsQuery } from './available-signals.query';

describe('buildAvailableSignalsQuery', () => {
  it('builds root availableSignals query for tokenId', () => {
    const query = buildAvailableSignalsQuery(192922);
    expect(query).toContain('availableSignals(tokenId: 192922)');
    expect(query).not.toContain('signalsLatest');
  });
});
