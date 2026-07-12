import { defaultTariffAssignmentValidFrom, zonedStartOfDayToUtc } from './tariff-instant.util';

describe('tariff-instant.util', () => {
  it('defaultTariffAssignmentValidFrom uses start of org calendar day', () => {
    const reference = new Date('2026-07-12T18:22:00.000Z');
    const validFrom = defaultTariffAssignmentValidFrom('Europe/Berlin', reference);
    const expected = zonedStartOfDayToUtc('2026-07-12', 'Europe/Berlin');
    expect(validFrom.toISOString()).toBe(expected.toISOString());
  });

  it('default assignment validFrom is before same-day afternoon pickup in Berlin', () => {
    const reference = new Date('2026-07-12T16:22:00.000Z'); // 18:22 CEST
    const validFrom = defaultTariffAssignmentValidFrom('Europe/Berlin', reference);
    const pickup = new Date('2026-07-12T08:00:00.000Z'); // 10:00 CEST
    expect(validFrom.getTime()).toBeLessThanOrEqual(pickup.getTime());
  });
});
