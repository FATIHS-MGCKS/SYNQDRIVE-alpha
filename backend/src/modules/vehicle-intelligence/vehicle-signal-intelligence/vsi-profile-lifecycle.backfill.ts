import type { PrismaClient } from '@prisma/client';
import { VSI_PROFILE_BACKFILL_MAX_LINKS_PER_RUN } from './vsi-profile-lifecycle.constants';
import type { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';

/**
 * Bounded, idempotent backfill for active vehicles missing a profile row.
 * Intended for operator CLI / controlled batch outbox events — not auto-run on deploy.
 */
export async function planActiveVehicleProfileBackfill(input: {
  organizationId?: string;
  materialization: VsiSignalProfileMaterializationService;
  cursor?: string | null;
  prisma?: PrismaClient;
  maxLinks?: number;
}): Promise<{ processed: number; nextCursor: string | null }> {
  const max = input.maxLinks ?? VSI_PROFILE_BACKFILL_MAX_LINKS_PER_RUN;
  const links = await input.materialization.listActiveLinksMissingProfiles({
    organizationId: input.organizationId,
    afterLinkId: input.cursor ?? null,
    limit: max,
  });

  let processed = 0;
  let lastId: string | null = null;
  for (const link of links) {
    await input.materialization.materializeFromPersistedEvidence({
      organizationId: link.organizationId,
      vehicleId: link.vehicleId,
      providerSourceLinkId: link.id,
      lifecycleMode: 'BACKFILL_RECONCILE',
    });
    processed += 1;
    lastId = link.id;
  }

  const nextCursor = links.length >= max && lastId ? lastId : null;
  return { processed, nextCursor };
}
