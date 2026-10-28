import type { Prisma } from '@prisma/client';
import { HardwareType, TripStatus } from '@prisma/client';
import type { PrismaService } from '../../../shared/database/prisma.service';
import { clipTripWindowsToLinkBounds } from './vsi-profile-cadence-stats.util';
import type {
  VsiLvStandbyTransmissionEvidenceInput,
  VsiLvStandbyTransmissionEvidenceLoadIntegrity,
  VsiLvStandbyTransmissionMeasurementPoint,
} from './vsi-profile-cadence.types';
import type { VsiProfileCadenceLoadContext } from './vsi-profile-cadence-evidence.loader';
import { VSI_LV_STANDBY_EVIDENCE_WINDOW_DAYS } from './vsi-lv-standby-transmission-profile-resolver.util';

export const VSI_LV_STANDBY_MAX_ROWS = 4_000;
export const VSI_LV_STANDBY_MAX_COMPLETED_TRIPS = 500;

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

export function buildLvStandbyCompletedTripWhere(
  vehicleId: string,
  windowStart: Date,
  decisionAt: Date,
): Prisma.VehicleTripWhereInput {
  return {
    vehicleId,
    tripStatus: TripStatus.COMPLETED,
    endTime: { not: null, gte: windowStart, lte: decisionAt },
    startTime: { lte: decisionAt },
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

function readProviderSourceLinkId(provenance: unknown): string | null {
  if (!provenance || typeof provenance !== 'object') {
    return null;
  }
  const linkId = (provenance as { providerSourceLinkId?: unknown }).providerSourceLinkId;
  return typeof linkId === 'string' ? linkId : null;
}

export async function verifyLvStandbySourceLinkAttribution(
  prisma: PrismaService,
  ctx: VsiProfileCadenceLoadContext,
): Promise<{ verified: boolean; code: string }> {
  const link = await prisma.vehicleDataSourceLink.findFirst({
    where: {
      id: ctx.providerSourceLinkId,
      vehicleId: ctx.vehicleId,
      isActive: true,
      provider: 'DIMO',
    },
    select: { id: true },
  });
  if (!link) {
    return { verified: false, code: 'ACTIVE_DIMO_SOURCE_LINK_NOT_FOUND' };
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: ctx.vehicleId, organizationId: ctx.organizationId },
    select: { hardwareType: true },
  });
  if (!vehicle) {
    return { verified: false, code: 'VEHICLE_NOT_FOUND' };
  }
  if (vehicle.hardwareType !== HardwareType.LTE_R1) {
    return { verified: false, code: 'RUPTELA_R1_HARDWARE_NOT_ESTABLISHED' };
  }

  const latestState = await prisma.vehicleLatestState.findUnique({
    where: { vehicleId: ctx.vehicleId },
    select: { providerBindingId: true },
  });
  if (
    latestState?.providerBindingId &&
    latestState.providerBindingId !== ctx.providerSourceLinkId
  ) {
    return { verified: false, code: 'VLS_PROVIDER_BINDING_MISMATCH' };
  }

  return { verified: true, code: 'VERIFIED' };
}

function buildFailedIntegrity(
  code: string,
  partial?: Partial<VsiLvStandbyTransmissionEvidenceLoadIntegrity>,
): VsiLvStandbyTransmissionEvidenceLoadIntegrity {
  return {
    sourceLinkAttribution: 'FAILED',
    sourceLinkAttributionCode: code,
    lvMeasurementWindowComplete: false,
    tripHistoryWindowComplete: false,
    activeOrIncompleteTripBlocksClassification: true,
    ...partial,
  };
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

  const sourceLink = await verifyLvStandbySourceLinkAttribution(prisma, ctx);
  if (!sourceLink.verified) {
    return {
      contractVersion: 'vsi-lv-standby-transmission-evidence-v1',
      points: [],
      tripWindows: [],
      linkActivatedAtMs: linkActivatedMs,
      linkDeactivatedAtMs: ctx.linkDeactivatedAt?.getTime() ?? null,
      evidenceWindowDays: VSI_LV_STANDBY_EVIDENCE_WINDOW_DAYS,
      windowStartMs,
      windowEndMs: decisionAtMs,
      provenance: ['POSTGRES_BATTERY_MEASUREMENTS', 'VSI_LV_STANDBY_30D_WINDOW'],
      loadIntegrity: buildFailedIntegrity(sourceLink.code),
    };
  }

  const lvWhere = buildLvStandbyTransmissionEvidenceWhere(ctx.vehicleId, windowStart, decisionAt);
  const lvRowCount = await prisma.batteryMeasurement.count({ where: lvWhere });
  const lvMeasurementWindowComplete = lvRowCount <= VSI_LV_STANDBY_MAX_ROWS;

  const rows = await prisma.batteryMeasurement.findMany({
    where: lvWhere,
    orderBy: [{ providerTimestamp: 'desc' }],
    take: VSI_LV_STANDBY_MAX_ROWS,
    select: {
      observedAt: true,
      providerTimestamp: true,
      provenance: true,
    },
  });
  rows.reverse();

  const tripWhere = buildLvStandbyCompletedTripWhere(ctx.vehicleId, windowStart, decisionAt);
  const completedTripCount = await prisma.vehicleTrip.count({ where: tripWhere });
  const tripHistoryWindowComplete = completedTripCount <= VSI_LV_STANDBY_MAX_COMPLETED_TRIPS;

  const trips = await prisma.vehicleTrip.findMany({
    where: tripWhere,
    orderBy: { startTime: 'desc' },
    take: VSI_LV_STANDBY_MAX_COMPLETED_TRIPS,
    select: { id: true, startTime: true, endTime: true },
  });
  trips.reverse();

  const activeOrIncompleteTrip = await prisma.vehicleTrip.findFirst({
    where: {
      vehicleId: ctx.vehicleId,
      startTime: { lte: decisionAt },
      OR: [{ tripStatus: TripStatus.ONGOING }, { endTime: null }],
    },
    select: { id: true },
  });
  const activeOrIncompleteTripBlocksClassification = activeOrIncompleteTrip != null;

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
    const provenanceLinkId = readProviderSourceLinkId(row.provenance);
    if (provenanceLinkId != null && provenanceLinkId !== ctx.providerSourceLinkId) {
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

  const loadIntegrity: VsiLvStandbyTransmissionEvidenceLoadIntegrity = {
    sourceLinkAttribution: 'VERIFIED',
    sourceLinkAttributionCode: sourceLink.code,
    lvMeasurementWindowComplete,
    tripHistoryWindowComplete,
    activeOrIncompleteTripBlocksClassification,
  };

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
    loadIntegrity,
  };
}
