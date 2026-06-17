import {
  buildBooleanWarnLight,
  buildOilLevelLight,
  buildTirePressureLight,
  isExplicitOff,
} from './dashboard-warning-lights.parsing';

describe('dashboard-warning-lights.parsing', () => {
  const now = '2026-06-16T12:00:00.000Z';

  it('null is not explicit off', () => {
    expect(isExplicitOff(null)).toBe(false);
    expect(isExplicitOff(undefined)).toBe(false);
  });

  it('explicit false/off becomes off_confirmed for boolean warn light', () => {
    const light = buildBooleanWarnLight({
      key: 'engine_limp_mode',
      label: 'Motorwarnung / Notlauf',
      sourceSignal: 'engine.get.limp_mode',
      entry: { value: false, timestamp: now },
      groupFreshness: 'fresh',
      groupObservedAt: now,
      activeReason: 'active',
      activeAction: 'act',
      offReason: 'off',
      offAction: 'none',
      activeSeverity: 'critical',
      activeRentalImpact: 'block_rental',
      unsupportedReason: 'unsupported',
      noEventReason: 'no event',
    });
    expect(light.state).toBe('off_confirmed');
  });

  it('null warn flag is no_event_yet not off_confirmed', () => {
    const light = buildBooleanWarnLight({
      key: 'engine_limp_mode',
      label: 'Motorwarnung / Notlauf',
      sourceSignal: 'engine.get.limp_mode',
      entry: { value: null, timestamp: now },
      groupFreshness: 'fresh',
      groupObservedAt: now,
      activeReason: 'active',
      activeAction: 'act',
      offReason: 'off',
      offAction: 'none',
      activeSeverity: 'critical',
      activeRentalImpact: 'block_rental',
      unsupportedReason: 'unsupported',
      noEventReason: 'no event',
    });
    expect(light.state).toBe('no_event_yet');
  });

  it('oil low is critical', () => {
    const oil = buildOilLevelLight({
      entry: { value: 'low', timestamp: now },
      groupFreshness: 'fresh',
      groupObservedAt: now,
    });
    expect(oil.state).toBe('active');
    expect(oil.severity).toBe('critical');
  });

  it('tire pressure ALERT is critical', () => {
    const tire = buildTirePressureLight({
      tireStatuses: { FL: 'ALERT', FR: 'OK' },
      groupFreshness: 'fresh',
      groupObservedAt: now,
      dashboardEntry: { value: null, timestamp: now },
    });
    expect(tire.state).toBe('active');
    expect(tire.severity).toBe('critical');
  });

  it('brake pre-warning active is warning', () => {
    const brake = buildBooleanWarnLight({
      key: 'brake_lining_wear_pre_warning',
      label: 'Bremsbelag-Vorwarnung',
      sourceSignal: 'diagnostics.get.brake_lining_wear_pre_warning',
      entry: { value: true, timestamp: now },
      groupFreshness: 'fresh',
      groupObservedAt: now,
      activeReason: 'active',
      activeAction: 'inspect',
      offReason: 'off',
      offAction: 'none',
      activeSeverity: 'warning',
      activeRentalImpact: 'inspect_before_next_rental',
      unsupportedReason: 'unsupported',
      noEventReason: 'no event',
    });
    expect(brake.state).toBe('active');
    expect(brake.severity).toBe('warning');
  });
});
