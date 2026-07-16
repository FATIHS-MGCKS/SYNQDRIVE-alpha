import {
  BATTERY_START_PROXY_CONFIRMED_ICE_RPM,
  BATTERY_START_PROXY_WINDOW_AFTER_MS,
  BATTERY_START_PROXY_WINDOW_BEFORE_MS,
  computeStartProxyWindow,
  detectConfirmedIceStart,
  extractStartDipProxyValues,
  sanitizeStartProxyVoltages,
} from './battery-start-proxy.policy';
import { buildStartProxyJobIdempotencyKey } from '../jobs/battery-v2-job-idempotency.policy';

const TRIP = 'cltrip123456789012345678901';
const TRIP_START = new Date('2026-07-16T12:00:00.000Z');

describe('battery-start-proxy.policy', () => {
  it('builds job idempotency key as battery-start-proxy:<tripId>:<modelVersion>', () => {
    expect(
      buildStartProxyJobIdempotencyKey({ tripId: TRIP, modelVersion: '1.0.0' }),
    ).toBe(`battery-start-proxy:${TRIP}:1.0.0`);
  });

  it('computes bounded historical window around trip start', () => {
    const window = computeStartProxyWindow(TRIP_START);
    expect(window.from.getTime()).toBe(
      TRIP_START.getTime() - BATTERY_START_PROXY_WINDOW_BEFORE_MS,
    );
    expect(window.to.getTime()).toBe(
      TRIP_START.getTime() + BATTERY_START_PROXY_WINDOW_AFTER_MS,
    );
  });

  it('detects confirmed ICE start from RPM above threshold after trip start', () => {
    const points = [
      {
        timestamp: new Date(TRIP_START.getTime() + 10_000).toISOString(),
        voltage: 12.4,
        rpm: BATTERY_START_PROXY_CONFIRMED_ICE_RPM - 1,
      },
      {
        timestamp: new Date(TRIP_START.getTime() + 15_000).toISOString(),
        voltage: 12.1,
        rpm: BATTERY_START_PROXY_CONFIRMED_ICE_RPM + 50,
      },
    ];
    expect(detectConfirmedIceStart(points, TRIP_START)).toBe(true);
  });

  it('does not confirm ICE start when RPM stays below threshold', () => {
    const points = [
      {
        timestamp: new Date(TRIP_START.getTime() + 15_000).toISOString(),
        voltage: 12.4,
        rpm: 200,
      },
    ];
    expect(detectConfirmedIceStart(points, TRIP_START)).toBe(false);
  });

  it('extracts start dip proxy voltages from bounded series', () => {
    const startMs = TRIP_START.getTime();
    const points = [
      { timestamp: new Date(startMs - 10_000).toISOString(), voltage: 12.5, rpm: 0 },
      { timestamp: new Date(startMs).toISOString(), voltage: 12.4, rpm: 0 },
      { timestamp: new Date(startMs + 4_000).toISOString(), voltage: 11.8, rpm: 600 },
      { timestamp: new Date(startMs + 5_000).toISOString(), voltage: 12.3, rpm: 600 },
      { timestamp: new Date(startMs + 30_000).toISOString(), voltage: 12.6, rpm: 800 },
    ];
    const extracted = extractStartDipProxyValues(points, TRIP_START);
    expect(extracted.vPreCrank).toBe(12.4);
    expect(extracted.vMinCrank).toBe(11.8);
    expect(extracted.vRecovery5s).toBe(12.3);
    expect(extracted.vRecovery30s).toBe(12.6);
    expect(sanitizeStartProxyVoltages(extracted).vMinCrank).toBe(11.8);
  });
});
