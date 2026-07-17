import { describe, expect, it } from 'vitest';
import type { BatteryHealthSummary } from '../../../lib/api';
import { mergeBatteryLiveSlice } from './merge-live';

function summary(partial: Partial<BatteryHealthSummary>): BatteryHealthSummary {
  return partial as BatteryHealthSummary;
}

describe('mergeBatteryLiveSlice', () => {
  it('preserves publication and assessment while updating live telemetry', () => {
    const previous = summary({
      lv: {
        publicationState: 'STABLE',
        restingVoltage: { valueV: 12.8, status: 'GOOD' },
        telemetry: { voltageV: 12.4, restingVoltage: 12.8 },
      },
      canonical: {
        liveState: { signals: { liveVoltage: { value: 12.4 } } },
        assessment: { label: 'good' },
      },
      currentTelemetry: { lvVoltageV: 12.4 },
    });

    const next = summary({
      lv: {
        publicationState: 'STABILIZING',
        restingVoltage: { valueV: 12.1, status: 'WARNING' },
        telemetry: { voltageV: 13.9, restingVoltage: 12.1 },
      },
      canonical: {
        liveState: { signals: { liveVoltage: { value: 13.9 } } },
        assessment: { label: 'watch' },
      },
      currentTelemetry: { lvVoltageV: 13.9 },
    });

    const merged = mergeBatteryLiveSlice(previous, next);

    expect(merged.lv?.publicationState).toBe('STABLE');
    expect(merged.lv?.telemetry?.voltageV).toBe(13.9);
    expect(merged.canonical?.assessment).toEqual({ label: 'good' });
    expect(merged.canonical?.liveState).toEqual(next.canonical?.liveState);
    expect(merged.currentTelemetry?.lvVoltageV).toBe(13.9);
  });
});
