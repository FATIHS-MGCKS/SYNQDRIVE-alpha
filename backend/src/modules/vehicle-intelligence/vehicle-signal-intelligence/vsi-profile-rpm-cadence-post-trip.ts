import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../../shared/database/prisma.service';
import type { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';

/**
 * Best-effort post-trip RPM cadence refresh (idempotent, non-blocking).
 * Chained after HF mirror when possible so ClickHouse points exist.
 */
export async function refreshVsiRpmCadenceAfterTrip(input: {
  prisma: PrismaService;
  materialization: VsiSignalProfileMaterializationService;
  logger: Logger;
  organizationId: string | null | undefined;
  vehicleId: string;
  providerSourceLinkId: string | null | undefined;
}): Promise<void> {
  if (!input.organizationId || !input.providerSourceLinkId) {
    return;
  }
  try {
    await input.materialization.materializeFromPersistedEvidence({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
      requireBindingMatch: true,
      lifecycleMode: 'TRIP_FINALIZED_RPM_CADENCE',
    });
  } catch (err) {
    input.logger.warn(
      `VSI RPM cadence refresh failed vehicle=${input.vehicleId} trip link=${input.providerSourceLinkId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export async function resolveDimoProviderSourceLinkIdForVehicle(
  prisma: PrismaService,
  vehicleId: string,
): Promise<string | null> {
  const link = await prisma.vehicleDataSourceLink.findFirst({
    where: { vehicleId, isActive: true, provider: 'DIMO' },
    orderBy: { activatedAt: 'desc' },
    select: { id: true },
  });
  return link?.id ?? null;
}
