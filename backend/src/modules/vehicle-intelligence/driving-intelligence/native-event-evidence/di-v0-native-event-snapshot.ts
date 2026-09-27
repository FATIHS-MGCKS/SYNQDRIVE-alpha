import { createHash } from 'crypto';
import type { TelemetrySourceFamily } from '../core/types';
import type { DiV0NativeEventEvidenceItem, DiV0NativeEventSnapshotIdentity } from './di-v0-native-event-evidence.types';
import {
  DI_V0_NATIVE_EVENT_EVIDENCE_ADAPTER_V0_1,
  DI_V0_NATIVE_EVENT_EVIDENCE_SNAPSHOT_V0_1,
} from './di-v0-native-event-evidence.versions';

export interface DiV0NativeEventSnapshotMaterial {
  vehicleId: string;
  sourceFamily: TelemetrySourceFamily;
  events: DiV0NativeEventEvidenceItem[];
}

export function serializeDiV0NativeEventSnapshot(material: DiV0NativeEventSnapshotMaterial): string {
  const lines: string[] = [
    DI_V0_NATIVE_EVENT_EVIDENCE_SNAPSHOT_V0_1,
    JSON.stringify(['adapter', DI_V0_NATIVE_EVENT_EVIDENCE_ADAPTER_V0_1]),
    JSON.stringify(['subject', material.vehicleId, material.sourceFamily]),
    JSON.stringify(['status', material.events.length === 0 ? 'NO_EVENT' : 'EVENTS_PRESENT']),
  ];
  const sorted = [...material.events].sort((a, b) => a.eventId.localeCompare(b.eventId));
  for (const event of sorted) {
    lines.push(
      JSON.stringify([
        'e',
        event.eventId,
        event.providerEventName,
        event.normalizedEventType,
        event.calibrationState,
        event.maxClaimLevel,
        event.providerTimestamp,
        event.temporalConfidence,
        event.observation.eventType,
      ]),
    );
  }
  return lines.join('\n');
}

export function computeDiV0NativeEventSnapshotIdentity(
  material: DiV0NativeEventSnapshotMaterial,
): DiV0NativeEventSnapshotIdentity {
  const digest = createHash('sha256').update(serializeDiV0NativeEventSnapshot(material), 'utf8').digest('hex');
  return {
    version: DI_V0_NATIVE_EVENT_EVIDENCE_SNAPSHOT_V0_1,
    algorithm: 'sha256',
    digest,
    inputEvidenceVersion: `${DI_V0_NATIVE_EVENT_EVIDENCE_SNAPSHOT_V0_1}:sha256:${digest}`,
  };
}
