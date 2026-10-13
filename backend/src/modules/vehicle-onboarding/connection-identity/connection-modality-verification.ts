import type { OnboardingSourceSnapshotV1 } from '../contracts/onboarding-source-snapshot.v1';
import { resolveTelemetrySourceFamily } from '@modules/vehicle-intelligence/telemetry-source-family';
import {
  VO_CONNECTION_IDENTITY_CONTRACT_VERSION,
  VehicleConnectionModality,
  type VoConnectionIdentityBindingMetadataV1,
} from './vehicle-connection-identity.contract';

export type ModalityVerificationStatus =
  | 'PROPOSED_ONLY'
  | 'VERIFIED_PROVIDER_EVIDENCE'
  | 'VERIFIED_ADMIN';

export type VerifiedConnectionIdentityResult =
  | {
      ok: true;
      verifiedModality: (typeof VehicleConnectionModality)[keyof typeof VehicleConnectionModality];
      modalityVerification: ModalityVerificationStatus;
      physicalDeviceReference: string | 'NOT_APPLICABLE' | 'UNKNOWN';
      deviceBindingEvidence: DeviceBindingEvidence | null;
      evidence: string[];
    }
  | { ok: false; reasonCode: string; evidence: string[] };

export type DeviceBindingEvidence = {
  source: 'DIMO_TELEMETRY_SOURCE_FAMILY';
  telemetrySourceFamily: 'RUPTELA_R1' | 'API_SYNTHETIC' | 'UNKNOWN';
  deviceSerial: string | null;
  assurance?: import('./device-binding-assurance').DeviceBindingAssuranceLevel;
  dimoTokenId?: number | null;
  providerDeviceIdHash?: string | null;
};

function readBinding(snap: OnboardingSourceSnapshotV1) {
  const meta = snap.bindingMetadata as VoConnectionIdentityBindingMetadataV1 | undefined;
  return meta?.connectionIdentity ?? null;
}

export function verifyDimoConnectionFromMirrorEvidence(
  rawJson: unknown,
  externalVehicleIdentity: string,
): VerifiedConnectionIdentityResult {
  const family = resolveTelemetrySourceFamily(rawJson);
  if (family === 'RUPTELA_R1') {
    const serial =
      typeof (rawJson as Record<string, unknown>)?.aftermarketDevice === 'object' &&
      (rawJson as { aftermarketDevice?: { serial?: unknown } }).aftermarketDevice?.serial != null
        ? String((rawJson as { aftermarketDevice: { serial: unknown } }).aftermarketDevice.serial)
        : null;
    if (!serial?.trim()) {
      return {
        ok: false,
        reasonCode: 'HARDWARE_DEVICE_SERIAL_MISSING',
        evidence: [`externalId:${externalVehicleIdentity}`, `family:${family}`],
      };
    }
    return {
      ok: true,
      verifiedModality: VehicleConnectionModality.HARDWARE_DEVICE,
      modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE',
      physicalDeviceReference: serial.trim(),
      deviceBindingEvidence: {
        source: 'DIMO_TELEMETRY_SOURCE_FAMILY',
        telemetrySourceFamily: family,
        deviceSerial: serial.trim(),
      },
      evidence: [`DIMO_RAW_JSON:RUPTELA_R1`, `serial:${serial.trim()}`],
    };
  }
  if (family === 'API_SYNTHETIC') {
    return {
      ok: true,
      verifiedModality: VehicleConnectionModality.SOFTWARE_INTEGRATION,
      modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE',
      physicalDeviceReference: 'NOT_APPLICABLE',
      deviceBindingEvidence: null,
      evidence: [`DIMO_RAW_JSON:API_SYNTHETIC`, `externalId:${externalVehicleIdentity}`],
    };
  }
  return {
    ok: false,
    reasonCode: 'DIMO_CONNECTION_MODALITY_UNVERIFIED',
    evidence: [`family:${family}`, `externalId:${externalVehicleIdentity}`],
  };
}

