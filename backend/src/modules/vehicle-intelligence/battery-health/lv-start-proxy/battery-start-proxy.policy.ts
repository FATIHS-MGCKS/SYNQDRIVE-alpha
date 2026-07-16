import { buildStartProxyJobIdempotencyKey } from '../jobs/battery-v2-job-idempotency.policy';

export { buildStartProxyJobIdempotencyKey };

/** RPM threshold — combustion engine considered running above this. */
export const BATTERY_START_PROXY_CONFIRMED_ICE_RPM = 400;

/** Historical window: tripStart - 30s … tripStart + 120s (5s DIMO cadence). */
export const BATTERY_START_PROXY_WINDOW_BEFORE_MS = 30_000;
export const BATTERY_START_PROXY_WINDOW_AFTER_MS = 120_000;

export type BatteryStartProxyCrankPoint = {
  timestamp: string;
  voltage: number | null;
  rpm: number | null;
};

export function buildStartProxySessionIdempotencyKey(tripId: string): string {
  return `ice-start-proxy:${tripId}`;
}

export function buildStartProxyMeasurementIdempotencyKey(tripId: string): string {
  return `start-dip-proxy:${tripId}`;
}

export function computeStartProxyWindow(tripStartAt: Date): { from: Date; to: Date } {
  const startMs = tripStartAt.getTime();
  return {
    from: new Date(startMs - BATTERY_START_PROXY_WINDOW_BEFORE_MS),
    to: new Date(startMs + BATTERY_START_PROXY_WINDOW_AFTER_MS),
  };
}

export function detectConfirmedIceStart(
  points: BatteryStartProxyCrankPoint[],
  tripStartAt: Date,
): boolean {
  const startMs = tripStartAt.getTime();
  const windowEndMs = startMs + 60_000;
  return points.some((point) => {
    const t = new Date(point.timestamp).getTime();
    if (t < startMs - 5_000 || t > windowEndMs) {
      return false;
    }
    return point.rpm != null && point.rpm >= BATTERY_START_PROXY_CONFIRMED_ICE_RPM;
  });
}

export function extractStartDipProxyValues(
  points: BatteryStartProxyCrankPoint[],
  tripStartAt: Date,
): {
  vPreCrank: number | null;
  vMinCrank: number | null;
  vRecovery5s: number | null;
  vRecovery30s: number | null;
  pointCount: number;
} {
  const startMs = tripStartAt.getTime();

  const preCrankPoints = points.filter(
    (p) => new Date(p.timestamp).getTime() <= startMs,
  );
  const vPreCrank =
    preCrankPoints.length > 0
      ? preCrankPoints[preCrankPoints.length - 1].voltage
      : null;

  const crankZonePoints = points.filter((p) => {
    const t = new Date(p.timestamp).getTime();
    return t >= startMs - 30_000 && t <= startMs + 30_000;
  });
  const crankVoltages = crankZonePoints
    .map((p) => p.voltage)
    .filter((v): v is number => v != null);
  const vMinCrank =
    crankVoltages.length > 0 ? Math.min(...crankVoltages) : null;

  const p5s = points.find((p) => new Date(p.timestamp).getTime() >= startMs + 5_000);
  const p30s = points.find((p) => new Date(p.timestamp).getTime() >= startMs + 30_000);

  return {
    vPreCrank,
    vMinCrank,
    vRecovery5s: p5s?.voltage ?? null,
    vRecovery30s: p30s?.voltage ?? null,
    pointCount: points.length,
  };
}

function isPlausibleVoltage(v: number | null): v is number {
  return v != null && Number.isFinite(v) && v >= 8 && v <= 16;
}

export function sanitizeStartProxyVoltages(input: {
  vPreCrank: number | null;
  vMinCrank: number | null;
  vRecovery5s: number | null;
  vRecovery30s: number | null;
}) {
  return {
    vPreCrank: isPlausibleVoltage(input.vPreCrank) ? input.vPreCrank : null,
    vMinCrank: isPlausibleVoltage(input.vMinCrank) ? input.vMinCrank : null,
    vRecovery5s: isPlausibleVoltage(input.vRecovery5s) ? input.vRecovery5s : null,
    vRecovery30s: isPlausibleVoltage(input.vRecovery30s) ? input.vRecovery30s : null,
  };
}
