import { createHash } from 'crypto';

import type { BatteryStartProxyCrankPoint } from './battery-start-proxy.policy';
import { P4H_DEFAULT_SIGNAL_SPECS } from './research/p4h-raw-archive.v1';

export const P4C_FORWARD_RAW_ARCHIVE_SCHEMA_VERSION = 'p4c-forward-raw.v1';

export type P4cForwardRawArchiveSampleV1 = {
  timestampUtc: string;
  voltageVolts: number | null;
  rpm: number | null;
};

export type P4cForwardTimingEvidenceV1 = {
  tripFsmStartUtc: string | null;
  dimoSegmentStartUtc: string | null;
  lvSnapshotProviderTimestampUtc: string | null;
  ignitionProviderTimestampUtc: string | null;
  snapshotProviderFetchedAtUtc: string | null;
  startProxyQueryStartedAtUtc: string | null;
  processingStartedAtUtc: string | null;
  processingCompletedAtUtc: string | null;
};

export type P4cForwardRawArchiveV1 = {
  schemaVersion: typeof P4C_FORWARD_RAW_ARCHIVE_SCHEMA_VERSION;
  integrity: { algorithm: 'sha256'; digest: string };
  capturedAtUtc: string;
  pilotEpoch: string;
  requestLedgerRef: { pilotEpoch: string; tripId: string };
  sourceRun: {
    program: 'G5C-N16-P4C-FORWARD-CAPTURE';
    extractorGateVersion: string;
  };
  trip: {
    tripId: string;
    vehicleId: string;
    tripStartUtc: string;
    dimoTokenId: number;
  };
  query: {
    queryFingerprint: string;
    interval: '5s';
    windowFromUtc: string;
    windowToUtc: string;
    signals: typeof P4H_DEFAULT_SIGNAL_SPECS;
    graphqlOperationName: 'BatteryCrankWindow';
  };
  request: {
    httpStatus: number | null;
    status: 'ok' | 'error';
    errorMessage: string | null;
    providerRetries: number;
    pilotBudgetReserved: boolean;
  };
  timing: P4cForwardTimingEvidenceV1;
  samples: P4cForwardRawArchiveSampleV1[];
  providerQuality: {
    sampleCount: number;
    medianIntervalMs: number | null;
    maxGapMs: number | null;
  };
};

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

export function computeP4cForwardArchiveDigest(
  payload: Omit<P4cForwardRawArchiveV1, 'integrity'>,
): string {
  return createHash('sha256').update(stableSerialize(payload), 'utf8').digest('hex');
}

export function sealP4cForwardRawArchive(
  payload: Omit<P4cForwardRawArchiveV1, 'integrity'>,
): P4cForwardRawArchiveV1 {
  const digest = computeP4cForwardArchiveDigest(payload);
  return { ...payload, integrity: { algorithm: 'sha256', digest } };
}

export function verifyP4cForwardRawArchive(archive: P4cForwardRawArchiveV1): {
  ok: boolean;
  reason?: string;
} {
  if (archive.schemaVersion !== P4C_FORWARD_RAW_ARCHIVE_SCHEMA_VERSION) {
    return { ok: false, reason: 'unsupported_schema_version' };
  }
  const { integrity, ...rest } = archive;
  const expected = computeP4cForwardArchiveDigest(
    rest as Omit<P4cForwardRawArchiveV1, 'integrity'>,
  );
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

export function crankPointsFromP4cForwardArchive(
  archive: P4cForwardRawArchiveV1,
): BatteryStartProxyCrankPoint[] {
  return archive.samples.map((sample) => ({
    timestamp: sample.timestampUtc,
    voltage: sample.voltageVolts,
    rpm: sample.rpm,
  }));
}

export function buildP4cForwardRawArchiveInput(input: {
  capturedAtUtc: string;
  pilotEpoch: string;
  extractorGateVersion: string;
  vehicleId: string;
  tripId: string;
  tripStartUtc: string;
  dimoTokenId: number;
  queryFingerprint: string;
  windowFromUtc: string;
  windowToUtc: string;
  httpStatus: number | null;
  requestStatus: 'ok' | 'error';
  errorMessage: string | null;
  providerRetries: number;
  pilotBudgetReserved: boolean;
  timing: P4cForwardTimingEvidenceV1;
  points: BatteryStartProxyCrankPoint[];
}): Omit<P4cForwardRawArchiveV1, 'integrity'> {
  const tsMs = input.points
    .map((p) => new Date(p.timestamp).getTime())
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b);
  const intervals = computeIntervalsMs(tsMs);

  return {
    schemaVersion: P4C_FORWARD_RAW_ARCHIVE_SCHEMA_VERSION,
    capturedAtUtc: input.capturedAtUtc,
    pilotEpoch: input.pilotEpoch,
    requestLedgerRef: { pilotEpoch: input.pilotEpoch, tripId: input.tripId },
    sourceRun: {
      program: 'G5C-N16-P4C-FORWARD-CAPTURE',
      extractorGateVersion: input.extractorGateVersion,
    },
    trip: {
      tripId: input.tripId,
      vehicleId: input.vehicleId,
      tripStartUtc: input.tripStartUtc,
      dimoTokenId: input.dimoTokenId,
    },
    query: {
      queryFingerprint: input.queryFingerprint,
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
      providerRetries: input.providerRetries,
      pilotBudgetReserved: input.pilotBudgetReserved,
    },
    timing: input.timing,
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

/** Max sealed archive JSON bytes for pilot (10 MiB). */
export const P4C_FORWARD_RAW_ARCHIVE_MAX_BYTES_V1 = 10 * 1024 * 1024;
