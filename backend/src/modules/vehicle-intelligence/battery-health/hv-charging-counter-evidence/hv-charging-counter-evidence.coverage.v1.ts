import type { Prisma } from '@prisma/client';
import type { HvChargingCounterBucketInputV1 } from './hv-charging-counter-evidence.types.v1';

function bucketMatchesLatestRevision(
  latest: {
    availability: string;
    valueKwh: number | null;
    minKwh: number | null;
    maxKwh: number | null;
  } | null,
  bucket: HvChargingCounterBucketInputV1,
): boolean {
  if (latest == null) return false;
  return (
    latest.availability === bucket.availability &&
    (latest.valueKwh ?? null) === (bucket.valueKwh ?? null) &&
    (latest.minKwh ?? null) === (bucket.minKwh ?? null) &&
    (latest.maxKwh ?? null) === (bucket.maxKwh ?? null)
  );
}

/**
 * True when the provider returned a strict subset of known bucket slots with unchanged values
 * (reduced window coverage) — allows a durable batch without new observation revisions.
 */
export async function isReducedCoverageUnchangedValuesV1(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    vehicleId: string;
    segmentFingerprint: string;
    buckets: HvChargingCounterBucketInputV1[];
  },
): Promise<boolean> {
  if (input.buckets.length === 0) return false;

  const latestPerSlot = await tx.batteryHvChargingCounterObservation.findMany({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segmentFingerprint: input.segmentFingerprint,
    },
    orderBy: [{ bucketStartAt: 'asc' }, { revisionNumber: 'desc' }],
    distinct: ['bucketStartAt'],
    select: {
      bucketStartAt: true,
      availability: true,
      valueKwh: true,
      minKwh: true,
      maxKwh: true,
    },
  });

  if (latestPerSlot.length === 0) return false;
  if (input.buckets.length >= latestPerSlot.length) return false;

  const latestByStart = new Map(
    latestPerSlot.map((row) => [row.bucketStartAt.toISOString(), row]),
  );

  for (const bucket of input.buckets) {
    const latest = latestByStart.get(bucket.bucketStartAt.toISOString());
    if (!latest || !bucketMatchesLatestRevision(latest, bucket)) {
      return false;
    }
  }

  const inputStarts = new Set(input.buckets.map((b) => b.bucketStartAt.toISOString()));
  const hasOmittedKnownSlot = latestPerSlot.some(
    (row) => !inputStarts.has(row.bucketStartAt.toISOString()),
  );
  return hasOmittedKnownSlot;
}
