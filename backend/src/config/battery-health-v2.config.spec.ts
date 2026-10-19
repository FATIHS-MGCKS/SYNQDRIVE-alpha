import {
  isBatteryV2HvChargingCounterBucketCaptureEnabled,
  isBatteryV2HvChargingCounterVehicleAllowlisted,
  isBatteryV2HvFallbackChargeSessionEnabled,
  isLegacyCrankAssessmentEnabled,
  isBatteryV2ReadinessEnabled,
  isBatteryV2RestSessionFeaturesShadowEnabled,
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

  it('keeps M3.3C rest-session feature shadow disabled by default', () => {
    delete process.env.BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED;
    expect(isBatteryV2RestSessionFeaturesShadowEnabled()).toBe(false);
  });

  it('keeps HV R22 charging counter capture disabled by default', () => {
    delete process.env.BATTERY_V2_HV_CHARGING_COUNTER_BUCKET_CAPTURE_ENABLED;
    expect(isBatteryV2HvChargingCounterBucketCaptureEnabled()).toBe(false);
  });

  it('denies all vehicles when R22 allowlist unset', () => {
    delete process.env.BATTERY_V2_HV_CHARGING_COUNTER_VEHICLE_ALLOWLIST;
    expect(
      isBatteryV2HvChargingCounterVehicleAllowlisted(
        '68868291-5478-42cd-b0c4-cc77b2a78e21',
      ),
    ).toBe(false);
  });
});
