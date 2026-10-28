import type { Prisma } from '@prisma/client';
import { TripStatus } from '@prisma/client';
import type { PrismaService } from '../../../shared/database/prisma.service';
import { clipTripWindowsToLinkBounds } from './vsi-profile-cadence-stats.util';
import type {
  VsiLvStandbyTransmissionEvidenceInput,
  VsiLvStandbyTransmissionMeasurementPoint,
} from './vsi-profile-cadence.types';
import type { VsiProfileCadenceLoadContext } from './vsi-profile-cadence-evidence.loader';
import { VSI_LV_STANDBY_EVIDENCE_WINDOW_DAYS } from './vsi-lv-standby-transmission-profile-resolver.util';

export const VSI_LV_STANDBY_MAX_ROWS = 4_000;

export function buildLvStandbyTransmissionEvidenceWhere(
  vehicleId: string,
  windowStart: Date,
  decisionAt: Date,
): Prisma.BatteryMeasurementWhereInput {
  return {
    vehicleId,
    type: 'LIVE_VOLTAGE',
    quality: 'VALID',
    providerTimestamp: { not: null, gte: windowStart, lte: decisionAt },
    observedAt: { lte: decisionAt },
  };
}

function readProviderOutcome(provenance: unknown): string | null {
  if (!provenance || typeof provenance !== 'object') {
    return null;
  }
  const outcome = (provenance as { providerObservationOutcome?: unknown })
    .providerObservationOutcome;
  return typeof outcome === 'string' ? outcome : null;
}

export async function loadLvStandbyTransmissionEvidenceFromDb(
  prisma: PrismaService,
  ctx: VsiProfileCadenceLoadContext,
): Promise<VsiLvStandbyTransmissionEvidenceInput | null> {
  if (!ctx.refreshLvCadence) {
    return null;
  }

  const decisionAtMs = ctx.projectionAsOf.getTime();
  const linkActivatedMs = ctx.linkActivatedAt.getTime();
  const windowStartMs = Math.max(
    linkActivatedMs,
    decisionAtMs - VSI_LV_STANDBY_EVIDENCE_WINDOW_DAYS * 24 * 3600 * 1000,
  );
  const windowStart = new Date(windowStartMs);
  const decisionAt = ctx.projectionAsOf;

  const rows = await prisma.batteryMeasurement.findMany({
    where: buildLvStandbyTransmissionEvidenceWhere(ctx.vehicleId, windowStart, decisionAt),
    orderBy: [{ providerTimestamp: 'asc' }],
    take: VSI_LV_STANDBY_MAX_ROWS,
    select: {
      observedAt: true,
      providerTimestamp: true,
      provenance: true,
    },
  });

  const linkEnd = ctx.linkDeactivatedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const points: VsiLvStandbyTransmissionMeasurementPoint[] = [];
  const seenProviderTimestampMs = new Set<number>();
  for (const row of rows) {
    if (row.providerTimestamp == null) {
      continue;
    }
    const providerTimestampMs = row.providerTimestamp.getTime();
    if (providerTimestampMs < linkActivatedMs || providerTimestampMs > linkEnd) {
      continue;
    }
    if (seenProviderTimestampMs.has(providerTimestampMs)) {
      continue;
    }
    seenProviderTimestampMs.add(providerTimestampMs);
    points.push({
      observedAtMs: row.observedAt.getTime(),
      providerTimestampMs,
      providerObservationOutcome: readProviderOutcome(row.provenance),
    });
  }

  const trips = await prisma.vehicleTrip.findMany({
    where: {
      vehicleId: ctx.vehicleId,
      tripStatus: TripStatus.COMPLETED,
      endTime: { not: null, gte: windowStart, lte: decisionAt },
      startTime: { lte: decisionAt },
    },
    orderBy: { startTime: 'asc' },
    take: 500,
    select: { id: true, startTime: true, endTime: true },
  });

  const tripWindows = clipTripWindowsToLinkBounds(
    trips
      .filter((t) => t.endTime != null)
      .map((t) => ({
        tripId: t.id,
        startMs: t.startTime.getTime(),
        endMs: t.endTime!.getTime(),
      })),
    linkActivatedMs,
    ctx.linkDeactivatedAt?.getTime() ?? null,
  );

  return {
    contractVersion: 'vsi-lv-standby-transmission-evidence-v1',
    points,
    tripWindows,
    linkActivatedAtMs: linkActivatedMs,
    linkDeactivatedAtMs: ctx.linkDeactivatedAt?.getTime() ?? null,
    evidenceWindowDays: VSI_LV_STANDBY_EVIDENCE_WINDOW_DAYS,
    windowStartMs,
    windowEndMs: decisionAtMs,
    provenance: ['POSTGRES_BATTERY_MEASUREMENTS', 'VSI_LV_STANDBY_30D_WINDOW'],
  };
}
