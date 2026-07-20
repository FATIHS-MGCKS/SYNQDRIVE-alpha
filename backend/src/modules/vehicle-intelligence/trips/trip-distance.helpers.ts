import type { VehicleTrip } from '@prisma/client';

type TripDistanceInput = Pick<
  VehicleTrip,
  'distanceKm' | 'dimoSegmentId' | 'startDetectionMode' | 'rawDetectionMeta'
>;

interface DimoSegmentMeta {
  distanceKm?: number | null;
}

interface RawDetectionMeta {
  repairSource?: string;
  dimoSegment?: DimoSegmentMeta;
}

function asRawDetectionMeta(value: unknown): RawDetectionMeta | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as RawDetectionMeta;
}

function normalizeDistanceKm(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

/**
 * DIMO changePoint segment odometer delta is the canonical distance for
 * repaired trips. Route map-matching can undercount when GPS/route points are
 * sparse or incomplete inside the segment window.
 */
export function resolveDimoCanonicalDistanceKm(
  trip: TripDistanceInput,
): number | null {
  const meta = asRawDetectionMeta(trip.rawDetectionMeta);
  const fromMeta = normalizeDistanceKm(meta?.dimoSegment?.distanceKm);
  if (fromMeta != null) {
    return fromMeta;
  }

  const isDimoRepair =
    trip.dimoSegmentId != null ||
    (trip.startDetectionMode?.startsWith('DIMO_') &&
      trip.startDetectionMode.endsWith('_REPAIR'));

  if (!isDimoRepair) {
    return null;
  }

  return normalizeDistanceKm(trip.distanceKm);
}

/**
 * Distance field for route enrichment writes. Preserves DIMO odometer truth and
 * only falls back to map-matched geometry when no canonical DIMO distance exists.
 */
export function resolveEnrichmentDistanceKm(
  trip: TripDistanceInput,
  mapMatchedDistanceMeters: number | null | undefined,
): number | null {
  const dimoKm = resolveDimoCanonicalDistanceKm(trip);
  if (dimoKm != null) {
    return dimoKm;
  }

  if (mapMatchedDistanceMeters != null && mapMatchedDistanceMeters > 0) {
    return Math.round(mapMatchedDistanceMeters / 100) / 10;
  }

  return trip.distanceKm ?? null;
}
