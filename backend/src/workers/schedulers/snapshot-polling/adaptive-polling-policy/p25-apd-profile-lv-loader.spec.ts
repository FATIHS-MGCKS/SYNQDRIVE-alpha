import { buildP25ApdProfileLvLoaderWhere } from './p25-apd-profile-lv-loader';

describe('buildP25ApdProfileLvLoaderWhere', () => {
  const decisionAtMs = Date.parse('2026-10-09T21:42:14.076Z');

  it('bounds provider and observed timestamps at decision time', () => {
    const where = buildP25ApdProfileLvLoaderWhere('veh-1', decisionAtMs);
    expect(where.providerTimestamp).toEqual({
      not: null,
      lte: new Date(decisionAtMs),
    });
    expect(where.observedAt).toEqual({ lte: new Date(decisionAtMs) });
  });
});
