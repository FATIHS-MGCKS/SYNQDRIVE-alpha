import { createHash } from 'crypto';
import { maxClaimForUncalibratedNative } from '../core/claims/claim-confidence';
import type { NativeEventObservation } from '../core/types';
import { computeDiV0NativeEventSnapshotIdentity } from './di-v0-native-event-snapshot';
import type {
  DiV0NativeEventConflictingDuplicate,
  DiV0NativeEventContextMismatch,
  DiV0NativeEventContextMismatchReason,
  DiV0NativeEventDuplicateField,
  DiV0NativeEventEvidenceItem,
  DiV0NativeEventEvidenceResult,
  DiV0NativeEventEvidenceStatus,
  DiV0NativeEventExpectedContext,
  DiV0NativeEventInputRecord,
  DiV0NativeEventNormalizationRequest,
  DiV0NativeEventChannelState,
  DiV0NativeEventSourceOutcome,
} from './di-v0-native-event-evidence.types';
import {
  DI_V0_NATIVE_EVENT_EVIDENCE_ADAPTER_V0_2,
  DI_V0_NATIVE_EVENT_EVIDENCE_KIND,
} from './di-v0-native-event-evidence.versions';
import { mapProviderNativeEventType } from './di-v0-native-event-type-mapping';

/**
 * Native calibration authority is fixed in this layer. No caller input can raise it;
 * a future trusted calibration authority must be a separate, explicitly reviewed contract.
 */
const NATIVE_CALIBRATION_STATE = 'UNCALIBRATED' as const;

export class DiV0NativeEventContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiV0NativeEventContextError';
  }
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value != null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort(compareStrings)
      .map((k) => [k, canonicalJson(obj[k])]);
  }
  return value === undefined ? null : value;
}

const DUPLICATE_FIELDS: readonly DiV0NativeEventDuplicateField[] = [
  'organizationId',
  'vehicleId',
  'tripId',
  'provider',
  'providerEventName',
  'providerTimestamp',
  'sourceFamily',
  'providerFingerprint',
  'payloadRef',
  'metadataJson',
];

function fieldValue(record: DiV0NativeEventInputRecord, field: DiV0NativeEventDuplicateField): string {
  const raw = (record as unknown as Record<string, unknown>)[field];
  return JSON.stringify(field === 'metadataJson' ? canonicalJson(raw ?? null) : raw ?? null);
}

function canonicalVariant(record: DiV0NativeEventInputRecord): string {
  return JSON.stringify([record.id, ...DUPLICATE_FIELDS.map((f) => fieldValue(record, f))]);
}

export function computeDiV0NativeEventVariantDigest(record: DiV0NativeEventInputRecord): string {
  return createHash('sha256').update(canonicalVariant(record), 'utf8').digest('hex');
}

function parseInstant(value: string, label: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new DiV0NativeEventContextError(`${label} is not a valid timestamp`);
  return ms;
}

export function validateDiV0NativeEventContext(context: DiV0NativeEventExpectedContext): {
  startMs: number;
  endMs: number;
} {
  if (typeof context.organizationId !== 'string' || context.organizationId.length === 0) {
    throw new DiV0NativeEventContextError('organizationId is required');
  }
  if (typeof context.vehicleId !== 'string' || context.vehicleId.length === 0) {
    throw new DiV0NativeEventContextError('vehicleId is required');
  }
  if (context.tripId !== null && (typeof context.tripId !== 'string' || context.tripId.length === 0)) {
    throw new DiV0NativeEventContextError('tripId must be null or a non-empty string');
  }
  const startMs = parseInstant(context.windowStart, 'windowStart');
  const endMs = parseInstant(context.windowEnd, 'windowEnd');
  if (startMs > endMs) throw new DiV0NativeEventContextError('windowStart must not be after windowEnd');
  return { startMs, endMs };
}

