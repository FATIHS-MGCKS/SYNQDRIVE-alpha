import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../../shared/database/prisma.service';
import type { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';

export type VsiPostTripRpmCadenceSkipReason =
  | 'HF_EVIDENCE_NOT_PROVEN'
  | 'ORGANIZATION_MISSING'
  | 'SOURCE_LINK_MISSING'
  | 'VSI_MATERIALIZATION_UNAVAILABLE';

export type VsiPostTripRpmCadenceDecision =
  | { outcome: 'SKIP'; skipReason: VsiPostTripRpmCadenceSkipReason }
  | { outcome: 'TRIGGER' }
  | { outcome: 'MATERIALIZATION_FAILED'; message: string };

/**
 * Post-trip RPM cadence runs only when ClickHouse has HF **points** for the trip
 * (new insert this run or pre-existing trip rows). Events/windows alone do not qualify.
 */
export async function resolvePostTripRpmCadenceHfEvidenceReady(input: {
  vehicleId: string;
  tripId: string;
  pointsInserted: number;
  hasTripHfPoints?: (vehicleId: string, tripId: string) => Promise<boolean>;
}): Promise<boolean> {
  if (input.pointsInserted > 0) {
    return true;
  }
  if (!input.hasTripHfPoints) {
    return false;
  }
  try {
    return await input.hasTripHfPoints(input.vehicleId, input.tripId);
  } catch {
    return false;
  }
}

export function logVsiPostTripRpmCadenceDecision(
  logger: Logger,
  input: {
    tripId: string;
    vehicleId: string;
    decision: VsiPostTripRpmCadenceDecision;
  },
): void {
  const payload: Record<string, unknown> = {
    event: 'VSI_POST_TRIP_RPM_CADENCE',
    tripId: input.tripId,
    vehicleId: input.vehicleId,
    outcome: input.decision.outcome,
  };
  if (input.decision.outcome === 'SKIP') {
    payload.skipReason = input.decision.skipReason;
  }
  if (input.decision.outcome === 'MATERIALIZATION_FAILED') {
    payload.error = input.decision.message;
  }
  if (input.decision.outcome === 'MATERIALIZATION_FAILED') {
    logger.warn(JSON.stringify(payload));
    return;
  }
  logger.log(JSON.stringify(payload));
}

/**
 * Best-effort post-trip RPM cadence refresh (idempotent, non-blocking).
 * Only runs when HF points exist for the trip in ClickHouse (readiness gate).
 */
export async function refreshVsiRpmCadenceAfterTrip(input: {
  prisma: PrismaService;
  materialization: VsiSignalProfileMaterializationService;
  logger: Logger;
  organizationId: string | null | undefined;
  vehicleId: string;
  tripId: string;
  providerSourceLinkId: string | null | undefined;
  hfTripPointsReady: boolean;
}): Promise<void> {
  const base = { tripId: input.tripId, vehicleId: input.vehicleId };

  if (!input.hfTripPointsReady) {
    logVsiPostTripRpmCadenceDecision(input.logger, {
      ...base,
      decision: { outcome: 'SKIP', skipReason: 'HF_EVIDENCE_NOT_PROVEN' },
    });
    return;
  }
  if (!input.organizationId) {
    logVsiPostTripRpmCadenceDecision(input.logger, {
      ...base,
      decision: { outcome: 'SKIP', skipReason: 'ORGANIZATION_MISSING' },
    });
    return;
  }
  if (!input.providerSourceLinkId) {
    logVsiPostTripRpmCadenceDecision(input.logger, {
      ...base,
      decision: { outcome: 'SKIP', skipReason: 'SOURCE_LINK_MISSING' },
    });
    return;
  }

  logVsiPostTripRpmCadenceDecision(input.logger, {
    ...base,
    decision: { outcome: 'TRIGGER' },
  });

  try {
    await input.materialization.materializeFromPersistedEvidence({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
      requireBindingMatch: true,
      lifecycleMode: 'TRIP_FINALIZED_RPM_CADENCE',
      rpmCadenceTripId: input.tripId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logVsiPostTripRpmCadenceDecision(input.logger, {
      ...base,
      decision: { outcome: 'MATERIALIZATION_FAILED', message },
    });
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
