import { BatteryShutdownStateAlignmentClass } from '@prisma/client';
import { isValidRestLadderObservation } from './generalized-evidence-provenance.helpers';

describe('isValidRestLadderObservation age boundaries (C4.1)', () => {
  it('AGE_A: null actualRestAgeMs → invalid', () => {
    expect(
      isValidRestLadderObservation({
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
        actualRestAgeMs: null,
      }),
    ).toBe(false);
  });

  it('AGE_B: negative actualRestAgeMs → invalid', () => {
    expect(
      isValidRestLadderObservation({
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
        actualRestAgeMs: -1,
      }),
    ).toBe(false);
  });

  it('AGE_C: zero actualRestAgeMs → invalid (anchor semantics, not ladder point)', () => {
    expect(
      isValidRestLadderObservation({
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
        actualRestAgeMs: 0,
      }),
    ).toBe(false);
  });

  it('AGE_D: 1 ms + ALIGNED → valid', () => {
    expect(
      isValidRestLadderObservation({
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
        actualRestAgeMs: 1,
      }),
    ).toBe(true);
  });

  it('AGE_E: 1 ms + PARTIAL → valid', () => {
    expect(
      isValidRestLadderObservation({
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.PARTIAL,
        actualRestAgeMs: 1,
      }),
    ).toBe(true);
  });

  it('AGE_F: 1 ms + SKEWED → invalid', () => {
    expect(
      isValidRestLadderObservation({
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.SKEWED,
        actualRestAgeMs: 1,
      }),
    ).toBe(false);
  });

  it('AGE_G: 1 ms + UNKNOWN alignment → invalid', () => {
    expect(
      isValidRestLadderObservation({
        stateAlignmentClass: BatteryShutdownStateAlignmentClass.UNKNOWN,
        actualRestAgeMs: 1,
      }),
    ).toBe(false);
  });
});
