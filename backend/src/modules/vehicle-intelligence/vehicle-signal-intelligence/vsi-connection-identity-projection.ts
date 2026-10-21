import {
  VO_CONNECTION_IDENTITY_CONTRACT_VERSION,
  VehicleConnectionModality,
} from '../../vehicle-onboarding/connection-identity/vehicle-connection-identity.contract';
import {
  parseConnectionIdentityFromLinkMetadata,
  VO_SOURCE_LINK_CONNECTION_IDENTITY_V2_VERSION,
  type VoSourceLinkConnectionIdentityMetadataV2,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/connection-identity-metadata-v2';
import type { VsiConnectionIdentityProjection, VsiSourceLinkRow } from './vsi-readonly-composer.types';

export function inferTelemetrySourceFamilyFromEvidence(
  verificationEvidence: readonly string[] | undefined,
): VsiConnectionIdentityProjection['telemetrySourceFamily'] {
  if (!verificationEvidence?.length) return 'UNKNOWN';
  const joined = verificationEvidence.join('|').toUpperCase();
  if (joined.includes('RUPTELA_R1') || joined.includes('RUPTELA')) return 'RUPTELA_R1';
  if (joined.includes('API_SYNTHETIC')) return 'API_SYNTHETIC';
  if (joined.includes('HIGH_MOBILITY')) return 'HIGH_MOBILITY';
  return 'UNKNOWN';
}

export function treatsAsPhysicalHardwareDevice(input: {
  verifiedModality: string | 'UNRESOLVED';
  physicalDeviceReference: string | 'NOT_APPLICABLE' | 'UNKNOWN' | 'UNRESOLVED';
}): boolean {
  if (input.verifiedModality === 'UNRESOLVED') return false;
  if (input.verifiedModality === VehicleConnectionModality.SOFTWARE_INTEGRATION) {
    return false;
  }
  if (input.verifiedModality === VehicleConnectionModality.HARDWARE_DEVICE) {
    const ref = input.physicalDeviceReference;
    if (ref === 'NOT_APPLICABLE' || ref === 'UNKNOWN' || ref === 'UNRESOLVED') {
      return false;
    }
    return ref.trim().length > 0;
  }
  return false;
}

function unresolvedProjection(
  link: VsiSourceLinkRow,
  limitations: string[],
): VsiConnectionIdentityProjection {
  return {
    provider: link.provider,
    providerSourceLinkId: link.id,
    verifiedModality: 'UNRESOLVED',
    physicalDeviceReference: 'UNRESOLVED',
    telemetrySourceFamily: 'UNRESOLVED',
    treatsAsPhysicalHardwareDevice: false,
    confidenceLimitations: [
      ...limitations,
      'PHYSICAL_DEVICE_PRESENCE_NOT_INFERRED_FROM_HARDWARE_TYPE',
    ],
  };
}

export function validateConnectionIdentityForLink(input: {
  record: VoSourceLinkConnectionIdentityMetadataV2;
  link: VsiSourceLinkRow;
  scope?: { organizationId: string; vehicleId: string };
}): string[] {
  const { record, link, scope } = input;
  const failures: string[] = [];
  if (record.contractVersion !== VO_CONNECTION_IDENTITY_CONTRACT_VERSION) {
    failures.push('UNSUPPORTED_CONNECTION_IDENTITY_CONTRACT_VERSION');
  }
  if (!record.verifiedModality) {
    failures.push('MISSING_VERIFIED_MODALITY');
  }
  if (!record.organizationId?.trim()) {
    failures.push('MISSING_CONNECTION_IDENTITY_ORGANIZATION_ID');
  }
  if (!record.vehicleId?.trim()) {
    failures.push('MISSING_CONNECTION_IDENTITY_VEHICLE_ID');
  }
  if (!record.providerSourceLinkId?.trim()) {
    failures.push('MISSING_CONNECTION_IDENTITY_LINK_ID');
  }
  if (!record.provider?.trim()) {
    failures.push('MISSING_CONNECTION_IDENTITY_PROVIDER');
  }
  if (scope) {
    if (record.organizationId && record.organizationId !== scope.organizationId) {
      failures.push('CONNECTION_IDENTITY_METADATA_ORG_MISMATCH');
    }
    if (record.vehicleId && record.vehicleId !== scope.vehicleId) {
      failures.push('CONNECTION_IDENTITY_METADATA_VEHICLE_MISMATCH');
    }
    if (record.providerSourceLinkId && record.providerSourceLinkId !== link.id) {
      failures.push('CONNECTION_IDENTITY_METADATA_LINK_ID_MISMATCH');
    }
    if (record.provider && link.provider && record.provider !== link.provider) {
      failures.push('CONNECTION_IDENTITY_METADATA_PROVIDER_MISMATCH');
    }
  }
  return failures;
}

export function projectConnectionIdentitiesFromLinks(
  links: readonly VsiSourceLinkRow[],
  scope?: { organizationId: string; vehicleId: string },
): VsiConnectionIdentityProjection[] {
  const projections: VsiConnectionIdentityProjection[] = [];
  const modalityByLink = new Map<string, string>();

  for (const link of links) {
    const parsed = parseConnectionIdentityFromLinkMetadata(link.metadata);
    if (!parsed) {
      projections.push(
        unresolvedProjection(link, ['MISSING_OR_MALFORMED_CONNECTION_IDENTITY_METADATA']),
      );
      continue;
    }

    if (parsed.kind !== 'v2') {
      projections.push(
        unresolvedProjection(link, ['UNSUPPORTED_CONNECTION_IDENTITY_METADATA_VERSION']),
      );
      continue;
    }

    const record = parsed.record;
    const scopeFailures = validateConnectionIdentityForLink({ record, link, scope });
    if (scopeFailures.length > 0) {
      projections.push(unresolvedProjection(link, scopeFailures));
      continue;
    }

    const verifiedModality = record.verifiedModality ?? 'UNRESOLVED';
    modalityByLink.set(link.id, verifiedModality);
    const physicalDeviceReference = record.physicalDeviceReference ?? 'UNKNOWN';
    const telemetrySourceFamily = inferTelemetrySourceFamilyFromEvidence(
      record.verificationEvidence,
    );
    const limitations: string[] = [];
    if (
      verifiedModality === VehicleConnectionModality.HARDWARE_DEVICE &&
      (physicalDeviceReference === 'UNKNOWN' || physicalDeviceReference === 'UNRESOLVED')
    ) {
      limitations.push('HARDWARE_MODALITY_WITHOUT_PROVEN_PHYSICAL_DEVICE_REFERENCE');
    }
    if (verifiedModality === VehicleConnectionModality.SOFTWARE_INTEGRATION) {
      limitations.push('VERIFIED_SOFTWARE_INTEGRATION_NOT_PHYSICAL_R1_DEVICE');
    }
    const episode = record.physicalEpisodeAttestation;
    if (episode?.independentlyProven === false) {
      limitations.push('PHYSICAL_EPISODE_NOT_INDEPENDENTLY_PROVEN');
    }

    projections.push({
      provider: link.provider,
      providerSourceLinkId: link.id,
      verifiedModality,
      physicalDeviceReference,
      telemetrySourceFamily,
      treatsAsPhysicalHardwareDevice: treatsAsPhysicalHardwareDevice({
        verifiedModality,
        physicalDeviceReference,
      }),
      confidenceLimitations: limitations,
    });
  }

  const activeHardware = projections.filter((p) => p.treatsAsPhysicalHardwareDevice);
  const activeSoftware = projections.filter(
    (p) => p.verifiedModality === VehicleConnectionModality.SOFTWARE_INTEGRATION,
  );
  if (activeHardware.length > 0 && activeSoftware.length > 0) {
    for (const p of projections) {
      if (!p.confidenceLimitations.includes('MULTIPLE_ACTIVE_CONNECTION_MODALITIES')) {
        p.confidenceLimitations.push('MULTIPLE_ACTIVE_CONNECTION_MODALITIES');
      }
    }
  }

  const modalities = [...modalityByLink.values()].filter((m) => m !== 'UNRESOLVED');
  if (new Set(modalities).size > 1 && modalities.length > 1) {
    for (const p of projections) {
      if (!p.confidenceLimitations.includes('CONFLICTING_VERIFIED_MODALITIES_ACROSS_LINKS')) {
        p.confidenceLimitations.push('CONFLICTING_VERIFIED_MODALITIES_ACROSS_LINKS');
      }
    }
  }

  return projections;
}

export const VSI_SUPPORTED_CONNECTION_IDENTITY_METADATA_VERSION =
  VO_SOURCE_LINK_CONNECTION_IDENTITY_V2_VERSION;