function contextMismatchReasons(
  record: DiV0NativeEventInputRecord,
  context: DiV0NativeEventExpectedContext,
  window: { startMs: number; endMs: number },
): DiV0NativeEventContextMismatchReason[] {
  const reasons: DiV0NativeEventContextMismatchReason[] = [];
  if (record.organizationId == null) reasons.push('ORGANIZATION_UNPROVABLE');
  else if (record.organizationId !== context.organizationId) reasons.push('ORGANIZATION_MISMATCH');
  if (record.vehicleId !== context.vehicleId) reasons.push('VEHICLE_MISMATCH');
  if (context.tripId !== null) {
    if (record.tripId == null) reasons.push('TRIP_UNPROVABLE');
    else if (record.tripId !== context.tripId) reasons.push('TRIP_MISMATCH');
  }
  if (context.provider !== null) {
    if (record.provider == null) reasons.push('PROVIDER_UNPROVABLE');
    else if (record.provider !== context.provider) reasons.push('PROVIDER_MISMATCH');
  }
  if (record.sourceFamily !== context.sourceFamily) reasons.push('SOURCE_FAMILY_MISMATCH');
  if (record.providerTimestamp == null || record.providerTimestamp.length === 0) {
    reasons.push('TIMESTAMP_MISSING');
  } else {
    const ms = Date.parse(record.providerTimestamp);
    if (!Number.isFinite(ms)) reasons.push('TIMESTAMP_INVALID');
    else if (ms < window.startMs || ms > window.endMs) reasons.push('OUTSIDE_WINDOW');
  }
  return reasons;
}

function toEvidenceItem(record: DiV0NativeEventInputRecord): DiV0NativeEventEvidenceItem {
  const normalizedEventType = mapProviderNativeEventType(record.providerEventName);
  const observation: NativeEventObservation = {
    eventType: normalizedEventType,
    providerTimestamp: record.providerTimestamp,
    sourceFamily: record.sourceFamily,
    calibrationState: NATIVE_CALIBRATION_STATE,
    temporalConfidence: 'UNKNOWN',
    payloadRef: record.payloadRef ?? null,
    provenance: {
      derivedFrom: ['DRIVING_EVENTS_PERSISTENCE', record.id, record.providerEventName],
    },
  };
  return {
    evidenceKind: DI_V0_NATIVE_EVENT_EVIDENCE_KIND,
    eventId: record.id,
    providerEventName: record.providerEventName,
    normalizedEventType,
    sourceFamily: record.sourceFamily,
    providerTimestamp: record.providerTimestamp,
    temporalConfidence: 'UNKNOWN',
    calibrationState: NATIVE_CALIBRATION_STATE,
    maxClaimLevel: maxClaimForUncalibratedNative(NATIVE_CALIBRATION_STATE),
    observation,
    qualityFlags: normalizedEventType === 'UNKNOWN_NATIVE_EVENT' ? ['UNKNOWN_PROVIDER_EVENT_TYPE'] : [],
  };
}

interface EventIdGroup {
  eventId: string;
  inputRecordCount: number;
  variants: Map<string, DiV0NativeEventInputRecord>;
}

function groupByEventId(records: DiV0NativeEventInputRecord[]): EventIdGroup[] {
  const groups = new Map<string, EventIdGroup>();
  for (const record of records) {
    let group = groups.get(record.id);
    if (!group) {
      group = { eventId: record.id, inputRecordCount: 0, variants: new Map() };
      groups.set(record.id, group);
    }
    group.inputRecordCount += 1;
    const digest = computeDiV0NativeEventVariantDigest(record);
    if (!group.variants.has(digest)) group.variants.set(digest, record);
  }
  return [...groups.values()].sort((a, b) => compareStrings(a.eventId, b.eventId));
}

function conflictingFields(variants: DiV0NativeEventInputRecord[]): DiV0NativeEventDuplicateField[] {
  return DUPLICATE_FIELDS.filter((field) => {
    const first = fieldValue(variants[0], field);
    return variants.some((v) => fieldValue(v, field) !== first);
  });
}

