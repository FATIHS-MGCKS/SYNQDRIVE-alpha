import type { Prisma } from '@prisma/client';
import { hashProviderDeviceId } from '@modules/dimo/device-connection-episode.service';
import { DIMO_DATA_SOURCE_PROVIDER, DIMO_DATA_SOURCE_TYPE } from '@modules/dimo/dimo-vehicle-data-source-link.contract';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import type { DeviceBindingEvidence } from './connection-modality-verification';

/**
 * What activation can prove without requiring device online or post-vehicle episodes.
 *
 * - PROVIDER_SERIAL_MIRROR_ALIGNED: serial in DIMO identity payload + mirror id/external ref match source ref
 * - PROVIDER_SERIAL_MIRROR_TOKEN_SCOPED: above + DIMO tokenId present (canonical providerDeviceIdHash scope)
 *
 * Does NOT claim DeviceConnectionEpisode / PhysicalState proof (vehicle may not exist yet).
 */
export type DeviceBindingAssuranceLevel =
  | 'INSUFFICIENT'
  | 'PROVIDER_SERIAL_MIRROR_ALIGNED'
  | 'PROVIDER_SERIAL_MIRROR_TOKEN_SCOPED';

export function enrichDimoDeviceBindingEvidence(
  evidence: DeviceBindingEvidence,
  dimo: { tokenId: number | null },
): DeviceBindingEvidence {
  const assurance: DeviceBindingAssuranceLevel =
    dimo.tokenId != null
      ? 'PROVIDER_SERIAL_MIRROR_TOKEN_SCOPED'
      : 'PROVIDER_SERIAL_MIRROR_ALIGNED';
  const providerDeviceIdHash =
    dimo.tokenId != null ? hashProviderDeviceId('DIMO', dimo.tokenId) : null;
  return {
    ...evidence,
    assurance,
    dimoTokenId: dimo.tokenId,
    providerDeviceIdHash,
  };
}

export async function assertDimoHardwareDeviceBindingForActivation(
  tx: Prisma.TransactionClient,
  input: {
    evidence: DeviceBindingEvidence | null;
    ref: { id: string; sourceMirrorId: string | null; externalVehicleIdentity: string };
    organizationId: string;
    dimo: { id: string; externalId: string; tokenId: number | null };
  },
): Promise<DeviceBindingAssuranceLevel> {
  if (!input.evidence || input.evidence.telemetrySourceFamily !== 'RUPTELA_R1') {
    throw new VehicleOnboardingError(
      'ACTIVATION_PRECONDITION_FAILED',
      'PHYSICAL_DEVICE_BINDING_MISSING',
      { reason: 'TELEMETRY_FAMILY_NOT_RUPTELA_R1' },
    );
  }
  if (!input.evidence.deviceSerial?.trim()) {
    throw new VehicleOnboardingError(
      'ACTIVATION_PRECONDITION_FAILED',
      'PHYSICAL_DEVICE_BINDING_MISSING',
      { reason: 'DEVICE_SERIAL_MISSING' },
    );
  }
  if (!input.ref.sourceMirrorId || input.dimo.id !== input.ref.sourceMirrorId) {
    throw new VehicleOnboardingError(
      'ACTIVATION_PRECONDITION_FAILED',
      'PHYSICAL_DEVICE_BINDING_MISSING',
      { reason: 'DIMO_MIRROR_ID_MISMATCH' },
    );
  }
  const ext = input.dimo.externalId?.trim();
  const refExt = input.ref.externalVehicleIdentity?.trim();
  if (!ext || !refExt || ext !== refExt) {
    throw new VehicleOnboardingError(
      'ACTIVATION_PRECONDITION_FAILED',
      'PHYSICAL_DEVICE_BINDING_MISSING',
      { reason: 'DIMO_PROVIDER_VEHICLE_IDENTITY_MISMATCH' },
    );
  }

  const crossTenant = await tx.vehicleDataSourceLink.findFirst({
    where: {
      provider: DIMO_DATA_SOURCE_PROVIDER,
      sourceType: DIMO_DATA_SOURCE_TYPE,
      dimoVehicleId: input.dimo.id,
      isActive: true,
      vehicle: { organizationId: { not: input.organizationId } },
    },
    select: { id: true },
  });
  if (crossTenant) {
    throw new VehicleOnboardingError(
      'ACTIVATION_PRECONDITION_FAILED',
      'PHYSICAL_DEVICE_BINDING_MISSING',
      { reason: 'DIMO_MIRROR_ACTIVE_IN_OTHER_TENANT' },
    );
  }

  const enriched = enrichDimoDeviceBindingEvidence(input.evidence, input.dimo);
  const assurance = enriched.assurance ?? 'INSUFFICIENT';
  if (assurance === 'INSUFFICIENT') {
    throw new VehicleOnboardingError(
      'ACTIVATION_PRECONDITION_FAILED',
      'PHYSICAL_DEVICE_BINDING_MISSING',
      { reason: 'ASSURANCE_INSUFFICIENT' },
    );
  }
  return assurance;
}
