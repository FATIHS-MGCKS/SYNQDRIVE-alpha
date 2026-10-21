import {
  DeviceConnectionPhysicalEvidenceSource,
  DimoDeviceConnectionEventType,
  type Prisma,
} from '@prisma/client';
import {
  buildBindingScopeFromToken,
  normalizeConnectivityProvider,
} from './device-connection-physical-state.binding';
import { extractObdIsPluggedInEvidence } from './device-connection-physical-state.obd-evidence';
import type {
  PhysicalStatePreseedCandidate,
  PhysicalStatePreseedScope,
} from './physical-state-preseed.types';

const OBD_EVENT_TYPES: DimoDeviceConnectionEventType[] = [
  DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
  DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
];

function mapWebhookEventToCandidate(input: {
  event: {
    id: string;
    eventType: DimoDeviceConnectionEventType;
    observedAt: Date;
    tokenId: number;
    provider: string;
    vehicleId: string;
  };
  scopeBindingKey: string;
}): PhysicalStatePreseedCandidate | null {
  if (!input.event.observedAt || Number.isNaN(input.event.observedAt.getTime())) {
    return null;
  }

  const provider = normalizeConnectivityProvider(input.event.provider);
  const binding = buildBindingScopeFromToken({
    provider,
    tokenId: input.event.tokenId,
  });

  if (binding.bindingKey !== input.scopeBindingKey) {
    return null;
  }

  const plugged =
    input.event.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN;
  const plugLabel = plugged ? 'plug' : 'unplug';

  return {
    candidateState: plugged ? 'PLUGGED' : 'UNPLUGGED',
    evidenceObservedAt: input.event.observedAt,
    evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
    evidenceReferenceId: `webhook:${input.event.vehicleId}:${input.event.observedAt.toISOString()}:${plugLabel}`,
    bindingKey: binding.bindingKey,
    provenance: 'dimo_webhook_event',
    sourceRecordId: input.event.id,
  };
}

export async function discoverPhysicalStatePreseedCandidates(
  prisma: Prisma.TransactionClient | { dimoDeviceConnectionEvent: Prisma.DimoDeviceConnectionEventDelegate; vehicleLatestState: Prisma.VehicleLatestStateDelegate },
  scope: PhysicalStatePreseedScope,
): Promise<PhysicalStatePreseedCandidate[]> {
  const provider = normalizeConnectivityProvider(scope.provider);
  const binding = buildBindingScopeFromToken({
    provider,
    tokenId: scope.tokenId,
    deviceBindingId: scope.deviceBindingId ?? null,
  });

  const candidates: PhysicalStatePreseedCandidate[] = [];

  const events = await prisma.dimoDeviceConnectionEvent.findMany({
    where: {
      organizationId: scope.organizationId,
      vehicleId: scope.vehicleId,
      provider,
      tokenId: scope.tokenId,
      eventType: { in: OBD_EVENT_TYPES },
    },
    select: {
      id: true,
      eventType: true,
      observedAt: true,
      tokenId: true,
      provider: true,
      vehicleId: true,
    },
  });

  for (const event of events) {
    const candidate = mapWebhookEventToCandidate({
      event,
      scopeBindingKey: binding.bindingKey,
    });
    if (candidate) {
      candidates.push(candidate);
    }
  }

  const vls = await prisma.vehicleLatestState.findFirst({
    where: { vehicleId: scope.vehicleId },
    select: {
      id: true,
      vehicleId: true,
      dimoTokenId: true,
      providerBindingId: true,
      rawPayloadJson: true,
    },
  });

  if (vls && vls.dimoTokenId === scope.tokenId) {
    const snapshotEvidence = extractObdIsPluggedInEvidence({
      organizationId: scope.organizationId,
      vehicleId: vls.vehicleId,
      dimoTokenId: vls.dimoTokenId,
      providerBindingId: vls.providerBindingId,
      rawPayloadJson: vls.rawPayloadJson,
    });

    if (snapshotEvidence && snapshotEvidence.binding.bindingKey === binding.bindingKey) {
      candidates.push({
        candidateState: snapshotEvidence.candidateState,
        evidenceObservedAt: snapshotEvidence.evidenceObservedAt,
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
        evidenceReferenceId: snapshotEvidence.evidenceReferenceId,
        bindingKey: snapshotEvidence.binding.bindingKey,
        provenance: 'vehicle_latest_state_obd',
        sourceRecordId: vls.id,
      });
    }
  }

  return candidates;
}
