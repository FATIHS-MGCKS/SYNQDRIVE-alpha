import { resolveBrakeInitializeMeasured } from './brake-initialize-measured.util';

describe('brake-initialize-measured.util', () => {
  it('strips AI/registration disc values without workshop confirmation', () => {
    expect(
      resolveBrakeInitializeMeasured({
        source: 'manual',
        frontRotorWidthMm: 25,
        rearRotorWidthMm: 12,
        frontPadMm: 10,
      }),
    ).toEqual({});
  });

  it('allows measured snapshot when measurementConfirmed is true', () => {
    expect(
      resolveBrakeInitializeMeasured({
        source: 'manual',
        measurementConfirmed: true,
        frontRotorWidthMm: 25,
        frontPadMm: 9.5,
      }),
    ).toEqual({
      frontDiscMm: 25,
      frontPadMm: 9.5,
    });
  });

  it('allows workshop source without explicit confirmation flag', () => {
    expect(
      resolveBrakeInitializeMeasured({
        source: 'workshop',
        rearPadMm: 8,
      }),
    ).toEqual({ rearPadMm: 8 });
  });
});
