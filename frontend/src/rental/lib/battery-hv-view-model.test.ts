import { describe, expect, it } from 'vitest';
import {
  buildBatteryHvCapacityVm,
  buildBatteryHvDetailVm,
  buildBatteryHvLiveVm,
  buildBatteryHvSohVm,
  buildBatteryHvSummaryVm,
} from './battery-hv-view-model';
import {
  evHvCapacityShadow,
  evHvLegacyUnverified,
  evHvMissingSoh,
  evHvProviderSoh,
} from './battery-test-fixtures';

describe('battery-hv-view-model', () => {
  it('hides HV SOH when legacy unverified capacity estimate', () => {
    const vm = buildBatteryHvSohVm(evHvLegacyUnverified());
    expect(vm.showPrimarySoh).toBe(false);
    expect(vm.primaryLabelKey).toBe('health.battery.hv.sohUnavailable');
  });

  it('shows provider SOH only with provider source and decision-capable quality', () => {
    const vm = buildBatteryHvSohVm(evHvProviderSoh());
    expect(vm.showPrimarySoh).toBe(true);
    expect(vm.primaryLabelKey).toBe('health.battery.hv.providerSoh');
    expect(vm.sohSource).toBe('PROVIDER');
  });

  it('does not invent SOH percent when data is missing', () => {
    const vm = buildBatteryHvSohVm(evHvMissingSoh());
    expect(vm.showPrimarySoh).toBe(false);
    expect(vm.primaryValue).toBe('—');
  });

  it('maps live HV telemetry from canonical live state', () => {
    const live = buildBatteryHvLiveVm(evHvProviderSoh());
    expect(live.socPercent).toBe(68);
    expect(live.currentEnergyKwh).toBe(52.4);
    expect(live.isCharging).toBe(true);
    expect(live.chargingStateKey).toBe('health.battery.hv.charging.active');
  });

  it('exposes gated usable capacity from shadow assessment', () => {
    const capacity = buildBatteryHvCapacityVm(evHvCapacityShadow());
    expect(capacity.showUsableCapacity).toBe(true);
    expect(capacity.usableCapacityHintKey).toBe('health.battery.hv.usableCapacity.gated');
    expect(capacity.legacyUnverified).toBe(false);
  });

  it('flags legacy unverified capacity display mode', () => {
    const capacity = buildBatteryHvCapacityVm(evHvLegacyUnverified());
    expect(capacity.legacyUnverified).toBe(true);
    expect(capacity.showUsableCapacity).toBe(false);
  });

  it('includes charging session in detail VM', () => {
    const detail = buildBatteryHvDetailVm(null, evHvProviderSoh());
    expect(detail.sessions.length).toBeGreaterThan(0);
    expect(detail.sessions[0]?.isOngoing).toBe(true);
    expect(detail.providerSoh.show).toBe(true);
  });

  it('summary VM never uses LV estimated-health label for HV SOH', () => {
    const summary = buildBatteryHvSummaryVm(evHvProviderSoh());
    expect(summary.soh.primaryLabelKey).not.toContain('lv');
    expect(summary.soh.primaryLabelKey.toLowerCase()).not.toContain('12v');
  });
});
