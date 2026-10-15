import { VehicleRegistryLifecycle } from '@prisma/client';
import type { PrismaService } from '../../../shared/database/prisma.service';

export type Vsi03P2cCaptureEligibilityInput = {
  organizationId: string;
  vehicleId: string;
  provider: string;
  providerBindingId: string | null;
};

export type Vsi03P2cCaptureEligibilityResult =
  | { eligible: true; providerBindingId: string }
  | { eligible: false; reason: string };

/**
 * Runtime eligibility for observation capture (no provider API calls).
 */
export async function assertVsi03P2cCaptureEligibility(
  prisma: Pick<PrismaService, 'vehicle' | 'vehicleDataSourceLink'>,
  input: Vsi03P2cCaptureEligibilityInput,
): Promise<Vsi03P2cCaptureEligibilityResult> {
  if (!input.providerBindingId?.trim()) {
    return { eligible: false, reason: 'PROVIDER_BINDING_ID_MISSING' };
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, organizationId: input.organizationId },
    select: { id: true, registryLifecycle: true },
  });

  if (!vehicle) {
    return { eligible: false, reason: 'VEHICLE_NOT_IN_ORGANIZATION' };
  }

  if (vehicle.registryLifecycle !== VehicleRegistryLifecycle.ACTIVE) {
    return { eligible: false, reason: 'VEHICLE_REGISTRY_NOT_ACTIVE' };
  }

  const link = await prisma.vehicleDataSourceLink.findFirst({
    where: {
      id: input.providerBindingId,
      vehicleId: input.vehicleId,
      isActive: true,
      supersededByLinkId: null,
      deactivatedAt: null,
    },
    select: { id: true, provider: true },
  });

  if (!link) {
    return { eligible: false, reason: 'ACTIVE_SOURCE_LINK_NOT_FOUND' };
  }

  const expectedProvider = input.provider.trim().toUpperCase();
  const linkProvider = link.provider.trim().toUpperCase();
  if (linkProvider !== expectedProvider) {
    return { eligible: false, reason: 'SOURCE_LINK_PROVIDER_MISMATCH' };
  }

  return { eligible: true, providerBindingId: link.id };
}
