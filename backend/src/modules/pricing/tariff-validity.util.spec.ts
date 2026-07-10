import { PriceTariffVersionStatus } from '@prisma/client';
import {
  compareResolvableVersions,
  isEffectiveAt,
  pickEffectiveTariffVersion,
} from './tariff-validity.util';
import { zonedStartOfDayToUtc } from './tariff-instant.util';

describe('tariff-validity.util', () => {
  const v = (
    id: string,
    status: PriceTariffVersionStatus,
    from: string,
    to: string | null,
    versionNumber: number,
  ) => ({
    id,
    status,
    validFrom: new Date(from),
    validTo: to ? new Date(to) : null,
    versionNumber,
  });

  it('validFrom is inclusive', () => {
    const window = { validFrom: new Date('2026-08-01T00:00:00.000Z'), validTo: null };
    expect(isEffectiveAt(window, new Date('2026-08-01T00:00:00.000Z'))).toBe(true);
  });

  it('validTo is exclusive', () => {
    const window = {
      validFrom: new Date('2026-07-01T00:00:00.000Z'),
      validTo: new Date('2026-08-01T00:00:00.000Z'),
    };
    expect(isEffectiveAt(window, new Date('2026-07-31T23:59:59.999Z'))).toBe(true);
    expect(isEffectiveAt(window, new Date('2026-08-01T00:00:00.000Z'))).toBe(false);
  });

  it('picks scheduled version for future pickup at switch boundary', () => {
    const versions = [
      v('old', 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 1),
      v('new', 'SCHEDULED', '2026-08-01T00:00:00.000Z', null, 2),
    ];
    const pickup = new Date('2026-08-01T00:00:00.000Z');
    expect(pickEffectiveTariffVersion(versions, pickup)?.id).toBe('new');
  });

  it('picks old version before switch', () => {
    const versions = [
      v('old', 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 1),
      v('new', 'SCHEDULED', '2026-08-01T00:00:00.000Z', null, 2),
    ];
    const pickup = new Date('2026-07-20T12:00:00.000Z');
    expect(pickEffectiveTariffVersion(versions, pickup)?.id).toBe('old');
  });

  it('ignores DRAFT versions', () => {
    const versions = [
      v('draft', 'DRAFT', '2026-01-01T00:00:00.000Z', null, 99),
      v('live', 'ACTIVE', '2026-01-01T00:00:00.000Z', null, 1),
    ];
    expect(pickEffectiveTariffVersion(versions, new Date('2026-07-20T00:00:00.000Z'))?.id).toBe(
      'live',
    );
  });

  it('orders by validFrom desc then versionNumber', () => {
    const a = v('a', 'ACTIVE', '2026-08-01T00:00:00.000Z', null, 1);
    const b = v('b', 'SCHEDULED', '2026-08-01T00:00:00.000Z', null, 2);
    expect(compareResolvableVersions(a, b)).toBeGreaterThan(0);
  });
});

describe('tariff-instant.util — DST', () => {
  it('resolves Europe/Berlin summer date to UTC start of day', () => {
    const utc = zonedStartOfDayToUtc('2026-08-01', 'Europe/Berlin');
    expect(utc.toISOString()).toBe('2026-07-31T22:00:00.000Z');
  });

  it('resolves Europe/Berlin winter date to UTC start of day', () => {
    const utc = zonedStartOfDayToUtc('2026-01-15', 'Europe/Berlin');
    expect(utc.toISOString()).toBe('2026-01-14T23:00:00.000Z');
  });
});
