import {
  isDtc02AdaptiveSchedulerShadowEnabled,
  shouldRunDtc02AdaptiveSchedulerShadowForVehicle,
} from './dtc-02-adaptive-shadow.config';

const VID = 'b2c3d4e5-f6a7-4890-b123-456789abcdef';

describe('dtc-02-adaptive-shadow.config', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('is OFF by default', () => {
    delete process.env.DTC_02_ADAPTIVE_SCHEDULER_SHADOW_ENABLED;
    expect(isDtc02AdaptiveSchedulerShadowEnabled()).toBe(false);
    expect(shouldRunDtc02AdaptiveSchedulerShadowForVehicle(VID)).toBe(false);
  });

  it('requires valid allowlist when enabled', () => {
    process.env.DTC_02_ADAPTIVE_SCHEDULER_SHADOW_ENABLED = 'true';
    process.env.DTC_02_ADAPTIVE_SCHEDULER_SHADOW_VEHICLE_ALLOWLIST = VID;
    expect(shouldRunDtc02AdaptiveSchedulerShadowForVehicle(VID)).toBe(true);
    expect(shouldRunDtc02AdaptiveSchedulerShadowForVehicle('not-a-uuid')).toBe(false);
  });

  it('invalid allowlist disables per-vehicle shadow', () => {
    process.env.DTC_02_ADAPTIVE_SCHEDULER_SHADOW_ENABLED = 'true';
    process.env.DTC_02_ADAPTIVE_SCHEDULER_SHADOW_VEHICLE_ALLOWLIST = 'bad';
    expect(shouldRunDtc02AdaptiveSchedulerShadowForVehicle(VID)).toBe(false);
  });
});
