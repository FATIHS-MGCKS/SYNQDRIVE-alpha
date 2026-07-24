import { describe, expect, it } from 'vitest';
import {
  BASELINE_READ_ONLY_PERMISSIONS,
  BASELINE_TELEMETRY_SEEDS,
  VEHICLE_DETAIL_BASELINE_SCENARIOS,
  VEHICLE_DETAIL_TAB_LABELS,
  allVehicleDetailTabTargets,
  buildBaselineVehicleData,
  mapBaselineFleetRowWithNullTelemetry,
  resolveBaselineFleetDisplay,
  resolveBaselineMapPosition,
  resolveBaselineTelemetry,
} from './vehicle-detail-baseline.fixtures';
import {
  VEHICLE_DETAIL_TAB_KEYS,
  isVehicleDetailTab,
  vehicleOverviewTargetTab,
} from './vehicle-overview-navigation';

describe('vehicle detail baseline — scenario catalog', () => {
  it('documents all required baseline scenarios', () => {
    const ids = VEHICLE_DETAIL_BASELINE_SCENARIOS.map((s) => s.id);
    expect(ids).toContain('open-detail');
    expect(ids).toContain('vehicle-switch');
    expect(ids).toContain('tab-switch');
    expect(ids).toContain('status-display');
    expect(ids).toContain('telemetry-null-values');
    expect(ids).toContain('telemetry-missing-values');
    expect(ids).toContain('live-position');
    expect(ids).toContain('last-known-position');
    expect(ids).toContain('standby');
    expect(ids).toContain('soft-offline');
    expect(ids).toContain('offline');
    expect(ids).toContain('read-only-role');
    expect(ids).toContain('mobile-viewport');
    expect(ids).toHaveLength(13);
  });

  it('tab-switch: all 8 vehicle detail tabs are valid and labeled', () => {
    expect(VEHICLE_DETAIL_TAB_KEYS).toHaveLength(8);
    for (const tab of VEHICLE_DETAIL_TAB_KEYS) {
      expect(isVehicleDetailTab(tab)).toBe(true);
      expect(VEHICLE_DETAIL_TAB_LABELS[tab].length).toBeGreaterThan(0);
    }
    const targets = allVehicleDetailTabTargets();
    expect(targets).toHaveLength(8);
    expect(new Set(targets.map(vehicleOverviewTargetTab)).size).toBe(8);
  });
});

