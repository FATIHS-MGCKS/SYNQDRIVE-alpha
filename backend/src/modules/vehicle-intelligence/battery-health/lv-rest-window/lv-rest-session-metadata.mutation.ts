import type { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export class LvRestSessionMetadataConflictError extends Error {
  constructor(message = 'lv_rest_session_metadata_update_conflict_exhausted') {
    super(message);
    this.name = 'LvRestSessionMetadataConflictError';
  }
}

const DEFAULT_MAX_ATTEMPTS = 8;

/**
 * Optimistic compare-and-set over BatteryMeasurementSession.metadata using updatedAt.
 * Re-reads fresh metadata on conflict so concurrent writers converge without regressing
 * newer sibling target / handoff state.
 */
export async function mutateLvRestSessionMetadata(
  prisma: PrismaService,
  input: {
    sessionId: string;
    organizationId: string;
    mutate: (metadata: unknown) => Prisma.InputJsonValue;
    maxAttempts?: number;
  },
): Promise<Prisma.InputJsonValue> {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const session = await prisma.batteryMeasurementSession.findFirst({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
      },
      select: { metadata: true, updatedAt: true },
    });
    if (!session) {
      throw new Error('lv_rest_session_not_found');
    }

    const nextMetadata = input.mutate(session.metadata);
    const updated = await prisma.batteryMeasurementSession.updateMany({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
        updatedAt: session.updatedAt,
      },
      data: { metadata: nextMetadata },
    });

    if (updated.count === 1) {
      return nextMetadata;
    }
  }

  throw new LvRestSessionMetadataConflictError();
}
