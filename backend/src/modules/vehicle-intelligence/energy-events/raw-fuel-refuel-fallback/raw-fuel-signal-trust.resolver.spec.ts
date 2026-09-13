import { FuelType } from '@prisma/client';
import {
  ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE,
  resolveRawFuelSignalTrust,
} from './raw-fuel-signal-trust.resolver';

describe('RawFuelSignalTrustResolver', () => {
  it('absolute trust authority is not yet available', () => {
    expect(ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE).toBe(false);
  });

  it('defaults absoluteSignalTrust to UNKNOWN', () => {
    expect(resolveRawFuelSignalTrust().absoluteSignalTrust).toBe('UNKNOWN');
  });

  it('does not derive TRUSTED from fuelType alone', () => {
    for (const fuelType of Object.values(FuelType)) {
      expect(
        resolveRawFuelSignalTrust({ fuelType, samplePresenceOnly: true }).absoluteSignalTrust,
      ).toBe('UNKNOWN');
    }
  });

  it('does not derive promotion TRUSTED from absolute sample presence alone', () => {
    const result = resolveRawFuelSignalTrust({
      samples: [{ timestamp: new Date('2026-09-13T08:00:00.000Z'), absoluteLiters: 42.5 }],
      scanWindowStart: new Date('2026-09-13T07:00:00.000Z'),
      scanWindowEnd: new Date('2026-09-13T09:00:00.000Z'),
    });
    expect(result.absoluteSignalTrust).toBe('UNKNOWN');
    expect(result.absoluteDetectionAdmissibility).toBe('ADMISSIBLE');
  });

  it('relative availability is separate and requires semantically valid relative samples', () => {
    const windowStart = new Date('2026-09-13T07:00:00.000Z');
    const windowEnd = new Date('2026-09-13T09:00:00.000Z');

    expect(
      resolveRawFuelSignalTrust({
        samples: [{ timestamp: new Date('2026-09-13T08:00:00.000Z'), relativePercent: 55 }],
        scanWindowStart: windowStart,
        scanWindowEnd: windowEnd,
      }),
    ).toEqual({
      absoluteSignalTrust: 'UNKNOWN',
      absoluteDetectionAdmissibility: 'UNKNOWN',
      relativeSignalAvailable: true,
    });

    expect(
      resolveRawFuelSignalTrust({
        samples: [{ timestamp: new Date('2026-09-13T08:00:00.000Z'), relativePercent: 150 }],
        scanWindowStart: windowStart,
        scanWindowEnd: windowEnd,
      }).relativeSignalAvailable,
    ).toBe(false);
  });

  it('relative availability does not imply absolute TRUSTED', () => {
    const result = resolveRawFuelSignalTrust({
      samples: [{ timestamp: new Date('2026-09-13T08:00:00.000Z'), relativePercent: 40 }],
      scanWindowStart: new Date('2026-09-13T07:00:00.000Z'),
      scanWindowEnd: new Date('2026-09-13T09:00:00.000Z'),
    });
    expect(result.relativeSignalAvailable).toBe(true);
    expect(result.absoluteSignalTrust).toBe('UNKNOWN');
    expect(result.absoluteDetectionAdmissibility).toBe('UNKNOWN');
  });

  it('negative absolute liters are INADMISSIBLE not ADMISSIBLE', () => {
    const result = resolveRawFuelSignalTrust({
      samples: [{ timestamp: new Date('2026-09-13T08:00:00.000Z'), absoluteLiters: -1 }],
      scanWindowStart: new Date('2026-09-13T07:00:00.000Z'),
      scanWindowEnd: new Date('2026-09-13T09:00:00.000Z'),
    });
    expect(result.absoluteDetectionAdmissibility).toBe('INADMISSIBLE');
    expect(result.absoluteSignalTrust).toBe('UNKNOWN');
  });
});
