import { TripStatus } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { Exp021PhysicalDriveIntervalAuthority } from '../reference-capture-exp-021-motion.lib';
import type { ReferenceCaptureSettlementShadowService } from '../reference-capture-settlement-shadow.service';
import { readPhysicalDriveIntervalAuthority } from '../exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-enroll.lib';
import { resolveCohortMemberForTripIdentity } from './reference-capture-exp021-canary-live-window-cohort.lib';
import type { Exp021CanaryCohortAuthority } from './reference-capture-exp021-canary-live-window-cohort.lib';

/** Authoritative PDI source for trip-bound KS MX 2024 canary live-window finalize. */
export const EXP021_CANARY_VEHICLE_TRIP_PDI_SOURCE: Exp021PhysicalDriveIntervalAuthority['source'] =
  'CANARY_VEHICLE_TRIP_CONFIRMED';

export type CanaryLiveWindowPdiPublishContext = {
  vehicleTripId: string;
  vehicleId: string;
  tokenId: number;
  organizationId: string;
  sessionId: string;
  activationNotBeforeMs: number;
  cohort: Exp021CanaryCohortAuthority;
};

export type CanaryLiveWindowPdiResolvedAuthority = {
  physicalStartAt: Date;
  physicalEndAt: Date;
  vehicleTripId: string;
};

export type CanaryLiveWindowPdiPublishResult =
  | { outcome: 'published'; source: Exp021PhysicalDriveIntervalAuthority['source'] }
  | { outcome: 'already_present'; source: Exp021PhysicalDriveIntervalAuthority['source'] }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'conflict'; reason: string; existing: Exp021PhysicalDriveIntervalAuthority };

export function assertCanaryLiveWindowPdiIdentity(
  ctx: CanaryLiveWindowPdiPublishContext,
): void {
  const member = resolveCohortMemberForTripIdentity({
    organizationId: ctx.organizationId,
    vehicleId: ctx.vehicleId,
    tokenId: ctx.tokenId,
    cohort: ctx.cohort,
  });
  if (!member) {
    throw new Error(`canary_pdi_cohort_mismatch:${ctx.vehicleId}:${ctx.tokenId}`);
  }
}

export async function resolveCanaryLiveWindowVehicleTripPdiAuthority(
  prisma: PrismaService,
  vehicleTripId: string,
  expectedVehicleId: string,
): Promise<CanaryLiveWindowPdiResolvedAuthority | null> {
  const trip = await prisma.vehicleTrip.findFirst({
    where: { id: vehicleTripId, vehicleId: expectedVehicleId },
    select: { id: true, tripStatus: true, startTime: true, endTime: true },
  });
  if (!trip) return null;
  if (trip.tripStatus !== TripStatus.COMPLETED) return null;
  if (!trip.endTime) return null;
  if (trip.endTime.getTime() < trip.startTime.getTime()) return null;
  return {
    physicalStartAt: trip.startTime,
    physicalEndAt: trip.endTime,
    vehicleTripId: trip.id,
  };
}

export function isTripEligibleForCanaryPdiPublication(args: {
  tripStartTimeMs: number;
  activationNotBeforeMs: number;
  currentActivationNotBeforeMs: number;
}): boolean {
  return (
    args.tripStartTimeMs >= args.activationNotBeforeMs &&
    args.tripStartTimeMs >= args.currentActivationNotBeforeMs
  );
}

export function comparePdiAuthorityInterval(
  existing: Exp021PhysicalDriveIntervalAuthority,
  physicalStartAt: Date,
  physicalEndAt: Date,
): 'identical' | 'conflict' {
  const startOk = existing.physicalStartAt === physicalStartAt.toISOString();
  const endOk = existing.physicalEndAt === physicalEndAt.toISOString();
  return startOk && endOk ? 'identical' : 'conflict';
}

export async function publishCanaryLiveWindowPhysicalDriveInterval(args: {
  prisma: PrismaService;
  settlementShadow: ReferenceCaptureSettlementShadowService;
  ctx: CanaryLiveWindowPdiPublishContext;
  currentActivationNotBeforeMs: number;
}): Promise<CanaryLiveWindowPdiPublishResult> {
  const { ctx } = args;
  try {
    assertCanaryLiveWindowPdiIdentity(ctx);
  } catch (error) {
    return {
      outcome: 'skipped',
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const resolved = await resolveCanaryLiveWindowVehicleTripPdiAuthority(
    args.prisma,
    ctx.vehicleTripId,
    ctx.vehicleId,
  );
  if (!resolved) {
    return { outcome: 'skipped', reason: 'trip_not_completed_or_missing_timestamps' };
  }

  if (
    !isTripEligibleForCanaryPdiPublication({
      tripStartTimeMs: resolved.physicalStartAt.getTime(),
      activationNotBeforeMs: ctx.activationNotBeforeMs,
      currentActivationNotBeforeMs: args.currentActivationNotBeforeMs,
    })
  ) {
    return { outcome: 'skipped', reason: 'trip_before_activation_not_before' };
  }

  const experiment = await args.prisma.referenceCaptureSettlementShadowExperiment.findFirst({
    where: { sessionId: ctx.sessionId },
    select: { id: true, metadataJson: true },
  });
  if (!experiment) {
    return { outcome: 'skipped', reason: 'settlement_experiment_missing' };
  }

  const existing = readPhysicalDriveIntervalAuthority(experiment.metadataJson);
  if (existing) {
    const cmp = comparePdiAuthorityInterval(
      existing,
      resolved.physicalStartAt,
      resolved.physicalEndAt,
    );
    if (cmp === 'identical') {
      return { outcome: 'already_present', source: existing.source };
    }
    return { outcome: 'conflict', reason: 'physical_drive_interval_authority_mismatch', existing };
  }

  const persisted = await args.settlementShadow.persistPhysicalDriveIntervalAuthority({
    sessionId: ctx.sessionId,
    physicalStartAt: resolved.physicalStartAt,
    physicalEndAt: resolved.physicalEndAt,
    source: EXP021_CANARY_VEHICLE_TRIP_PDI_SOURCE,
  });
  if (!persisted) {
    return { outcome: 'skipped', reason: 'persist_returned_false' };
  }

  const after = await args.prisma.referenceCaptureSettlementShadowExperiment.findFirst({
    where: { sessionId: ctx.sessionId },
    select: { metadataJson: true },
  });
  const written = readPhysicalDriveIntervalAuthority(after?.metadataJson);
  if (
    !written ||
    written.physicalStartAt !== resolved.physicalStartAt.toISOString() ||
    written.physicalEndAt !== resolved.physicalEndAt.toISOString()
  ) {
    return { outcome: 'skipped', reason: 'post_persist_verification_failed' };
  }

  return { outcome: 'published', source: EXP021_CANARY_VEHICLE_TRIP_PDI_SOURCE };
}
