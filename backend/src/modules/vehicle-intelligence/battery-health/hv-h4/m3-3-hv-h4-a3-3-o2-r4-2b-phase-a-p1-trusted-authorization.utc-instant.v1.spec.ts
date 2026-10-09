import {
  parseUtcInstantStrictV1,
  resolveVerificationClockV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.utc-instant.v1';

describe('parseUtcInstantStrictV1', () => {
  it('accepts valid UTC instants with and without fractional seconds', () => {
    expect(parseUtcInstantStrictV1('2026-10-09T12:00:00.000Z')?.toISOString()).toBe(
      '2026-10-09T12:00:00.000Z',
    );
    expect(parseUtcInstantStrictV1('2026-10-09T12:00:00Z')?.toISOString()).toBe(
      '2026-10-09T12:00:00.000Z',
    );
  });

  it('rejects impossible calendar dates (H2)', () => {
    expect(parseUtcInstantStrictV1('2026-02-30T12:00:00.000Z')).toBeNull();
    expect(parseUtcInstantStrictV1('2023-02-29T12:00:00.000Z')).toBeNull();
    expect(parseUtcInstantStrictV1('2026-04-31T00:00:00.000Z')).toBeNull();
    expect(parseUtcInstantStrictV1('2026-13-01T00:00:00.000Z')).toBeNull();
    expect(parseUtcInstantStrictV1('2026-01-32T00:00:00.000Z')).toBeNull();
    expect(parseUtcInstantStrictV1('2026-01-01T25:00:00.000Z')).toBeNull();
  });
});

describe('resolveVerificationClockV1', () => {
  it('rejects non-finite injected clocks (H2)', () => {
    const invalid = resolveVerificationClockV1({ now: new Date(Number.NaN) });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.reasonCode).toBe('PHASE_A_P1_VERIFICATION_CLOCK_INVALID');
    }
    expect(resolveVerificationClockV1({ now: new Date(Number.POSITIVE_INFINITY) }).ok).toBe(false);
  });
});
