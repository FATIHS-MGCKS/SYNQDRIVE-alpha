import { describe, expect, it } from 'vitest';
import type { BatteryHealthSummary } from '../../lib/api';
import {
  hasBatteryStartProblemEvidence,
  normalizeLvBatteryVoltage,
  resolveOverviewBatteryVoltage,
} from './battery-display.utils';

function battery(partial: unknown): BatteryHealthSummary {
  return partial as BatteryHealthSummary;
}

describe('battery display helpers', () => {
  it('prefers canonical resting voltage over current telemetry and live map voltage', () => {
    const display = resolveOverviewBatteryVoltage(
      battery({
        lv: {
          restingVoltage: { valueV: 12.84, status: 'GOOD' },
          telemetry: { restingVoltage: 12.7, voltageV: 12.4 },
        },
        currentState: { restingVoltage: 12.6, voltageV: 12.3 },
      }),
      12.2,
    );

    expect(display.kind).toBe('resting');
    expect(display.valueV).toBe(12.84);
    expect(display.source).toBe('lv-resting');
    expect(display.status).toBe('GOOD');
  });

  it('falls back to current voltage only when resting voltage is unavailable', () => {
    const display = resolveOverviewBatteryVoltage(
      battery({
        lv: {
          restingVoltage: { valueV: null, status: 'UNKNOWN' },
          telemetry: { restingVoltage: null, voltageV: 12.4 },
        },
        currentState: { restingVoltage: null, voltageV: 12.3 },
      }),
      12.2,
    );

    expect(display.kind).toBe('current');
    expect(display.valueV).toBe(12.4);
    expect(display.source).toBe('lv-telemetry-current');
  });

  it('does not treat zero or unrealistic LV values as displayable battery voltage', () => {
    expect(normalizeLvBatteryVoltage(0)).toBeNull();
    expect(normalizeLvBatteryVoltage(-1)).toBeNull();
    expect(normalizeLvBatteryVoltage(48)).toBeNull();
    expect(normalizeLvBatteryVoltage(12.84)).toBe(12.84);
  });

  it('does not use condition watch alone as start-problem evidence', () => {
    expect(
      hasBatteryStartProblemEvidence(
        battery({
          lv: {
            condition: 'watch',
            restingVoltage: { valueV: 12.84, status: 'GOOD' },
            telemetry: { crankingVoltage: null },
          },
          currentState: { crankingVoltage: null },
          watchpoints: [],
          recommendations: [],
          condition: 'watch',
        }),
      ),
    ).toBe(false);
  });

  it('detects explicit low-voltage or cranking evidence for start-problem copy', () => {
    expect(
      hasBatteryStartProblemEvidence(
        battery({
          lv: {
            restingVoltage: { valueV: 12.1, status: 'WARNING' },
            telemetry: { crankingVoltage: null },
          },
          currentState: { crankingVoltage: null },
          watchpoints: [],
          recommendations: [],
        }),
      ),
    ).toBe(true);

    expect(
      hasBatteryStartProblemEvidence(
        battery({
          lv: { telemetry: { crankingVoltage: 9.2 } },
          currentState: { crankingVoltage: null },
          watchpoints: [],
          recommendations: [],
        }),
      ),
    ).toBe(true);
  });
});

