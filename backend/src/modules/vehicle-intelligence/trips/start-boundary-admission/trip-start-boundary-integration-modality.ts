import type { PrismaService } from '@shared/database/prisma.service';
import { VehicleConnectionModality } from '../../../vehicle-onboarding/connection-identity/vehicle-connection-identity.contract';
import {
  readConnectionIdentityFromLinkMetadata,
  readConnectionIdentityFromLinkMetadataV2,
} from '../../../vehicle-onboarding/connection-identity/source-link-connection-identity.metadata';
import type { TripStartIntegrationModality } from './trip-start-boundary-admission.types';

function mapVerifiedModality(
  verified: string | null | undefined,
): TripStartIntegrationModality {
  if (verified === VehicleConnectionModality.SOFTWARE_INTEGRATION) {
    return 'SOFTWARE_INTEGRATION';
  }
  if (verified === VehicleConnectionModality.HARDWARE_DEVICE) {
    return 'HARDWARE_DEVICE';
  }
  return 'UNKNOWN';
}

/**
 * Read-only integration modality from canonical vehicle data-source link metadata.
 * Never throws — returns UNKNOWN on missing data or errors.
 */
export async function resolveTripStartIntegrationModality(
  prisma: Pick<PrismaService, 'vehicleDataSourceLink'>,
  vehicleId: string,
): Promise<TripStartIntegrationModality> {
  try {
    const link = await prisma.vehicleDataSourceLink.findFirst({
      where: {
        vehicleId,
        provider: 'DIMO',
        isActive: true,
      },
      orderBy: { activatedAt: 'desc' },
      select: { metadata: true },
    });
    if (!link?.metadata) return 'UNKNOWN';

    const v2 = readConnectionIdentityFromLinkMetadataV2(link.metadata);
    if (v2?.verifiedModality) {
      return mapVerifiedModality(v2.verifiedModality);
    }
    const v1 = readConnectionIdentityFromLinkMetadata(link.metadata);
    if (v1?.verifiedModality) {
      return mapVerifiedModality(v1.verifiedModality);
    }
    return 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}
