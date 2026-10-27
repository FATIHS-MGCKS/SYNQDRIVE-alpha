import { resolveBrakeInitializeMeasured } from './brake-initialize-measured.util';

describe('brake-initialize-measured.util', () => {
  const sources = ['manual', 'workshop', 'api', 'ai_document'] as const;

  it.each(sources)('source=%s without confirmation → no measured values', (source) => {
    expect(
      resolveBrakeInitializeMeasured({
        source,
        frontRotorWidthMm: 25,
        rearRotorWidthMm: 12,
        frontPadMm: 10,
      }),
    ).toEqual({});
  });

  it('measurementConfirmed client flag alone → no measured values (untrusted)', () => {
    expect(
      resolveBrakeInitializeMeasured({
        source: 'manual',
        measurementConfirmed: true,
        frontRotorWidthMm: 25,
        frontPadMm: 9.5,
      }),
    ).toEqual({});
  });

  it('flat initialize never forwards mm even when all fields present', () => {
    expect(
      resolveBrakeInitializeMeasured({
        source: 'api',
        measurementConfirmed: true,
        frontPadMm: 10,
        rearPadMm: 9,
        frontRotorWidthMm: 28,
        rearRotorWidthMm: 12,
      }),
    ).toEqual({});
  });
});
