import type { Prisma, VehicleOnboardingCaseSourceRef, VehicleDataSourceLink } from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { parseValidatedSourceSnapshot } from '../policy/persisted-contract.validation';
import { HIGH_MOBILITY_DATA_SOURCE_PROVIDER } from './high-mobility-data-source-link.contract';
import { DIMO_DATA_SOURCE_PROVIDER } from '@modules/dimo/dimo-vehicle-data-source-link.contract';
import {
  VehicleConnectionModality,
  type VoConnectionIdentityBindingMetadataV1,
} from './vehicle-connection-identity.contract';
import {
  getVerifiedModalityFromSnapshot,
  verifyDimoConnectionFromMirrorEvidence,
  verifyHighMobilityConnectionFromMirrorEvidence,
  type DeviceBindingEvidence,
} from './connection-modality-verification';
import {
  detectConflictingProviderIdentity,
  isManualOnlySourceSet,
  isTelemetryConnectedSourceRef,
} from './vehicle-connection-identity.classifier';

export type PerProviderConnectionIdentityAssessment = {
  provider: string;
  providerSourceRefId: string;
  preActivationScope: 'ONBOARDING_CASE_SOURCE_REF';
  providerVehicleReference: string;
  verifiedModality: string;
  physicalDeviceReference: string | 'NOT_APPLICABLE' | 'UNKNOWN';
  deviceBindingEvidence: DeviceBindingEvidence | null;
  evidence: string[];
};

function readBinding(snap: import('../contracts/onboarding-source-snapshot.v1').OnboardingSourceSnapshotV1) {
  const meta = snap.bindingMetadata as VoConnectionIdentityBindingMetadataV1 | undefined;
  return meta?.connectionIdentity ?? null;
}

export async function assertTelemetryConnectionIdentityForActivationTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceRefs: VehicleOnboardingCaseSourceRef[],
): Promise<PerProviderConnectionIdentityAssessment[]> {
  if (isManualOnlySourceSet(sourceRefs)) {
    return [];
  }

  const telemetryRefs = sourceRefs.filter(isTelemetryConnectedSourceRef);
  if (telemetryRefs.length === 0) {
    throw new VehicleOnboardingError(
      'ACTIVATION_PRECONDITION_FAILED',
      'Telemetry-connected activation requires DIMO or High Mobility source',
    );
  }

  const conflict = detectConflictingProviderIdentity(telemetryRefs);
  if (conflict) {
    throw new VehicleOnboardingError('ACTIVATION_PRECONDITION_FAILED', conflict);
  }

  const assessments: PerProviderConnectionIdentityAssessment[] = [];

  for (const ref of telemetryRefs) {
    const snap = parseValidatedSourceSnapshot(ref);
    const sealedVerified = getVerifiedModalityFromSnapshot(snap);
    if (!sealedVerified || sealedVerified === VehicleConnectionModality.UNKNOWN_REQUIRES_REVIEW) {
      throw new VehicleOnboardingError(
        'ACTIVATION_PRECONDITION_FAILED',
        'Connection modality is not verified for activation',
        { provider: ref.provider, reason: 'CONNECTION_MODALITY_UNVERIFIED' },
      );
    }

    if (ref.provider === 'DIMO' && ref.sourceMirrorId) {
      const dimo = await tx.dimoVehicle.findUnique({
        where: { id: ref.sourceMirrorId },
        select: { id: true, externalId: true, rawJson: true },
      });
      if (!dimo) {
        throw new VehicleOnboardingError(
          'ACTIVATION_PRECONDITION_FAILED',
          'DIMO mirror missing for connection identity',
        );
      }
      const live = verifyDimoConnectionFromMirrorEvidence(dimo.rawJson, ref.externalVehicleIdentity);
      if (!live.ok) {
        throw new VehicleOnboardingError(
          'ACTIVATION_PRECONDITION_FAILED',
          live.reasonCode,
          { evidence: live.evidence },
        );
      }
      if (live.verifiedModality !== sealedVerified) {
        throw new VehicleOnboardingError('READINESS_SEAL_STALE', 'DIMO verified modality drift', {
          sealed: sealedVerified,
          live: live.verifiedModality,
        });
      }
      if (live.verifiedModality === VehicleConnectionModality.HARDWARE_DEVICE) {
        assertHardwareDeviceBindingFromEvidence(live.deviceBindingEvidence, ref, organizationId);
      }
      assessments.push({
        provider: 'DIMO',
        providerSourceRefId: ref.id,
        preActivationScope: 'ONBOARDING_CASE_SOURCE_REF',
        providerVehicleReference: ref.externalVehicleIdentity,
        verifiedModality: live.verifiedModality,
        physicalDeviceReference: live.physicalDeviceReference,
        deviceBindingEvidence: live.deviceBindingEvidence,
        evidence: live.evidence,
      });
      continue;
    }

    if (ref.provider === 'HIGH_MOBILITY' && ref.sourceMirrorId) {
      const hm = await tx.highMobilityVehicle.findUnique({
        where: { id: ref.sourceMirrorId },
      });
      if (!hm) {
        throw new VehicleOnboardingError(
          'ACTIVATION_PRECONDITION_FAILED',
          'HM mirror missing for connection identity',
        );
      }
      const live = verifyHighMobilityConnectionFromMirrorEvidence({
        clearanceStatus: hm.clearanceStatus,
        hmVehicleReference: hm.hmVehicleReference,
        vin: hm.vin,
        organizationId: hm.organizationId,
        expectedOrganizationId: organizationId,
      });
      if (!live.ok) {
        throw new VehicleOnboardingError(
          'ACTIVATION_PRECONDITION_FAILED',
          live.reasonCode,
          { evidence: live.evidence },
        );
      }
      if (live.verifiedModality !== sealedVerified) {
        throw new VehicleOnboardingError('READINESS_SEAL_STALE', 'HM verified modality drift', {
          sealed: sealedVerified,
          live: live.verifiedModality,
        });
      }
      assessments.push({
        provider: 'HIGH_MOBILITY',
        providerSourceRefId: ref.id,
        preActivationScope: 'ONBOARDING_CASE_SOURCE_REF',
        providerVehicleReference: ref.externalVehicleIdentity,
        verifiedModality: live.verifiedModality,
        physicalDeviceReference: live.physicalDeviceReference,
        deviceBindingEvidence: null,
        evidence: live.evidence,
      });
      continue;
    }

    throw new VehicleOnboardingError(
      'ACTIVATION_PRECONDITION_FAILED',
      'Unsupported telemetry provider for connection identity',
      { provider: ref.provider },
    );
  }

  return assessments;
}