export function verifyHighMobilityConnectionFromMirrorEvidence(input: {
  clearanceStatus: string;
  hmVehicleReference: string | null;
  vin: string;
  organizationId: string | null;
  expectedOrganizationId: string;
}): VerifiedConnectionIdentityResult {
  if (input.organizationId && input.organizationId !== input.expectedOrganizationId) {
    return {
      ok: false,
      reasonCode: 'HM_ORG_OWNERSHIP_MISMATCH',
      evidence: [`hmOrg:${input.organizationId}`, `expectedOrg:${input.expectedOrganizationId}`],
    };
  }
  if (input.clearanceStatus !== 'APPROVED') {
    return {
      ok: false,
      reasonCode: 'HM_CLEARANCE_NOT_APPROVED',
      evidence: [`clearance:${input.clearanceStatus}`],
    };
  }
  const ref = input.hmVehicleReference?.trim();
  if (!ref) {
    return {
      ok: false,
      reasonCode: 'HM_PROVIDER_REFERENCE_MISSING',
      evidence: ['hmVehicleReference:null'],
    };
  }
  return {
    ok: true,
    verifiedModality: VehicleConnectionModality.OEM_CLOUD,
    modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE',
    physicalDeviceReference: 'NOT_APPLICABLE',
    deviceBindingEvidence: null,
    evidence: [`HM_CLEARANCE:APPROVED`, `hmRef:${ref}`, `vin:${input.vin}`],
  };
}

export function verifyManualConnectionEvidence(): VerifiedConnectionIdentityResult {
  return {
    ok: true,
    verifiedModality: VehicleConnectionModality.MANUAL_NO_TELEMETRY,
    modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE',
    physicalDeviceReference: 'NOT_APPLICABLE',
    deviceBindingEvidence: null,
    evidence: ['MANUAL_NO_TELEMETRY'],
  };
}

export function applyVerifiedConnectionIdentityToSnapshot(
  snap: OnboardingSourceSnapshotV1,
  proposedModality: (typeof VehicleConnectionModality)[keyof typeof VehicleConnectionModality],
  verified: VerifiedConnectionIdentityResult,
): OnboardingSourceSnapshotV1 {
  if (!verified.ok) {
    return mergeProposedOnly(snap, proposedModality, verified.evidence);
  }
  const existing = readBinding(snap);
  return {
    ...snap,
    bindingMetadata: {
      ...snap.bindingMetadata,
      connectionIdentity: {
        contractVersion: VO_CONNECTION_IDENTITY_CONTRACT_VERSION,
        proposedModality,
        verifiedModality: verified.verifiedModality,
        modalityVerification: verified.modalityVerification,
        provider: snap.providerType,
        providerVehicleReference: snap.externalVehicleIdentity,
        providerSourceRefId: existing?.providerSourceRefId,
        physicalDeviceReference: verified.physicalDeviceReference,
        deviceBindingRequired:
          verified.verifiedModality === VehicleConnectionModality.HARDWARE_DEVICE,
        deviceBindingEvidence: verified.deviceBindingEvidence,
        verificationEvidence: verified.evidence,
        classifiedAt: new Date().toISOString(),
      },
    },
  };
}

export function mergeProposedOnly(
  snap: OnboardingSourceSnapshotV1,
  proposedModality: (typeof VehicleConnectionModality)[keyof typeof VehicleConnectionModality],
  evidence: string[],
): OnboardingSourceSnapshotV1 {
  return {
    ...snap,
    bindingMetadata: {
      ...snap.bindingMetadata,
      connectionIdentity: {
        contractVersion: VO_CONNECTION_IDENTITY_CONTRACT_VERSION,
        proposedModality,
        verifiedModality: null,
        modalityVerification: 'PROPOSED_ONLY',
        provider: snap.providerType,
        providerVehicleReference: snap.externalVehicleIdentity,
        physicalDeviceReference: 'UNKNOWN',
        deviceBindingRequired: proposedModality === VehicleConnectionModality.HARDWARE_DEVICE,
        deviceBindingEvidence: null,
        verificationEvidence: evidence,
        classifiedAt: new Date().toISOString(),
      },
    },
  };
}

export function getVerifiedModalityFromSnapshot(
  snap: OnboardingSourceSnapshotV1,
): (typeof VehicleConnectionModality)[keyof typeof VehicleConnectionModality] | null {
  const binding = readBinding(snap);
  if (!binding) return null;
  if (binding.verifiedModality) return binding.verifiedModality;
  // Legacy v1 field (pre-P1): never treat as verified without modalityVerification
  if (
    binding.modalityVerification === 'VERIFIED_PROVIDER_EVIDENCE' ||
    binding.modalityVerification === 'VERIFIED_ADMIN'
  ) {
    return binding.verifiedModality ?? null;
  }
  return null;
}
