import { maxClaimForUncalibratedNative } from '../core/claims/claim-confidence';
import type { NativeEventObservation } from '../core/types';
import { computeDiV0NativeEventSnapshotIdentity } from './di-v0-native-event-snapshot';
import type {
  DiV0NativeEventEvidenceItem,
  DiV0NativeEventEvidenceResult,
  DiV0NativeEventNormalizationRequest,
} from './di-v0-native-event-evidence.types';
import {
  DI_V0_NATIVE_EVENT_EVIDENCE_ADAPTER_V0_1,
  DI_V0_NATIVE_EVENT_EVIDENCE_KIND,
} from './di-v0-native-event-evidence.versions';
import { mapProviderNativeEventType } from './di-v0-native-event-type-mapping';

function resolveTemporalConfidence(providerTimestamp: string | null): NativeEventObservation['temporalConfidence'] {
  if (providerTimestamp == null || providerTimestamp.length === 0) return 'UNKNOWN';
  return 'UNKNOWN';
}

export function normalizeDiV0NativeEventEvidence(
  request: DiV0NativeEventNormalizationRequest,
): DiV0NativeEventEvidenceResult {
  const events: DiV0NativeEventEvidenceItem[] = request.records.map((record) => {
    const calibrationState = record.calibrationState ?? 'UNCALIBRATED';
    const normalizedEventType = mapProviderNativeEventType(record.providerEventName);
    const temporalConfidence = resolveTemporalConfidence(record.providerTimestamp);
    const observation: NativeEventObservation = {
      eventType: normalizedEventType,
      providerTimestamp: record.providerTimestamp,
      sourceFamily: record.sourceFamily,
      calibrationState,
      temporalConfidence,
      payloadRef: record.payloadRef ?? null,
      provenance: {
        derivedFrom: ['DRIVING_EVENTS_PERSISTENCE', record.id, record.providerEventName],
      },
    };
    const maxClaimLevel = maxClaimForUncalibratedNative(calibrationState);
    return {
      evidenceKind: DI_V0_NATIVE_EVENT_EVIDENCE_KIND,
      eventId: record.id,
      providerEventName: record.providerEventName,
      normalizedEventType,
      sourceFamily: record.sourceFamily,
      providerTimestamp: record.providerTimestamp,
      temporalConfidence,
      calibrationState,
      maxClaimLevel,
      observation,
      qualityFlags: normalizedEventType === 'UNKNOWN_NATIVE_EVENT' ? ['UNKNOWN_PROVIDER_EVENT_TYPE'] : [],
    };
  });

  const snapshotIdentity = computeDiV0NativeEventSnapshotIdentity({
    vehicleId: request.vehicleId,
    sourceFamily: request.sourceFamily,
    events,
  });

  return {
    adapterVersion: DI_V0_NATIVE_EVENT_EVIDENCE_ADAPTER_V0_1,
    status: events.length === 0 ? 'NO_EVENT' : 'EVENTS_PRESENT',
    events,
    snapshotIdentity,
  };
}
