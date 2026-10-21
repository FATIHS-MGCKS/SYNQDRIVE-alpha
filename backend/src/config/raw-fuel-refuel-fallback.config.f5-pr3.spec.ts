import {
  RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV,
  RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
  canExecuteFallbackG2Handoff,
  evaluateFallbackG2HandoffAuthority,
  isRfrfFallbackG2HandoffAuthorized,
  parseRfrfFallbackG2HandoffAuthorized,
} from './raw-fuel-refuel-fallback.config';

describe('F5-PR3 fallback G2 handoff authority', () => {
  const baseEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...baseEnv };
  });

  it('defaults handoff authority to false', () => {
    delete process.env[RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV];
    expect(isRfrfFallbackG2HandoffAuthorized()).toBe(false);
    expect(canExecuteFallbackG2Handoff()).toBe(false);
  });

  it('rejects non-canonical truthy handoff values', () => {
    for (const value of ['1', 'yes', 'on', 'enabled', '0', 'false', '']) {
      process.env[RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV] = value;
      expect(isRfrfFallbackG2HandoffAuthorized()).toBe(false);
    }
    expect(parseRfrfFallbackG2HandoffAuthorized('true')).toBe(true);
  });

  it('requires convergence AND promotion AND handoff for G2 participation', () => {
    delete process.env[RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV];
    delete process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV];
    delete process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV];
    expect(evaluateFallbackG2HandoffAuthority().detail).toBe('handoff_not_authorized');

    process.env[RFRF_FALLBACK_G2_HANDOFF_AUTHORIZED_ENV] = 'true';
    expect(evaluateFallbackG2HandoffAuthority().detail).toBe('promotion_execution_not_authorized');

    process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV] = 'true';
    expect(evaluateFallbackG2HandoffAuthority().detail).toBe('convergence_not_authorized');

    process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = 'true';
    expect(evaluateFallbackG2HandoffAuthority().authorized).toBe(true);
  });
});
