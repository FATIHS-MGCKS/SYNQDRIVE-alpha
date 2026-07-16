import { describe, expect, it } from 'vitest';
import type { BatteryHealthSummary } from '../../lib/api';
import { buildBatteryHvSohVm, buildBatteryHvSummaryVm } from './battery-hv-view-model';
import { buildBatteryLvSummaryVm, resolveLvVoltageContext } from './battery-lv-view-model';

function summary(partial: Partial<BatteryHealthSummary>): BatteryHealthSummary {
  return partial as BatteryHealthSummary;
}

describe('battery-lv-view-model', () => {
  it('labels live voltage context separately from resting', () => {
    const s = summary({
      lv: {
        telemetry: { voltageV: 12.4, chargingVoltage: 14.2, voltageSource: 'live_telemetry' },
      },
      currentTelemetry: { chargingState: 'charging' },
    } as Partial<BatteryHealthSummary>);
    expect(resolveLvVoltageContext(s)).toBe('charging');
  });

  it('never marks LV estimated health as SOH', () => {
    const vm = buildBatteryLvSummaryVm(
      summary({
        lv: {
          estimatedHealth: { status: 'GOOD', bars: 3, label: 'Geschätzter 12V-Batteriezustand' },
          publicationState: 'STABLE',
          telemetry: { voltageV: 12.5 },
        },
      } as Partial<BatteryHealthSummary>),
    );
    expect(vm.estimatedHealth.label).toContain('12V');
    expect(vm.estimatedHealth.label.toLowerCase()).not.toContain('soh');
  });
});

describe('battery-hv-view-model', () => {
  it('hides HV SOH when no decision-capable source', () => {
    const vm = buildBatteryHvSohVm(
      summary({
        support: { lv: true, hv: true },
        hv: {
          publicationState: 'STABLE',
          sohPct: 82,
          sohSource: 'CAPACITY_ESTIMATE',
          dataQualityStatus: 'LEGACY_UNVERIFIED',
          noFallbackSoh: true,
        },
      } as Partial<BatteryHealthSummary>),
    );
    expect(vm.showPrimarySoh).toBe(false);
  });

  it('shows provider SOH only with provider source', () => {
    const detailVm = buildBatteryHvSummaryVm(
      summary({
        support: { lv: true, hv: true },
        hv: {
          publicationState: 'STABLE',
          sohPct: 91,
          sohSource: 'PROVIDER',
          healthStatus: 'GOOD',
          dataQualityStatus: 'VERIFIED',
          telemetry: { providerSohPercent: 91, socPercent: 55 },
        },
        canonical: {
          hv: { providerSoh: { percent: 91, source: 'PROVIDER', decisionFresh: true } },
        },
      } as Partial<BatteryHealthSummary>),
    );
    expect(detailVm.soh.showPrimarySoh).toBe(true);
    expect(detailVm.soh.primaryLabelKey).toBe('health.battery.hv.providerSoh');
  });
});
