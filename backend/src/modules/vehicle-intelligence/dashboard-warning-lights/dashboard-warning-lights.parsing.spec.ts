import {
  buildBooleanWarnLight,
  buildOilLevelLight,
  buildTirePressureLight,
  enrichDashboardLightMetadata,
  isExplicitOff,
} from './dashboard-warning-lights.parsing';

describe('dashboard-warning-lights.parsing', () => {
  const now = new Date('2026-06-16T12:00:00.000Z');
  const nowIso = now.toISOString();
  const stale20hIso = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('null is not explicit off', () => {
    expect(isExplicitOff(null)).toBe(false);
    expect(isExplicitOff(undefined)).toBe(false);
  });

  it('explicit false/off becomes off_confirmed for boolean warn light', () => {
    const light = buildBooleanWarnLight({
      key: 'engine_limp_mode',
      label: 'Motorwarnung / Notlauf',
      sourceSignal: 'engine.get.limp_mode',
      entry: { value: false, timestamp: nowIso },
      groupFreshness: 'fresh',
      groupObservedAt: nowIso,
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
      entry: { value: null, timestamp: nowIso },
      groupFreshness: 'fresh',
      groupObservedAt: nowIso,
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
      entry: { value: 'low', timestamp: nowIso },
      groupFreshness: 'fresh',
      groupObservedAt: nowIso,
    });
    expect(oil.state).toBe('active');
    expect(oil.severity).toBe('critical');
  });

  it('tire pressure ALERT is critical', () => {
    const tire = buildTirePressureLight({
      tireStatuses: { FL: 'ALERT', FR: 'OK' },
      groupFreshness: 'fresh',
      groupObservedAt: nowIso,
      dashboardEntry: { value: null, timestamp: nowIso },
    });
    expect(tire.state).toBe('active');
    expect(tire.severity).toBe('critical');
  });

  it('brake pre-warning active is warning', () => {
    const brake = buildBooleanWarnLight({
      key: 'brake_lining_wear_pre_warning',
      label: 'Bremsbelag-Vorwarnung',
      sourceSignal: 'diagnostics.get.brake_lining_wear_pre_warning',
      entry: { value: true, timestamp: nowIso },
      groupFreshness: 'fresh',
      groupObservedAt: nowIso,
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

  describe('per-signal freshness (group fresh)', () => {
    it('limp true with 20h-old sample → stale, not current active', () => {
      const built = buildBooleanWarnLight({
        key: 'engine_limp_mode',
        label: 'Motorwarnung / Notlauf',
        sourceSignal: 'engine.get.limp_mode',
        entry: { value: true, timestamp: stale20hIso },
        groupFreshness: 'fresh',
        groupObservedAt: nowIso,
        activeReason: 'active',
        activeAction: 'act',
        offReason: 'off',
        offAction: 'none',
        activeSeverity: 'critical',
        activeRentalImpact: 'block_rental',
        unsupportedReason: 'unsupported',
        noEventReason: 'no event',
      });
      const limp = enrichDashboardLightMetadata(built, 'fresh');
      expect(built.state).toBe('stale');
      expect(limp.freshness).toBe('stale');
      expect(limp.isCurrentActive).toBe(false);
      expect(limp.isHistorical).toBe(true);
    });

    it('oil LOW with 20h-old sample → stale, not current active', () => {
      const built = buildOilLevelLight({
        entry: { value: 'low', timestamp: stale20hIso },
        groupFreshness: 'fresh',
        groupObservedAt: nowIso,
      });
      const oil = enrichDashboardLightMetadata(built, 'fresh');
      expect(built.state).toBe('stale');
      expect(oil.freshness).toBe('stale');
      expect(oil.isCurrentActive).toBe(false);
    });

    it('oil HIGH with 20h-old sample → stale, not current warning', () => {
      const built = buildOilLevelLight({
        entry: { value: 'high', timestamp: stale20hIso },
        groupFreshness: 'fresh',
        groupObservedAt: nowIso,
      });
      const oil = enrichDashboardLightMetadata(built, 'fresh');
      expect(built.state).toBe('stale');
      expect(oil.isCurrentActive).toBe(false);
    });

    it('fresh controls remain valid', () => {
      const limpOn = enrichDashboardLightMetadata(
        buildBooleanWarnLight({
          key: 'engine_limp_mode',
          label: 'Motorwarnung / Notlauf',
          sourceSignal: 'engine.get.limp_mode',
          entry: { value: true, timestamp: nowIso },
          groupFreshness: 'fresh',
          groupObservedAt: nowIso,
          activeReason: 'active',
          activeAction: 'act',
          offReason: 'off',
          offAction: 'none',
          activeSeverity: 'critical',
          activeRentalImpact: 'block_rental',
          unsupportedReason: 'unsupported',
          noEventReason: 'no event',
        }),
        'fresh',
      );
      expect(limpOn.state).toBe('active');
      expect(limpOn.isCurrentActive).toBe(true);
      expect(limpOn.rentalImpact).toBe('block_rental');

      const limpOff = enrichDashboardLightMetadata(
        buildBooleanWarnLight({
          key: 'engine_limp_mode',
          label: 'Motorwarnung / Notlauf',
          sourceSignal: 'engine.get.limp_mode',
          entry: { value: false, timestamp: nowIso },
          groupFreshness: 'fresh',
          groupObservedAt: nowIso,
          activeReason: 'active',
          activeAction: 'act',
          offReason: 'off',
          offAction: 'none',
          activeSeverity: 'critical',
          activeRentalImpact: 'block_rental',
          unsupportedReason: 'unsupported',
          noEventReason: 'no event',
        }),
        'fresh',
      );
      expect(limpOff.state).toBe('off_confirmed');

      const oilLow = enrichDashboardLightMetadata(
        buildOilLevelLight({
          entry: { value: 'low', timestamp: nowIso },
          groupFreshness: 'fresh',
          groupObservedAt: nowIso,
        }),
        'fresh',
      );
      expect(oilLow.state).toBe('active');
      expect(oilLow.isCurrentActive).toBe(true);
      expect(oilLow.rentalImpact).toBe('block_rental');

      const oilHigh = enrichDashboardLightMetadata(
        buildOilLevelLight({
          entry: { value: 'high', timestamp: nowIso },
          groupFreshness: 'fresh',
          groupObservedAt: nowIso,
        }),
        'fresh',
      );
      expect(oilHigh.state).toBe('active');
      expect(oilHigh.isCurrentActive).toBe(true);
      expect(oilHigh.rentalImpact).toBe('inspect_before_next_rental');

      const oilOk = enrichDashboardLightMetadata(
        buildOilLevelLight({
          entry: { value: 'ok', timestamp: nowIso },
          groupFreshness: 'fresh',
          groupObservedAt: nowIso,
        }),
        'fresh',
      );
      expect(oilOk.state).toBe('off_confirmed');
    });
  });
});
