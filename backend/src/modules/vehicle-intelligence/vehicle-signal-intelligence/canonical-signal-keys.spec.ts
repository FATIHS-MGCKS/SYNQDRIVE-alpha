import {
  VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
  VSI_CANONICAL_SIGNAL_DEFINITIONS,
  VsiSignalValueCategory,
  getVsiCanonicalSignalDefinition,
  isVsiCanonicalSignalKey,
} from './canonical-signal-keys';

describe('canonical-signal-keys', () => {
  it('exposes a versioned vocabulary with distinct value categories', () => {
    expect(VSI_CANONICAL_SIGNAL_CONTRACT_VERSION).toBe('vsi-canonical-signal-v1');
    const lv = getVsiCanonicalSignalDefinition('lv_voltage');
    expect(lv.valueCategory).toBe(VsiSignalValueCategory.PHYSICAL_MEASUREMENT);
    expect(lv.primaryDimoSignalName).toBe('lowVoltageBatteryCurrentVoltage');

    const wake = getVsiCanonicalSignalDefinition('device_wake_event');
    expect(wake.valueCategory).toBe(VsiSignalValueCategory.LIFECYCLE_EVENT);

    const catalog = getVsiCanonicalSignalDefinition('provider_catalog_listing');
    expect(catalog.valueCategory).toBe(VsiSignalValueCategory.PROVIDER_METADATA);
  });

  it('does not treat catalog membership as vehicle support', () => {
    expect(Object.keys(VSI_CANONICAL_SIGNAL_DEFINITIONS).length).toBeGreaterThan(10);
    expect(isVsiCanonicalSignalKey('lv_voltage')).toBe(true);
    expect(isVsiCanonicalSignalKey('not_a_real_key')).toBe(false);
  });

  it('reuses driving canonical naming for engine_rpm', () => {
    const rpm = getVsiCanonicalSignalDefinition('engine_rpm');
    expect(rpm.drivingCanonicalKey).toBe('engine_rpm');
  });
});
