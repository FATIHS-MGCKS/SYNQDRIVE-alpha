import type { PrismaService } from '../../../shared/database/prisma.service';
import type { VsiBundleHistoricalEvidence } from './vsi-signal-quality.classifier';

const BUNDLE_HISTORY_LIMIT = 64;

const BUNDLE_OUTCOMES = ['PROVIDER_FETCH_RECORDED', 'MONOTONIC_STALE_SKIPPED'] as const;

/**
 * Loads bounded bundle-level provider source timestamps from the VSI03 observation ledger.
 * Does not use poll SUCCESS counts as transmission cadence.
 */
export async function loadVsiBundleHistoricalEvidence(
  prisma: PrismaService,
  input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    provider: string;
  },
): Promise<VsiBundleHistoricalEvidence> {
  const rows = await prisma.vehicleProviderSourceObservation.findMany({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      provider: input.provider,
      providerBindingId: input.providerSourceLinkId,
      observationOutcome: { in: [...BUNDLE_OUTCOMES] },
      providerSourceTimestamp: { not: null },
    },
    orderBy: [{ providerSourceTimestamp: 'asc' }],
    take: BUNDLE_HISTORY_LIMIT,
    select: { providerSourceTimestamp: true },
  });

  const bundleSourceTimestamps = rows
    .map((r) => r.providerSourceTimestamp)
    .filter((ts): ts is Date => ts instanceof Date);

  return { bundleSourceTimestamps };
}
