import type { PrismaClient } from '@prisma/client';
import type { DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';
import type { Ds4LongitudinalEvidenceChannelManifestEntryV1, Ds4LongitudinalEvidenceQualityContextV1 } from './ds4-longitudinal-evidence-quality.v1';

function parseChannelManifest(raw: unknown): Ds4LongitudinalEvidenceQualityContextV1['channelManifest'] {
  if (!Array.isArray(raw)) return undefined;
  const out: Ds4LongitudinalEvidenceChannelManifestEntryV1[] = [];
  for (const row of raw) {
    if (row == null || typeof row !== 'object') continue;
    const channel = (row as { channel?: unknown }).channel;
    const outcome = (row as { outcome?: unknown }).outcome;
    if (typeof channel === 'string' && typeof outcome === 'string') {
      out.push({ channel, outcome });
    }
  }
  return out.length > 0 ? out : undefined;
}

/** Read-only: resolves S4 source family + channel manifest for Layer-2 evidence projection. */
export async function loadDs4LongitudinalEvidenceQualityContextV1(
  prisma: PrismaClient,
  scope: {
    organizationId: string;
    tripId: string;
    pinnedSnapshotHash: string;
    sparseChannelOutcome: string | null;
  },
): Promise<Ds4LongitudinalEvidenceQualityContextV1 | null> {
  const workItemModel = (prisma as { diV0S4WorkItem?: { findFirst: typeof prisma.diV0S4WorkItem.findFirst } })
    .diV0S4WorkItem;
  const snapshotModel = (prisma as { diV0S4EvidenceSnapshot?: { findFirst: typeof prisma.diV0S4EvidenceSnapshot.findFirst } })
    .diV0S4EvidenceSnapshot;
  if (!workItemModel?.findFirst || !snapshotModel?.findFirst) {
    return null;
  }

  const wi = await workItemModel.findFirst({
    where: {
      organizationId: scope.organizationId,
      tripId: scope.tripId,
      pinnedSnapshotHash: scope.pinnedSnapshotHash,
    },
    select: { sourceFamily: true },
    orderBy: { completedAt: 'desc' },
  });
  if (!wi?.sourceFamily) return null;

  const snap = await snapshotModel.findFirst({
    where: {
      organizationId: scope.organizationId,
      tripId: scope.tripId,
      snapshotHash: scope.pinnedSnapshotHash,
    },
    select: { channelManifest: true },
  });

  return {
    sourceFamily: wi.sourceFamily as DiV0S4SourceFamily,
    channelManifest: parseChannelManifest(snap?.channelManifest),
    sparseChannelOutcome: scope.sparseChannelOutcome,
  };
}
