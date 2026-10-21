import type { DiV0PositionAcquisitionRequest, DiV0ValidatedPositionWindow } from './di-v0-position-acquisition.types';
import {
  DI_V0_POSITION_DEFAULT_MAX_WINDOW_SECONDS,
  DI_V0_POSITION_QUERY_SPEC_V0_1,
} from './di-v0-position-acquisition.versions';

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,9}))?Z$/;
const MS_PER_BUCKET = DI_V0_POSITION_QUERY_SPEC_V0_1.intervalMs;

export class DiV0PositionRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiV0PositionRequestError';
  }
}

/** Canonical bucket label: whole-second UTC ISO-8601 without fractional digits. */
export function formatBucketLabel(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function parseStrictSecondAlignedUtc(value: unknown, field: string): number {
  if (typeof value !== 'string') {
    throw new DiV0PositionRequestError(`${field} must be a UTC ISO-8601 string`);
  }
  const match = UTC_INSTANT.exec(value);
  if (!match) {
    throw new DiV0PositionRequestError(`${field} must be UTC with Z suffix (no local time / offsets)`);
  }
  const fraction = match[1];
  if (fraction != null && /[1-9]/.test(fraction)) {
    throw new DiV0PositionRequestError(`${field} must be second-aligned`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new DiV0PositionRequestError(`${field} is not a valid instant`);
  }
  if (formatBucketLabel(ms) !== value.replace(/\.\d+Z$/, 'Z')) {
    throw new DiV0PositionRequestError(`${field} is not a valid calendar instant`);
  }
  return ms;
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DiV0PositionRequestError(`${field} must be a non-empty string`);
  }
  return value;
}

export function validateDiV0PositionWindow(
  fromUtc: unknown,
  toUtc: unknown,
  maxWindowSeconds: number = DI_V0_POSITION_DEFAULT_MAX_WINDOW_SECONDS,
): DiV0ValidatedPositionWindow {
  if (!Number.isSafeInteger(maxWindowSeconds) || maxWindowSeconds <= 0) {
    throw new DiV0PositionRequestError('maxWindowSeconds must be a positive integer');
  }
  const fromMs = parseStrictSecondAlignedUtc(fromUtc, 'fromUtc');
  const toMs = parseStrictSecondAlignedUtc(toUtc, 'toUtc');
  if (!(fromMs < toMs)) {
    throw new DiV0PositionRequestError('fromUtc must be strictly before toUtc');
  }
  const expectedBucketCount = (toMs - fromMs) / MS_PER_BUCKET;
  if (expectedBucketCount > maxWindowSeconds) {
    throw new DiV0PositionRequestError(
      `window of ${expectedBucketCount}s exceeds maxWindowSeconds=${maxWindowSeconds}`,
    );
  }
  return {
    fromUtc: formatBucketLabel(fromMs),
    toUtc: formatBucketLabel(toMs),
    fromMs,
    toMs,
    expectedBucketCount,
    boundary: DI_V0_POSITION_QUERY_SPEC_V0_1.gridBoundary,
  };
}

export interface DiV0ValidatedPositionRequest {
  organizationId: string;
  vehicleId: string;
  tripId: string | null;
  dimoTokenId: number;
  dimoDeviceIdentity: unknown;
  window: DiV0ValidatedPositionWindow;
}

export function validateDiV0PositionAcquisitionRequest(
  request: DiV0PositionAcquisitionRequest,
  maxWindowSeconds?: number,
): DiV0ValidatedPositionRequest {
  if (request == null || typeof request !== 'object') {
    throw new DiV0PositionRequestError('request must be an object');
  }
  const organizationId = requireNonEmpty(request.organizationId, 'organizationId');
  const vehicleId = requireNonEmpty(request.vehicleId, 'vehicleId');
  const tripId =
    request.tripId == null ? null : requireNonEmpty(request.tripId, 'tripId');
  if (!Number.isSafeInteger(request.dimoTokenId) || request.dimoTokenId <= 0) {
    throw new DiV0PositionRequestError('dimoTokenId must be a positive integer');
  }
  return {
    organizationId,
    vehicleId,
    tripId,
    dimoTokenId: request.dimoTokenId,
    dimoDeviceIdentity: request.dimoDeviceIdentity,
    window: validateDiV0PositionWindow(request.fromUtc, request.toUtc, maxWindowSeconds),
  };
}

/** Expected query-bucket labels over `[fromMs, toMs)`; count equals `(to − from) / 1 s`. */
export function buildExpectedBucketLabels(window: DiV0ValidatedPositionWindow): string[] {
  const labels = new Array<string>(window.expectedBucketCount);
  for (let i = 0; i < window.expectedBucketCount; i++) {
    labels[i] = formatBucketLabel(window.fromMs + i * MS_PER_BUCKET);
  }
  return labels;
}

export interface DiV0EnclosingWindow {
  fromUtc: string;
  toUtc: string;
  widenedStartMs: number;
  widenedEndMs: number;
}

/**
 * Explicit (never implicit) helper: smallest second-aligned `[from, to)` window that contains
 * `[startMs, endMs]`. Callers must record the widening; S3A never alters a requested window.
 */
export function deriveSecondAlignedEnclosingWindow(startMs: number, endMs: number): DiV0EnclosingWindow {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !(startMs < endMs)) {
    throw new DiV0PositionRequestError('enclosing window requires finite start < end');
  }
  const fromMs = Math.floor(startMs / MS_PER_BUCKET) * MS_PER_BUCKET;
  const toMs = Math.ceil(endMs / MS_PER_BUCKET) * MS_PER_BUCKET;
  return {
    fromUtc: formatBucketLabel(fromMs),
    toUtc: formatBucketLabel(toMs),
    widenedStartMs: startMs - fromMs,
    widenedEndMs: toMs - endMs,
  };
}
