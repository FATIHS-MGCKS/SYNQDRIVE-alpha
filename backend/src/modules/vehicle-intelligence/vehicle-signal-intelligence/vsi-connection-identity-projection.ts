import { VehicleConnectionModality } from '../../vehicle-onboarding/connection-identity/vehicle-connection-identity.contract';
import { parseConnectionIdentityFromLinkMetadata } from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/connection-identity-metadata-v2';
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
    return input.physicalDeviceReference !== 'NOT_APPLICABLE';
  }
  return false;
}

export function projectConnectionIdentitiesFromLinks(
  links: readonly VsiSourceLinkRow[],
): VsiConnectionIdentityProjection[] {
  const projections: VsiConnectionIdentityProjection[] = [];
  const modalityByLink = new Map<string, string>();

  for (const link of links) {
    const parsed = parseConnectionIdentityFromLinkMetadata(link.metadata);
    if (!parsed) {
      projections.push({
        provider: link.provider,
        providerSourceLinkId: link.id,
        verifiedModality: 'UNRESOLVED',
        physicalDeviceReference: 'UNRESOLVED',
        telemetrySourceFamily: 'UNRESOLVED',
        treatsAsPhysicalHardwareDevice: false,
        confidenceLimitations: [
          'MISSING_CONNECTION_IDENTITY_METADATA',
          'PHYSICAL_DEVICE_PRESENCE_NOT_INFERRED_FROM_HARDWARE_TYPE',
        ],
      });
      continue;
    }

    const record = parsed.record;
    const verifiedModality = record.verifiedModality ?? 'UNRESOLVED';
    modalityByLink.set(link.id, verifiedModality);
    const physicalDeviceReference = record.physicalDeviceReference ?? 'UNKNOWN';
    const telemetrySourceFamily = inferTelemetrySourceFamilyFromEvidence(
      record.verificationEvidence,
    );
    const limitations: string[] = [];
    if (verifiedModality === VehicleConnectionModality.SOFTWARE_INTEGRATION) {
      limitations.push('VERIFIED_SOFTWARE_INTEGRATION_NOT_PHYSICAL_R1_DEVICE');
    }
    const episode = (record as { physicalEpisodeAttestation?: { independentlyProven?: boolean } })
      .physicalEpisodeAttestation;
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
