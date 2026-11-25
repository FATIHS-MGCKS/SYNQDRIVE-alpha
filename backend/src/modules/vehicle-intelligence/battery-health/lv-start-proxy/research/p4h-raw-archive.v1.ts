import { createHash } from 'crypto';

import type { BatteryStartProxyCrankPoint } from '../battery-start-proxy.policy';

/** Versioned on-disk schema for DIMO crank-window research captures (no secrets). */
export const P4H_RAW_ARCHIVE_SCHEMA_VERSION = 'p4h-raw-archive.v1';

export type P4hSignalAggregationSpec = {
  signal: 'lowVoltageBatteryCurrentVoltage' | 'powertrainCombustionEngineSpeed';
  aggregation: 'MIN' | 'MAX';
};

export type P4hRawArchiveSampleV1 = {
  timestampUtc: string;
  voltageVolts: number | null;
  rpm: number | null;
};

export type P4hRawArchiveV1 = {
  schemaVersion: typeof P4H_RAW_ARCHIVE_SCHEMA_VERSION;
  integrity: {
    algorithm: 'sha256';
    digest: string;
  };
  capturedAtUtc: string;
  sourceRun: {
    benchmark: 'G5C-N16-P4H';
    extractorGateVersion: string;
  };
  trip: {
    tripId: string;
    vehicleId: string;
    vehicleLabel: string;
    tripStartUtc: string;
  };
  query: {
    telemetryUrlHost: string;
    interval: '5s';
    windowFromUtc: string;
    windowToUtc: string;
    signals: P4hSignalAggregationSpec[];
    graphqlOperationName: 'BatteryCrankWindow';
  };
  request: {
    httpStatus: number | null;
    status: 'ok' | 'error';
    errorMessage: string | null;
    requestIndex: number;
    retries: number;
  };
  samples: P4hRawArchiveSampleV1[];
  providerQuality: {
    sampleCount: number;
    medianIntervalMs: number | null;
    maxGapMs: number | null;
  };
};

export const P4H_DEFAULT_SIGNAL_SPECS: P4hSignalAggregationSpec[] = [
  { signal: 'lowVoltageBatteryCurrentVoltage', aggregation: 'MIN' },
  { signal: 'powertrainCombustionEngineSpeed', aggregation: 'MAX' },
];

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(obj[k])}`).join(',')}}`;
}

export function computeP4hArchiveDigest(
  payload: Omit<P4hRawArchiveV1, 'integrity'>,
): string {
  return createHash('sha256').update(stableSerialize(payload), 'utf8').digest('hex');
}

export function sealP4hRawArchive(
  payload: Omit<P4hRawArchiveV1, 'integrity'>,
): P4hRawArchiveV1 {
  const digest = computeP4hArchiveDigest(payload);
  return {
    ...payload,
    integrity: { algorithm: 'sha256', digest },
  };
}

export function verifyP4hRawArchive(archive: P4hRawArchiveV1): {
  ok: boolean;
  reason?: string;
} {
  if (archive.schemaVersion !== P4H_RAW_ARCHIVE_SCHEMA_VERSION) {
    return { ok: false, reason: 'unsupported_schema_version' };
  }
  const { integrity, ...rest } = archive;
  const expected = computeP4hArchiveDigest(rest as Omit<P4hRawArchiveV1, 'integrity'>);
  if (integrity.digest !== expected) {
    return { ok: false, reason: 'digest_mismatch' };
  }
  return { ok: true };
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function computeIntervalsMs(timestamps: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < timestamps.length; i += 1) {
    out.push(timestamps[i] - timestamps[i - 1]);
  }
  return out;
}

export function crankPointsFromArchive(archive: P4hRawArchiveV1): BatteryStartProxyCrankPoint[] {
  return archive.samples.map((sample) => ({
    timestamp: sample.timestampUtc,
    voltage: sample.voltageVolts,
    rpm: sample.rpm,
  }));
}

export function buildP4hRawArchiveInput(input: {
  capturedAtUtc: string;
  extractorGateVersion: string;
  vehicleLabel: string;
  vehicleId: string;
  tripId: string;
  tripStartUtc: string;
  telemetryUrl: string;
  windowFromUtc: string;
  windowToUtc: string;
  requestIndex: number;
  httpStatus: number | null;
  requestStatus: 'ok' | 'error';
  errorMessage: string | null;
  retries: number;
  points: BatteryStartProxyCrankPoint[];
}): Omit<P4hRawArchiveV1, 'integrity'> {
  const tsMs = input.points
    .map((p) => new Date(p.timestamp).getTime())
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b);
  const intervals = computeIntervalsMs(tsMs);
  let host = 'unknown';
  try {
    host = new URL(input.telemetryUrl).host;
  } catch {
    host = input.telemetryUrl;
  }

  return {
    schemaVersion: P4H_RAW_ARCHIVE_SCHEMA_VERSION,
    capturedAtUtc: input.capturedAtUtc,
    sourceRun: {
      benchmark: 'G5C-N16-P4H',
      extractorGateVersion: input.extractorGateVersion,
    },
    trip: {
      tripId: input.tripId,
      vehicleId: input.vehicleId,
      vehicleLabel: input.vehicleLabel,
      tripStartUtc: input.tripStartUtc,
    },
    query: {
      telemetryUrlHost: host,
      interval: '5s',
      windowFromUtc: input.windowFromUtc,
      windowToUtc: input.windowToUtc,
      signals: P4H_DEFAULT_SIGNAL_SPECS,
      graphqlOperationName: 'BatteryCrankWindow',
    },
    request: {
      httpStatus: input.httpStatus,
      status: input.requestStatus,
      errorMessage: input.errorMessage,
      requestIndex: input.requestIndex,
      retries: input.retries,
    },
    samples: input.points.map((p) => ({
      timestampUtc: p.timestamp,
      voltageVolts: p.voltage,
      rpm: p.rpm,
    })),
    providerQuality: {
      sampleCount: input.points.length,
      medianIntervalMs: intervals.length > 0 ? median(intervals) : null,
      maxGapMs: intervals.length > 0 ? Math.max(...intervals) : null,
    },
  };
}

export function archiveFileNameForTrip(tripId: string): string {
  return `${tripId}.p4h-raw.v1.json`;
}