function deriveStatus(
  sourceOutcome: DiV0NativeEventSourceOutcome,
  accepted: number,
): { status: DiV0NativeEventEvidenceStatus; channelState: DiV0NativeEventChannelState } {
  if (sourceOutcome === 'SOURCE_FAILURE') return { status: 'EVENT_SOURCE_FAILURE', channelState: 'SOURCE_FAILURE' };
  if (sourceOutcome === 'SOURCE_SUCCESS_NO_EVENTS') return { status: 'NO_EVENT', channelState: 'NO_EVENT' };
  return accepted > 0
    ? { status: 'EVENTS_PRESENT', channelState: 'PRESENT' }
    : { status: 'NO_ACCEPTED_EVENT', channelState: 'PRESENT' };
}

export function normalizeDiV0NativeEventEvidence(
  request: DiV0NativeEventNormalizationRequest,
): DiV0NativeEventEvidenceResult {
  const { context, source } = request;
  const window = validateDiV0NativeEventContext(context);

  const records = source.kind === 'SOURCE_SUCCESS' ? source.records : [];
  const sourceOutcome: DiV0NativeEventSourceOutcome =
    source.kind === 'SOURCE_FAILURE'
      ? 'SOURCE_FAILURE'
      : records.length === 0
        ? 'SOURCE_SUCCESS_NO_EVENTS'
        : 'SOURCE_SUCCESS_WITH_EVENTS';

  const events: DiV0NativeEventEvidenceItem[] = [];
  const acceptedDigests: string[] = [];
  const contextMismatches: DiV0NativeEventContextMismatch[] = [];
  const mismatchDigests: string[] = [];
  const conflictingDuplicates: DiV0NativeEventConflictingDuplicate[] = [];
  let identicalDuplicatesCollapsed = 0;

  const groups = groupByEventId(records);
  for (const group of groups) {
    const variantDigests = [...group.variants.keys()].sort(compareStrings);
    if (variantDigests.length > 1) {
      conflictingDuplicates.push({
        disposition: 'CONFLICTING_DUPLICATE',
        eventId: group.eventId,
        maxClaimLevel: 'L0',
        conflictingFields: conflictingFields(variantDigests.map((d) => group.variants.get(d)!)),
        variantDigests,
        inputRecordCount: group.inputRecordCount,
      });
      continue;
    }
    identicalDuplicatesCollapsed += group.inputRecordCount - 1;
    const record = group.variants.get(variantDigests[0])!;
    const reasons = contextMismatchReasons(record, context, window);
    if (reasons.length > 0) {
      contextMismatches.push({
        disposition: 'CONTEXT_MISMATCH',
        eventId: record.id,
        reasons,
        maxClaimLevel: 'L0',
        observed: {
          organizationId: record.organizationId ?? null,
          vehicleId: record.vehicleId,
          tripId: record.tripId ?? null,
          provider: record.provider ?? null,
          sourceFamily: record.sourceFamily,
          providerTimestamp: record.providerTimestamp,
        },
      });
      mismatchDigests.push(variantDigests[0]);
      continue;
    }
    events.push(toEvidenceItem(record));
    acceptedDigests.push(variantDigests[0]);
  }

  const { status, channelState } = deriveStatus(sourceOutcome, events.length);
  const counts = {
    inputRecords: records.length,
    distinctEventIds: groups.length,
    identicalDuplicatesCollapsed,
    accepted: events.length,
    contextMismatch: contextMismatches.length,
    conflictingDuplicate: conflictingDuplicates.length,
  };
  const sourceFailureCode = source.kind === 'SOURCE_FAILURE' ? source.failureCode : null;

  const snapshotIdentity = computeDiV0NativeEventSnapshotIdentity({
    context,
    sourceOutcome,
    sourceFailureCode,
    status,
    channelState,
    counts,
    events,
    acceptedDigests,
    contextMismatches,
    mismatchDigests,
    conflictingDuplicates,
  });

  return {
    adapterVersion: DI_V0_NATIVE_EVENT_EVIDENCE_ADAPTER_V0_2,
    status,
    sourceOutcome,
    sourceFailureCode,
    channelState,
    context,
    events,
    contextMismatches,
    conflictingDuplicates,
    counts,
    snapshotIdentity,
  };
}