describe('vehicle detail baseline — telemetry freshness', () => {
  it('live-position: fresh signal resolves to live without warning', () => {
    const seed = BASELINE_TELEMETRY_SEEDS['live-position'];
    const freshness = resolveBaselineTelemetry(seed);
    expect(freshness.freshness).toBe('live');
    expect(freshness.shouldWarnUser).toBe(false);

    const vehicle = buildBaselineVehicleData({
      lastSignal: seed.input.lastSignal ?? undefined,
      onlineStatus: seed.onlineStatus,
    });
    const display = resolveBaselineFleetDisplay(vehicle);
    expect(display.telemetryStatus).toBe('live');
    expect(display.showTelemetryWarning).toBe(false);
  });

  it('standby: quiet device stays calm, primary status unchanged', () => {
    const seed = BASELINE_TELEMETRY_SEEDS.standby;
    const freshness = resolveBaselineTelemetry(seed);
    expect(freshness.freshness).toBe('standby');
    expect(freshness.shouldWarnUser).toBe(false);

    const display = resolveBaselineFleetDisplay(
      buildBaselineVehicleData({
        lastSignal: seed.input.lastSignal ?? undefined,
        onlineStatus: seed.onlineStatus,
        isFresh: false,
      }),
    );
    expect(display.telemetryStatus).toBe('standby');
    expect(display.primaryStatus).toBe('ready');
    expect(display.showTelemetryWarning).toBe(false);
  });

  it('soft-offline: signal_delayed is not hard offline', () => {
    const seed = BASELINE_TELEMETRY_SEEDS['soft-offline'];
    const freshness = resolveBaselineTelemetry(seed);
    expect(freshness.freshness).toBe('signal_delayed');
    expect(freshness.isOffline).toBe(false);
    expect(freshness.shouldWarnUser).toBe(false);

    const display = resolveBaselineFleetDisplay(
      buildBaselineVehicleData({
        lastSignal: seed.input.lastSignal ?? undefined,
        onlineStatus: seed.onlineStatus,
        isFresh: false,
      }),
    );
    expect(display.telemetryStatus).toBe('signal_delayed');
    expect(display.showTelemetryWarning).toBe(false);
  });

  it('offline: stale signal warns user', () => {
    const seed = BASELINE_TELEMETRY_SEEDS.offline;
    const freshness = resolveBaselineTelemetry(seed);
    expect(freshness.freshness).toBe('offline');
    expect(freshness.shouldWarnUser).toBe(true);

    const display = resolveBaselineFleetDisplay(
      buildBaselineVehicleData({
        lastSignal: seed.input.lastSignal ?? undefined,
        onlineStatus: seed.onlineStatus,
        isFresh: false,
      }),
    );
    expect(display.telemetryStatus).toBe('offline');
    expect(display.showTelemetryWarning).toBe(true);
  });

  it('telemetry-missing-values: no signal when timestamps absent', () => {
    const seed = BASELINE_TELEMETRY_SEEDS['telemetry-missing-values'];
    const freshness = resolveBaselineTelemetry(seed);
    expect(freshness.freshness).toBe('no_signal');
    expect(freshness.isNoSignal).toBe(true);
    expect(freshness.shouldWarnUser).toBe(true);
  });

  it('telemetry-null-values: mapper preserves null odometer/speed (Prompt 10/36)', () => {
    const mapped = mapBaselineFleetRowWithNullTelemetry();
    expect(mapped.odometer).toBeNull();
    expect(mapped.speed).toBeNull();
    expect(mapped.odometerKm).toBeNull();
    expect(mapped.fuelPercent).toBeNull();
  });
});

describe('vehicle detail baseline — map position modes', () => {
  it('live-position: bound + tracking shows live mode', () => {
    const view = resolveBaselineMapPosition('live');
    expect(view.mode).toBe('livePosition');
    expect(view.mapTargetPosition).toEqual([9.479, 51.312]);
    expect(view.showEmptyState).toBe(false);
  });

  it('last-known-position: telemetry error falls back to last known', () => {
    const view = resolveBaselineMapPosition('last-known');
    expect(view.mode).toBe('telemetryUnavailable');
    expect(view.operatorHintKey).toBe('telemetryUnavailable');
    expect(view.operatorHintSubKey).toBe('lastKnownShown');
    expect(view.mapTargetPosition).toEqual([9.479, 51.312]);
  });

  it('static fallback when store not yet bound', () => {
    const view = resolveBaselineMapPosition('static');
    expect(view.mode).toBe('staticPositionOnly');
    expect(view.mapTargetPosition).toEqual([9.48, 51.31]);
  });

  it('empty state when no coordinates exist', () => {
    const view = resolveBaselineMapPosition('empty');
    expect(view.mode).toBe('trackingUnavailable');
    expect(view.showEmptyState).toBe(true);
  });
});

describe('vehicle detail baseline — status display', () => {
  it('status-display: available vehicle shows ready primary + good health', () => {
    const display = resolveBaselineFleetDisplay(buildBaselineVehicleData());
    expect(display.primaryStatus).toBe('ready');
    expect(display.healthDisplay.status).toBe('good');
    expect(display.rentalDisplay.status).toBe('ready');
  });
});

describe('vehicle detail baseline — read-only permissions seed', () => {
  it('read-only-role: baseline permissions deny write/manage', () => {
    expect(BASELINE_READ_ONLY_PERMISSIONS.fleet.write).toBe(false);
    expect(BASELINE_READ_ONLY_PERMISSIONS.vehicles.write).toBe(false);
    expect(BASELINE_READ_ONLY_PERMISSIONS.fleet.read).toBe(true);
    expect(BASELINE_READ_ONLY_PERMISSIONS.vehicles.read).toBe(true);
  });
});
