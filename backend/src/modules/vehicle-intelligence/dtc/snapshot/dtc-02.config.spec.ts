import {
  isDtc02WebhookCapabilityEnabled,
  shouldUseDtc02WebhookCapabilityForVehicle,
} from './dtc-02.config';

const VID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

describe('dtc-02.config', () => {
  const baseEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...baseEnv };
  });

  it('is disabled by default', () => {
    delete process.env.DTC_02_WEBHOOK_CAPABILITY_ENABLED;
    expect(isDtc02WebhookCapabilityEnabled()).toBe(false);
    expect(shouldUseDtc02WebhookCapabilityForVehicle(VID)).toBe(false);
  });

  it('requires 01A and allowlist for vehicle admission', () => {
    process.env.DTC_02_WEBHOOK_CAPABILITY_ENABLED = 'true';
    process.env.DTC_02_WEBHOOK_CAPABILITY_VEHICLE_ALLOWLIST = VID;
    expect(shouldUseDtc02WebhookCapabilityForVehicle(VID)).toBe(false);

    process.env.DTC_01A_SAFETY_FOUNDATION_ENABLED = 'true';
    expect(shouldUseDtc02WebhookCapabilityForVehicle(VID)).toBe(true);
    expect(shouldUseDtc02WebhookCapabilityForVehicle('00000000-0000-4000-8000-000000000001')).toBe(
      false,
    );
  });
});
