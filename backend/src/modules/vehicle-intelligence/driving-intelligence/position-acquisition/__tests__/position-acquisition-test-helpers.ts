import type {
  DiV0HistoricalPositionQueryInput,
  DiV0HistoricalPositionTransport,
  DiV0PositionAcquisitionOutcome,
  DiV0PositionAcquisitionRequest,
  DiV0PositionAcquisitionResult,
} from '../di-v0-position-acquisition.types';

/** Synthetic identities (no real serials / token ids). */
export const R1_IDENTITY = { aftermarketDevice: { serial: 'R1-TEST-000001' }, syntheticDevice: null };
export const API_SYNTHETIC_IDENTITY = { aftermarketDevice: null, syntheticDevice: { id: 'synthetic-test' } };
export const UNKNOWN_IDENTITY = { aftermarketDevice: { serial: 'AM-OTHER-01' }, syntheticDevice: null };

export const FIXED_NOW = new Date('2030-01-01T00:00:00.000Z');

export function labelAt(baseIso: string, offsetSeconds: number): string {
  return new Date(Date.parse(baseIso) + offsetSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function buildRequest(
  fromUtc: string,
  toUtc: string,
  overrides: Partial<DiV0PositionAcquisitionRequest> = {},
): DiV0PositionAcquisitionRequest {
  return {
    organizationId: 'org-test',
    vehicleId: 'vehicle-test',
    tripId: 'trip-test',
    dimoTokenId: 424242,
    dimoDeviceIdentity: R1_IDENTITY,
    fromUtc,
    toUtc,
    ...overrides,
  };
}

export function row(timestamp: unknown, latitude: unknown, longitude: unknown): Record<string, unknown> {
  return { timestamp, currentLocationCoordinates: { latitude, longitude } };
}

export function nullLocationRow(timestamp: unknown): Record<string, unknown> {
  return { timestamp, currentLocationCoordinates: null };
}

export function signalsBody(rows: unknown[] | null): Record<string, unknown> {
  return { data: { signals: rows } };
}

export interface RecordingTransport extends DiV0HistoricalPositionTransport {
  calls: DiV0HistoricalPositionQueryInput[];
}

export function staticTransport(body: unknown): RecordingTransport {
  const calls: DiV0HistoricalPositionQueryInput[] = [];
  return {
    calls,
    async executeHistoricalPositionQuery(input) {
      calls.push(input);
      return body;
    },
  };
}

export function throwingTransport(error: unknown): RecordingTransport {
  const calls: DiV0HistoricalPositionQueryInput[] = [];
  return {
    calls,
    async executeHistoricalPositionQuery(input) {
      calls.push(input);
      throw error;
    },
  };
}

export function expectAcquired(outcome: DiV0PositionAcquisitionOutcome): DiV0PositionAcquisitionResult {
  if (outcome.status !== 'ACQUIRED') {
    throw new Error(`expected ACQUIRED, got ${outcome.failure.failureClass}: ${outcome.failure.safeMessage}`);
  }
  return outcome.result;
}

export function expectFailed(outcome: DiV0PositionAcquisitionOutcome) {
  if (outcome.status !== 'FAILED') {
    throw new Error('expected FAILED outcome');
  }
  return outcome.failure;
}

export function axiosLikeError(status: number, message = `Request failed with status code ${status}`): Error {
  const error = new Error(message) as Error & { isAxiosError: boolean; response: { status: number } };
  error.isAxiosError = true;
  error.response = { status };
  return error;
}
