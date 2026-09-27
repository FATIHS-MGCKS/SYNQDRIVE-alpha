import { createHash } from 'crypto';
import type {
  DiV0NativeEventChannelState,
  DiV0NativeEventConflictingDuplicate,
  DiV0NativeEventContextMismatch,
  DiV0NativeEventCounts,
  DiV0NativeEventEvidenceItem,
  DiV0NativeEventEvidenceStatus,
  DiV0NativeEventExpectedContext,
  DiV0NativeEventSnapshotIdentity,
  DiV0NativeEventSourceFailureCode,
  DiV0NativeEventSourceOutcome,
} from './di-v0-native-event-evidence.types';
import {
  DI_V0_NATIVE_EVENT_EVIDENCE_ADAPTER_V0_2,
  DI_V0_NATIVE_EVENT_EVIDENCE_SNAPSHOT_V0_2,
} from './di-v0-native-event-evidence.versions';

/**
 * Arrays are expected in eventId order (the normalizer emits them sorted); `acceptedDigests`
 * and `mismatchDigests` are index-aligned with `events` and `contextMismatches`.
 */
export interface DiV0NativeEventSnapshotMaterial {
  context: DiV0NativeEventExpectedContext;
  sourceOutcome: DiV0NativeEventSourceOutcome;
  sourceFailureCode: DiV0NativeEventSourceFailureCode | null;
  status: DiV0NativeEventEvidenceStatus;
  channelState: DiV0NativeEventChannelState;
  counts: DiV0NativeEventCounts;
  events: DiV0NativeEventEvidenceItem[];
  acceptedDigests: string[];
  contextMismatches: DiV0NativeEventContextMismatch[];
  mismatchDigests: string[];
  conflictingDuplicates: DiV0NativeEventConflictingDuplicate[];
}

export function serializeDiV0NativeEventSnapshot(material: DiV0NativeEventSnapshotMaterial): string {
  const { context, counts } = material;
  const lines: string[] = [
    DI_V0_NATIVE_EVENT_EVIDENCE_SNAPSHOT_V0_2,
    JSON.stringify(['adapter', DI_V0_NATIVE_EVENT_EVIDENCE_ADAPTER_V0_2]),
    JSON.stringify([
      'context',
      context.organizationId,
      context.vehicleId,
      context.tripId,
      context.windowStart,
      context.windowEnd,
      context.sourceFamily,
      context.provider,
    ]),
    JSON.stringify(['source', material.sourceOutcome, material.sourceFailureCode]),
    JSON.stringify(['status', material.status, material.channelState]),
    JSON.stringify([
      'counts',
      counts.inputRecords,
      counts.distinctEventIds,
      counts.identicalDuplicatesCollapsed,
      counts.accepted,
      counts.contextMismatch,
      counts.conflictingDuplicate,
    ]),
  ];
  material.events.forEach((event, i) => {
    lines.push(
      JSON.stringify([
        'e',
        event.eventId,
        material.acceptedDigests[i],
        event.normalizedEventType,
        event.calibrationState,
        event.maxClaimLevel,
        event.temporalConfidence,
      ]),
    );
  });
  material.contextMismatches.forEach((m, i) => {
    lines.push(JSON.stringify(['m', m.eventId, material.mismatchDigests[i], m.reasons, m.maxClaimLevel]));
  });
  for (const c of material.conflictingDuplicates) {
    lines.push(
      JSON.stringify(['c', c.eventId, c.conflictingFields, c.variantDigests, c.inputRecordCount, c.maxClaimLevel]),
    );
  }
  return lines.join('\n');
}

export function computeDiV0NativeEventSnapshotIdentity(
  material: DiV0NativeEventSnapshotMaterial,
): DiV0NativeEventSnapshotIdentity {
  const digest = createHash('sha256').update(serializeDiV0NativeEventSnapshot(material), 'utf8').digest('hex');
  return {
    version: DI_V0_NATIVE_EVENT_EVIDENCE_SNAPSHOT_V0_2,
    algorithm: 'sha256',
    digest,
    inputEvidenceVersion: `${DI_V0_NATIVE_EVENT_EVIDENCE_SNAPSHOT_V0_2}:sha256:${digest}`,
  };
}
