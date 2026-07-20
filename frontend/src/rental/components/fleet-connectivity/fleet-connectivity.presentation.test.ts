import { describe, expect, it } from 'vitest';
import {
  formatLastTelemetry,
  overallStateLabel,
  primaryListHint,
  reasonCodeHint,
} from './fleet-connectivity.presentation';

const t = (key: string, params?: Record<string, string | number>) => {
  if (params?.count != null) return `${key}:${params.count}`;
  return key;
};

describe('fleet-connectivity.presentation', () => {
  it('maps overall states to i18n keys', () => {
    expect(overallStateLabel('TELEMETRY_ACTIVE', t)).toBe(
      'fleetConnectivity.state.TELEMETRY_ACTIVE',
    );
    expect(overallStateLabel('DEVICE_UNPLUGGED', t)).toBe(
      'fleetConnectivity.state.DEVICE_UNPLUGGED',
    );
  });

  it('formats live telemetry under five minutes', () => {
    const now = Date.parse('2026-07-19T12:00:00.000Z');
    expect(
      formatLastTelemetry('2026-07-19T11:58:00.000Z', t, 'en', now),
    ).toBe('fleetConnectivity.lastData.live');
  });

  it('formats hours ago for stale telemetry', () => {
    const now = Date.parse('2026-07-19T12:00:00.000Z');
    expect(
      formatLastTelemetry('2026-07-19T06:00:00.000Z', t, 'en', now),
    ).toBe('fleetConnectivity.lastData.hoursAgo:6');
  });

  it('uses user-facing reason hints without technical terms', () => {
    const userT = (key: string) => {
      if (key === 'fleetConnectivity.reason.DEVICE_UNPLUG_WEBHOOK') {
        return 'Device disconnected';
      }
      return key;
    };
    const hint = reasonCodeHint('DEVICE_UNPLUG_WEBHOOK', userT);
    expect(hint).toBe('Device disconnected');
    expect(hint.toLowerCase()).not.toContain('webhook');
  });

  it('prefers primary reason over generic standby hint', () => {
    const hint = primaryListHint(
      {
        vehicle: {
          vehicleId: 'v1',
          licensePlate: null,
          make: 'VW',
          model: 'Golf',
          year: null,
          station: null,
        },
        overallState: 'STANDBY',
        telemetryState: 'standby',
        attentionState: 'NONE',
        lastTelemetryAt: null,
        primaryReasonCode: 'DATA_COVERAGE_PARTIAL',
        recommendedAction: 'NONE',
        requiresAction: false,
        sortPriority: 60,
      },
      t,
    );
    expect(hint).toBe('fleetConnectivity.reason.DATA_COVERAGE_PARTIAL');
  });
});
