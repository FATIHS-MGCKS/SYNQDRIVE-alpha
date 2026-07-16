import { describe, expect, it } from 'vitest';
import { buildBatteryLvDetailVm, buildBatteryLvSummaryVm, resolveLvVoltageContext } from './battery-lv-view-model';
import {
  iceLvLiveStable,
  iceLvMissedRest,
  iceLvObservationStale,
  iceLvStartProxyProxy,
  iceLvUnsupported,
} from './battery-test-fixtures';

describe('battery-lv-view-model', () => {
  it('labels live voltage context separately from resting', () => {
    const s = iceLvLiveStable();
    const charging = {
      ...s,
      lv: {
        ...s.lv!,
        telemetry: { voltageV: 12.4, chargingVoltage: 14.2, voltageSource: 'live_telemetry' },
      },
      currentTelemetry: { chargingState: 'charging' },
    };
    expect(resolveLvVoltageContext(charging)).toBe('charging');
  });

  it('never marks LV estimated health as SOH', () => {
    const vm = buildBatteryLvSummaryVm(iceLvLiveStable());
    expect(vm.estimatedHealth.label).toContain('12V');
    expect(vm.estimatedHealth.label.toLowerCase()).not.toContain('soh');
  });

  it('marks observation-stale live voltage in detail VM', () => {
    const vm = buildBatteryLvDetailVm(null, iceLvObservationStale());
    expect(vm.voltage.isStale).toBe(true);
  });

  it('maps start-proxy PROXY classification', () => {
    const vm = buildBatteryLvDetailVm(null, iceLvStartProxyProxy());
    expect(vm.startBehavior?.classification).toBe('PROXY');
  });

  it('does not show resting value for MISSED quality', () => {
    const vm = buildBatteryLvSummaryVm(iceLvMissedRest());
    expect(vm.resting.valueV).toBeNull();
    expect(vm.resting.dataQualityStatus).toBe('MISSED');
  });

  it('flags unsupported LV profile', () => {
    const vm = buildBatteryLvSummaryVm(iceLvUnsupported());
    expect(vm.unsupported).toBe(true);
  });
});
