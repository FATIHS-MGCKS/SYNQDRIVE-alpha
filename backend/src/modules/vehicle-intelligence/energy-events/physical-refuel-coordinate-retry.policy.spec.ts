import {
  COORDINATE_HOLD_MISSING_DIMO_TOKEN,
  computeNextCoordinateRetryAt,
  isCoordinateStatusRetryable,
  isCoordinateStatusTerminal,
  shouldAttemptCoordinateResolution,
} from './physical-refuel-coordinate-retry.policy';

describe('physical-refuel-coordinate-retry.policy', () => {
  const asOf = Date.parse('2026-09-04T12:00:00.000Z');

  it('classifies terminal coordinate statuses', () => {
    expect(isCoordinateStatusTerminal('MISSING_FUEL_RISE_ONSET')).toBe(true);
    expect(isCoordinateStatusTerminal('NO_DWELL_FOUND')).toBe(true);
    expect(isCoordinateStatusRetryable(COORDINATE_HOLD_MISSING_DIMO_TOKEN)).toBe(true);
  });

  it('R1 does not attempt coordinate before next retry due', () => {
    expect(
      shouldAttemptCoordinateResolution({
        coordinateLatitude: null,
        coordinateLongitude: null,
        coordinateSource: null,
        coordinateSelectionStatus: COORDINATE_HOLD_MISSING_DIMO_TOKEN,
        nextCoordinateRetryAt: new Date(asOf + 60_000),
        asOfMs: asOf,
      }),
    ).toBe(false);
  });

  it('R2 attempts coordinate when retry becomes due', () => {
    expect(
      shouldAttemptCoordinateResolution({
        coordinateLatitude: null,
        coordinateLongitude: null,
        coordinateSource: null,
        coordinateSelectionStatus: COORDINATE_HOLD_MISSING_DIMO_TOKEN,
        nextCoordinateRetryAt: new Date(asOf - 1),
        asOfMs: asOf,
      }),
    ).toBe(true);
  });

  it('applies exponential backoff for next retry', () => {
    const first = computeNextCoordinateRetryAt(1, asOf);
    const second = computeNextCoordinateRetryAt(2, asOf);
    expect(first.getTime() - asOf).toBe(120_000);
    expect(second.getTime() - asOf).toBe(240_000);
  });

  it('null coordinate status allows initial attempt', () => {
    expect(
      shouldAttemptCoordinateResolution({
        coordinateLatitude: null,
        coordinateLongitude: null,
        coordinateSource: null,
        coordinateSelectionStatus: null,
        nextCoordinateRetryAt: null,
        asOfMs: asOf,
      }),
    ).toBe(true);
  });

  it('terminal coordinate status does not retry', () => {
    expect(
      shouldAttemptCoordinateResolution({
        coordinateLatitude: null,
        coordinateLongitude: null,
        coordinateSource: null,
        coordinateSelectionStatus: 'NO_DWELL_FOUND_FOR_STABLE_EVIDENCE',
        nextCoordinateRetryAt: null,
        asOfMs: asOf,
      }),
    ).toBe(false);
  });

  it('RC semantics: retry count increments once per failed retryable attempt', () => {
    const first = computeNextCoordinateRetryAt(1, asOf);
    const second = computeNextCoordinateRetryAt(2, asOf);
    expect(first.getTime() - asOf).toBe(120_000);
    expect(second.getTime() - asOf).toBe(240_000);
    expect(isCoordinateStatusRetryable('ROUTE_UNAVAILABLE')).toBe(true);
    expect(isCoordinateStatusRetryable('ROUTE_EVIDENCE_STABILIZING')).toBe(true);
    expect(isCoordinateStatusTerminal('NO_DWELL_FOUND_FOR_STABLE_EVIDENCE')).toBe(true);
    expect(isCoordinateStatusRetryable('SELECTED')).toBe(false);
  });
});
