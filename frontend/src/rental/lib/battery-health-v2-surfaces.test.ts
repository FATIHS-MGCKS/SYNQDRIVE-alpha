import { describe, expect, it } from 'vitest';
import { buildBatteryHvDetailVm, buildBatteryHvSohVm } from './battery-hv-view-model';
import { buildBatteryLvDetailVm, buildBatteryLvSummaryVm } from './battery-lv-view-model';
import { isLiveStale, isHealthStale, BATTERY_LIVE_REFETCH_MS } from './battery-health-query/freshness';
import {
  evHvCapacityShadow,
  evHvLegacyUnverified,
  evHvMissingSoh,
  evHvProviderSoh,
  iceLvLiveStable,
  iceLvMissedRest,
  iceLvObservationStale,
  iceLvStartProxyExperimental,
  iceLvStartProxyProxy,
  iceLvUnsupported,
} from './battery-test-fixtures';

const LV_SOH_PATTERN = /\bsoh\b/i;

describe('battery-health-v2 surfaces — label contract', () => {
  it('LV summary never exposes SOH wording', () => {
    const vm = buildBatteryLvSummaryVm(iceLvLiveStable());
    expect(vm.estimatedHealth.label.toLowerCase()).not.toMatch(LV_SOH_PATTERN);
    expect(vm.estimatedHealth.label).toContain('12V');
  });

  it('LV detail marks observation freshness stale separately from fetch age', () => {
    const staleVm = buildBatteryLvDetailVm(null, iceLvObservationStale());
    const freshVm = buildBatteryLvDetailVm(null, iceLvLiveStable());
    expect(staleVm.voltage.isStale).toBe(true);
    expect(freshVm.voltage.isStale).toBe(false);

    const now = Date.now();
    expect(
      isLiveStale({ liveFetchedAt: now - BATTERY_LIVE_REFETCH_MS - 1, healthFetchedAt: now }, now),
    ).toBe(true);
    expect(isHealthStale({ liveFetchedAt: now - 60_000, healthFetchedAt: now - 60_000 }, now)).toBe(
      false,
    );
  });

  it('start-proxy PROXY and EXPERIMENTAL classifications surface in detail VM', () => {
    const proxy = buildBatteryLvDetailVm(null, iceLvStartProxyProxy());
    expect(proxy.startBehavior?.classification).toBe('PROXY');
    expect(proxy.startBehavior?.dataQualityStatus).toBe('PROXY');

    const experimental = buildBatteryLvDetailVm(null, iceLvStartProxyExperimental());
    expect(experimental.startBehavior?.classification).toBe('EXPERIMENTAL');
  });

  it('MISSED resting quality does not fabricate resting voltage', () => {
    const vm = buildBatteryLvSummaryVm(iceLvMissedRest());
    expect(vm.resting.valueV).toBeNull();
    expect(vm.resting.dataQualityStatus).toBe('MISSED');
  });

  it('unsupported ICE profile hides estimated health bars', () => {
    const vm = buildBatteryLvSummaryVm(iceLvUnsupported());
    expect(vm.unsupported).toBe(true);
    expect(vm.unsupportedReasonKey).toBe('health.battery.lv.unsupported');
  });

  it('qualified resting voltage uses VERIFIED slice', () => {
    const vm = buildBatteryLvSummaryVm(iceLvLiveStable());
    expect(vm.resting.dataQualityStatus).toBe('VERIFIED');
    expect(vm.resting.valueV).toBeCloseTo(12.62, 2);
    expect(vm.resting.measurementContext).toBe('REST_60M');
  });

  it('HV legacy unverified never shows primary SOH percent', () => {
    const vm = buildBatteryHvSohVm(evHvLegacyUnverified());
    expect(vm.showPrimarySoh).toBe(false);
  });

  it('HV missing SOH shows unavailable — not a guessed percent', () => {
    const vm = buildBatteryHvSohVm(evHvMissingSoh());
    expect(vm.showPrimarySoh).toBe(false);
    expect(vm.primaryValue).toBe('—');
  });

  it('provider SOH requires provider source label key', () => {
    const vm = buildBatteryHvSohVm(evHvProviderSoh());
    expect(vm.showPrimarySoh).toBe(true);
    expect(vm.primaryLabelKey).toBe('health.battery.hv.providerSoh');
    expect(Number(vm.primaryValue)).toBe(91);
  });

  it('capacity shadow + reference capacity appear in HV detail', () => {
    const detail = buildBatteryHvDetailVm(null, evHvCapacityShadow());
    expect(detail.capacity.showUsableCapacity).toBe(true);
    expect(detail.capacity.referenceCapacityText).not.toBe('—');
    expect(detail.sessions.length).toBeGreaterThan(0);
  });
});
