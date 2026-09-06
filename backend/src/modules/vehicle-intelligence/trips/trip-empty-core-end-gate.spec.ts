import { assessSuccessfulEmptyCoreEndEligibility } from './trip-empty-core-end-gate';

const MIN_INACTIVITY = 120_000;

describe('trip-empty-core-end-gate (R5)', () => {
  const inactiveTelemetry = {
    isIgnitionOn: false,
    speedKmh: 0,
    engineLoad: 0,
  };

  it('keeps open when VLS still active', () => {
    const result = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: 150_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      telemetry: { isIgnitionOn: true, speedKmh: 5, engineLoad: 0 },
      perfReadings: [],
      routePoints: [],
      profile: 'ICE',
    });
    expect(result.eligible).toBe(false);
    expect(result.forensics.decision).toBe('KEEP_OPEN');
    expect(result.forensics.reason).toBe('vls_still_active');
  });

  it('keeps open when performance shows activity', () => {
    const result = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: 150_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      telemetry: inactiveTelemetry,
      perfReadings: [{ timestamp: 't', rpm: 800, throttlePosition: 0, engineLoad: 0, engineCoolantTempC: null }],
      routePoints: [],
      profile: 'ICE',
    });
    expect(result.eligible).toBe(false);
    expect(result.forensics.reason).toBe('performance_still_active');
  });

  it('keeps open when route shows motion above speedMotionKmh', () => {
    const result = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: 150_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      telemetry: inactiveTelemetry,
      perfReadings: [],
      routePoints: [{ latitude: 1, longitude: 2, speedKmh: 10, timestamp: 't' }],
      profile: 'ICE',
    });
    expect(result.eligible).toBe(false);
    expect(result.forensics.reason).toBe('route_motion_detected');
  });

  it('keeps open when VLS missing/ambiguous', () => {
    const result = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: 150_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      telemetry: null,
      perfReadings: [],
      routePoints: [],
      profile: 'ICE',
    });
    expect(result.eligible).toBe(false);
    expect(result.forensics.vlsInactivity).toBe('unknown');
    expect(result.forensics.reason).toBe('vls_missing_or_ambiguous');
  });

  it('allows POSSIBLE_END when all corroboration passes', () => {
    const result = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: 150_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      telemetry: inactiveTelemetry,
      perfReadings: [],
      routePoints: [{ latitude: 1, longitude: 2, speedKmh: 0, timestamp: 't' }],
      profile: 'ICE',
    });
    expect(result.eligible).toBe(true);
    expect(result.forensics.decision).toBe('POSSIBLE_END');
    expect(result.forensics.reason).toBe('empty_core_corroborated_inactivity');
  });
});