export function assertHardwareDeviceBindingFromEvidence(
  evidence: DeviceBindingEvidence | null,
  ref: VehicleOnboardingCaseSourceRef,
  organizationId: string,
): void {
  if (!evidence || evidence.telemetrySourceFamily !== 'RUPTELA_R1') {
    throw new VehicleOnboardingError(
      'ACTIVATION_PRECONDITION_FAILED',
      'PHYSICAL_DEVICE_BINDING_MISSING',
      { provider: ref.provider, organizationId },
    );
  }
  if (!evidence.deviceSerial?.trim()) {
    throw new VehicleOnboardingError(
      'ACTIVATION_PRECONDITION_FAILED',
      'PHYSICAL_DEVICE_BINDING_MISSING',
      { reason: 'DEVICE_SERIAL_MISSING' },
    );
  }
}

export function assertPersistedSourceLinksMatchSnapshots(
  sourceRefs: VehicleOnboardingCaseSourceRef[],
  links: VehicleDataSourceLink[],
): void {
  const activeLinks = links.filter((l) => l.isActive);
  for (const ref of sourceRefs.filter(isTelemetryConnectedSourceRef)) {
    const snap = parseValidatedSourceSnapshot(ref);
    const binding = readBinding(snap);
    const verified = getVerifiedModalityFromSnapshot(snap);
    if (!verified) continue;

    if (ref.provider === 'DIMO') {
      const link = activeLinks.find(
        (l) => l.sourceType === 'DIMO' && l.dimoVehicleId === ref.sourceMirrorId,
      );
      if (!link) {
        throw new VehicleOnboardingError(
          'ACTIVATION_PRECONDITION_FAILED',
          'DIMO source link missing after activation',
        );
      }
      if (link.provider !== DIMO_DATA_SOURCE_PROVIDER) {
        throw new VehicleOnboardingError(
          'ACTIVATION_PRECONDITION_FAILED',
          'DIMO source link provider mismatch',
          { provider: link.provider },
        );
      }
      if (binding?.providerVehicleReference && binding.providerVehicleReference !== ref.externalVehicleIdentity) {
        throw new VehicleOnboardingError(
          'ACTIVATION_PRECONDITION_FAILED',
          'DIMO link identity mismatch vs snapshot',
        );
      }
    }

    if (ref.provider === 'HIGH_MOBILITY') {
      const subtype = snap.sourceEvidence?.sourceMode === 'HM_ONLY' ? 'HM_ONLY' : 'HM_HEALTH';
      const link = activeLinks.find(
        (l) =>
          l.sourceType === 'HIGH_MOBILITY' &&
          l.sourceReferenceId === ref.sourceMirrorId &&
          (l.sourceSubtype === subtype || l.sourceSubtype == null),
      );
      if (!link) {
        throw new VehicleOnboardingError(
          'ACTIVATION_PRECONDITION_FAILED',
          'HM source link missing after activation',
        );
      }
      if (link.provider !== HIGH_MOBILITY_DATA_SOURCE_PROVIDER) {
        throw new VehicleOnboardingError(
          'ACTIVATION_PRECONDITION_FAILED',
          'HM source link provider mismatch',
          { provider: link.provider },
        );
      }
    }
  }
}
