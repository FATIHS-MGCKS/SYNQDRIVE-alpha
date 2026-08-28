import { resolveBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import {
  BatteryChemistry,
  BatteryDriveProfile,
} from '../battery-v2-domain';
import {
  buildLvRestWindowPolicyContext,
  canOpenRestWindowCandidate,
  isEngineOffForRest,
  isEngineOffForRestWindowOpening,
  isValidRestSnapshot,
} from './lv-rest-window.policy';
import type { LvRestWindowSignalContext } from './lv-rest-window.types';

const ANCHOR = new Date('2026-08-28T12:01:35.000Z');

function icePolicy() {
  return buildLvRestWindowPolicyContext(
    resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.LEAD_ACID,
      lvSignalPresent: true,
    }),
  );
}

function baseOpeningSignal(
  overrides: Partial<LvRestWindowSignalContext> = {},
): LvRestWindowSignalContext {
  return {
    observedAt: ANCHOR,
    providerObservedAt: ANCHOR,
    providerError: false,
    speedKmh: 0,
    ignitionOn: false,
    engineRunning: false,
    hasActiveTrip: false,
    isLvCharging: false,
    isHvCharging: false,
    lvVoltage: 12.39,
    lastActivityAt: ANCHOR,
    tripEndAt: ANCHOR,
    tripId: 'trip-61715ecd',
    ...overrides,
  };
}

describe('isEngineOffForRestWindowOpening (ICE opening gate)', () => {
  const policyOn = true;

  it('A: ignition on rejects even with zero engine load', () => {
    expect(
      isEngineOffForRestWindowOpening(
        baseOpeningSignal({ ignitionOn: true, engineRunning: false }),
        policyOn,
      ),
    ).toBe(false);
    expect(
      canOpenRestWindowCandidate(
        baseOpeningSignal({ ignitionOn: true, engineRunning: false }),
        icePolicy(),
      ).reason,
    ).toBe('engine_not_off');
  });

  it('B: ignition off with zero load passes', () => {
    expect(
      isEngineOffForRestWindowOpening(
        baseOpeningSignal({ ignitionOn: false, engineRunning: false }),
        policyOn,
      ),
    ).toBe(true);
  });

  it('C: production-shaped — ignition off, speed 0, residual engine_load 10.196 passes opening gate', () => {
    const signal = baseOpeningSignal({
      ignitionOn: false,
      speedKmh: 0,
      engineRunning: true,
      lvVoltage: 12.39,
    });
    expect(isEngineOffForRestWindowOpening(signal, policyOn)).toBe(true);
    expect(canOpenRestWindowCandidate(signal, icePolicy()).ok).toBe(true);
    expect(isValidRestSnapshot(signal, icePolicy(), ANCHOR).ok).toBe(true);
  });

  it('D: ignition off but moving is rejected by speed gate (engine proxy still conservative when not at rest)', () => {
    const signal = baseOpeningSignal({
      ignitionOn: false,
      speedKmh: 12,
      engineRunning: true,
    });
    expect(isEngineOffForRestWindowOpening(signal, policyOn)).toBe(false);
    expect(canOpenRestWindowCandidate(signal, icePolicy()).reason).toBe(
      'speed_not_zero',
    );
  });

  it('E: unknown ignition with high engine load stays conservative', () => {
    const signal = baseOpeningSignal({
      ignitionOn: null,
      engineRunning: true,
    });
    expect(isEngineOffForRestWindowOpening(signal, policyOn)).toBe(false);
    expect(canOpenRestWindowCandidate(signal, icePolicy()).reason).toBe(
      'engine_not_off',
    );
  });

  it('F: ignition off, speed 0, engine load unavailable passes', () => {
    const signal = baseOpeningSignal({
      ignitionOn: false,
      engineRunning: null,
    });
    expect(isEngineOffForRestWindowOpening(signal, policyOn)).toBe(true);
  });
});

describe('isEngineOffForRest (downstream measurement quality — unchanged)', () => {
  it('still rejects residual engine_load even when ignition is off', () => {
    const signal = baseOpeningSignal({
      ignitionOn: false,
      engineRunning: true,
    });
    expect(isEngineOffForRest(signal, true)).toBe(false);
    expect(isEngineOffForRestWindowOpening(signal, true)).toBe(true);
  });
});
