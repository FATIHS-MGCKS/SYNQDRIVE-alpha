import {
  isBatteryV2HvFallbackChargeSessionEnabled,
  isLegacyCrankAssessmentEnabled,
  isBatteryV2ReadinessEnabled,
} from './battery-health-v2.config';

describe('battery-health-v2.config defaults', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('keeps TELEMETRY_POLL_FALLBACK charge sessions disabled by default (B-07)', () => {
    delete process.env.BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED;
    expect(isBatteryV2HvFallbackChargeSessionEnabled()).toBe(false);
  });

  it('keeps legacy crank assessment disabled by default', () => {
    delete process.env.BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED;
    expect(isLegacyCrankAssessmentEnabled()).toBe(false);
  });

  it('keeps readiness disabled by default', () => {
    delete process.env.BATTERY_V2_READINESS_ENABLED;
    expect(isBatteryV2ReadinessEnabled()).toBe(false);
  });
});
