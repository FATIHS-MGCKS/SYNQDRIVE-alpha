import { createHash } from 'crypto';
import type {
  DimoNativeEventCoreMetadata,
  DimoNativeEventFingerprintInput,
  NativeEventTripAssignmentResult,
  NativeEventTripWindow,
} from './dimo-native-event-fingerprint.types';

const FINGERPRINT_SEP = '\x1f';
export const DIMO_NATIVE_EVENT_PROVIDER = 'DIMO';

/** Parse provider metadata JSON — only stable core fields for identity. */
export function extractDimoNativeEventCoreMetadata(
  metadata: string | null,
): DimoNativeEventCoreMetadata {
  if (!metadata) return { counterValue: null };
  try {
    const parsed = JSON.parse(metadata) as { counterValue?: unknown };
    if (typeof parsed?.counterValue === 'number' && Number.isFinite(parsed.counterValue)) {
      return { counterValue: parsed.counterValue };
    }
  } catch {
    // Non-JSON metadata — identity uses empty core metadata.
  }
  return { counterValue: null };
}

function normalizePart(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Deterministic SHA-256 fingerprint for a native DIMO driving event.
 * Re-fetching the same provider payload yields the same fingerprint.
 */
export function buildDimoNativeEventFingerprint(input: DimoNativeEventFingerprintInput): string {
  const parts = [
    normalizePart(input.organizationId),
    normalizePart(input.vehicleId),
    normalizePart(input.provider),
    normalizePart(input.providerEventName),
    input.observedAt.toISOString(),
    String(input.durationNs),
    normalizePart(input.providerSourceId).toLowerCase(),
    input.counterValue == null ? '' : String(input.counterValue),
  ];
  return createHash('sha256').update(parts.join(FINGERPRINT_SEP)).digest('hex');
}

/** Whether an observed timestamp falls inside a finalized trip window. */
export function isWithinTripBoundary(
  observedAt: Date,
  trip: NativeEventTripWindow,
): boolean {
  const ts = observedAt.getTime();
  return ts >= trip.startTime.getTime() && ts <= trip.endTime.getTime();
}

/**
 * Resolve trip linkage without changing event identity.
 * Out-of-bound events stay UNASSIGNED for later reconciliation.
 */
export function resolveNativeEventTripAssignment(
  observedAt: Date,
  trip: NativeEventTripWindow | null,
): NativeEventTripAssignmentResult {
  if (!trip) {
    return { tripId: null, tripAssignment: 'UNASSIGNED', withinTripBoundary: false };
  }
  if (isWithinTripBoundary(observedAt, trip)) {
    return { tripId: trip.id, tripAssignment: 'ASSIGNED', withinTripBoundary: true };
  }
  return { tripId: null, tripAssignment: 'UNASSIGNED', withinTripBoundary: false };
}
