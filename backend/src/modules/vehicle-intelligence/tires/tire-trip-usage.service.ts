import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, TireEventType, TripStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildSetupPeriodsFromSetups,
  computeTripUsageAggregateDelta,
  isTripCanonicallyFinalForTireUsage,
  ledgerRowToAggregateDelta,
  resolveSetupAttributionForTrip,
  type TireTripUsageAttributionStatus,
  type TripUsageAggregateDelta,
} from './tire-trip-usage-attribution';
import {
  deriveTripUsageRoadKm,
  TIRE_TRIP_USAGE_LEDGER_SOURCE_VERSION,
  type TripUsageDrivingImpactSummary,
} from './tire-trip-usage-ledger';
import {
  TireTripUsageLedgerTenantMismatchError,
  upsertTireTripUsageLedgerEntry,
  type TireTripUsageTenantContext,
} from './tire-trip-usage-ledger.repository';

export interface TireTripUsageProcessResult {
  tripId: string;
  vehicleId: string;
  attributionStatus: TireTripUsageAttributionStatus;
  ledgerAction?: 'CREATED' | 'UPDATED' | 'UNCHANGED';
  tireSetupId?: string;
  sourceFingerprint?: string;
  reason?: string;
  requiresReviewSetupIds?: string[];
}

export interface TireTripUsageMetricHook {
  recordTripUsageProcessed(result: TireTripUsageProcessResult): void;
}

@Injectable()
export class TireTripUsageService {
  private readonly logger = new Logger(TireTripUsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: TireTripUsageMetricHook,
  ) {}

  /**
   * Canonical entry point — call when post-trip analysis reaches terminal state,
   * or from legacy enrich endpoints (idempotent no-op until final).
   */
  async processCanonicalTripFinalization(
    tripId: string,
    opts?: { trigger?: string },
  ): Promise<TireTripUsageProcessResult> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      include: {
        vehicle: { select: { id: true, organizationId: true } },
      },
    });

    if (!trip) {
      throw new Error(`Trip ${tripId} not found.`);
    }

    if (trip.tripStatus !== TripStatus.COMPLETED || !trip.endTime) {
      return this.persistSkippedStatus(trip.id, trip.vehicleId, 'SKIPPED_TRIP_NOT_COMPLETED', {
        reason: 'trip_not_completed',
        trigger: opts?.trigger,
      });
    }

    if (!isTripCanonicallyFinalForTireUsage(trip)) {
      return this.persistSkippedStatus(trip.id, trip.vehicleId, 'SKIPPED_NOT_FINAL', {
        reason: 'trip_analysis_not_terminal',
        tripAnalysisStatus: trip.tripAnalysisStatus,
        trigger: opts?.trigger,
      });
    }

    const organizationId = trip.vehicle.organizationId;
    if (!organizationId) {
      return this.persistSkippedStatus(trip.id, trip.vehicleId, 'SKIPPED_ORG_MISMATCH', {
        reason: 'vehicle_missing_organization',
      });
    }

    const distanceKm = trip.distanceKm ?? 0;
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      return this.persistSkippedStatus(trip.id, trip.vehicleId, 'SKIPPED_NO_DISTANCE', {
        reason: 'missing_or_zero_distance',
      });
    }

    const mountPeriods = await this.prisma.vehicleTireSetupMountPeriod.findMany({
      where: { tireSetup: { vehicleId: trip.vehicleId } },
      select: {
        tireSetupId: true,
        installedAt: true,
        removedAt: true,
      },
      orderBy: { installedAt: 'asc' },
    });

    let periods = mountPeriods.map((p) => ({
      tireSetupId: p.tireSetupId,
      installedAt: p.installedAt,
      removedAt: p.removedAt,
    }));

    if (periods.length === 0) {
      const setups = await this.prisma.vehicleTireSetup.findMany({
        where: { vehicleId: trip.vehicleId },
        select: { id: true, installedAt: true, removedAt: true },
        orderBy: { installedAt: 'asc' },
      });
      periods = buildSetupPeriodsFromSetups(setups);
    }

    const attribution = resolveSetupAttributionForTrip({
      trip: { tripStartedAt: trip.startTime, tripEndedAt: trip.endTime },
      periods,
    });

    if (attribution.status === 'NO_SETUP') {
      return this.persistSkippedStatus(trip.id, trip.vehicleId, 'SKIPPED_NO_SETUP', {
        reason: 'no_historical_setup_for_trip_interval',
      });
    }

    if (attribution.status === 'REQUIRES_REVIEW') {
      return this.persistSkippedStatus(trip.id, trip.vehicleId, 'REQUIRES_REVIEW', {
        reason: attribution.reason,
        requiresReviewSetupIds: attribution.tireSetupIds,
      });
    }

    const roadKm = deriveTripUsageRoadKm({
      distanceKm,
      citySharePercent: trip.citySharePercent,
      highwaySharePercent: trip.highwaySharePercent,
      countrySharePercent: trip.countrySharePercent,
    });

    const drivingImpact = await this.prisma.tripDrivingImpact.findUnique({
      where: { tripId: trip.id },
    });

    const drivingImpactSummary: TripUsageDrivingImpactSummary = {
      tripAnalysisStatus: trip.tripAnalysisStatus,
      drivingImpactStatus: trip.drivingImpactStatus,
      drivingStressScore: drivingImpact?.drivingStressScore ?? null,
      longitudinalStressScore: drivingImpact?.longitudinalStressScore ?? null,
      brakingStressScore: drivingImpact?.brakingStressScore ?? null,
      hardAccelPer100Km: drivingImpact?.hardAccelPer100Km ?? null,
      hardBrakePer100Km: drivingImpact?.hardBrakePer100Km ?? null,
      trigger: opts?.trigger ?? 'canonical_finalization',
    };

    const setup = await this.prisma.vehicleTireSetup.findUnique({
      where: { id: attribution.tireSetupId },
      select: { id: true, vehicleId: true, organizationId: true },
    });
    if (!setup) {
      return this.persistSkippedStatus(trip.id, trip.vehicleId, 'SKIPPED_NO_SETUP', {
        reason: 'resolved_setup_not_found',
      });
    }

    const tenant: TireTripUsageTenantContext = {
      organizationId,
      vehicleId: trip.vehicleId,
      vehicleOrganizationId: organizationId,
      tireSetupId: setup.id,
      setupVehicleId: setup.vehicleId,
      setupOrganizationId: setup.organizationId,
      tripId: trip.id,
      tripVehicleId: trip.vehicleId,
    };

    const ledgerInput = {
      organizationId,
      vehicleId: trip.vehicleId,
      tripId: trip.id,
      tireSetupId: setup.id,
      tripStartedAt: trip.startTime.toISOString(),
      tripEndedAt: trip.endTime.toISOString(),
      distanceKm,
      cityKm: roadKm.cityKm,
      ruralKm: roadKm.ruralKm,
      highwayKm: roadKm.highwayKm,
      harshAccelerationCount: trip.harshAccelCount ?? 0,
      harshBrakingCount: trip.harshBrakeCount ?? 0,
      harshCorneringCount: trip.harshCornerCount ?? 0,
      drivingImpactSummary,
      sourceVersion: TIRE_TRIP_USAGE_LEDGER_SOURCE_VERSION,
    };

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const existingLedger = await tx.tireTripUsageLedger.findUnique({
          where: {
            tripId_tireSetupId: { tripId: trip.id, tireSetupId: setup.id },
          },
        });

        const ledgerResult = await upsertTireTripUsageLedgerEntry(tx, ledgerInput, tenant);

        if (ledgerResult.action !== 'UNCHANGED') {
          const previousDelta = existingLedger
            ? ledgerRowToAggregateDelta(existingLedger)
            : null;
          const nextDelta = ledgerRowToAggregateDelta(ledgerResult.entry);
          const aggregateDelta = computeTripUsageAggregateDelta(previousDelta, nextDelta);

          if (this.hasNonZeroAggregateDelta(aggregateDelta)) {
            await tx.vehicleTireSetup.update({
              where: { id: setup.id },
              data: {
                totalKmOnSet: { increment: aggregateDelta.distanceKm },
                cityKm: { increment: aggregateDelta.cityKm },
                highwayKm: { increment: aggregateDelta.highwayKm },
                ruralKm: { increment: aggregateDelta.ruralKm },
                harshAccelEvents: { increment: aggregateDelta.harshAccelerationCount },
                harshBrakeEvents: { increment: aggregateDelta.harshBrakingCount },
                harshCornerEvents: { increment: aggregateDelta.harshCorneringCount },
              },
            });
          }

          await tx.tireEvent.create({
            data: {
              organizationId,
              vehicleId: trip.vehicleId,
              tireSetId: setup.id,
              type: TireEventType.TRIP_USAGE_ATTRIBUTED,
              payload: {
                command: 'attributeTripUsage',
                tripId: trip.id,
                ledgerAction: ledgerResult.action,
                sourceFingerprint: ledgerResult.sourceFingerprint,
                distanceKm,
                cityKm: roadKm.cityKm,
                ruralKm: roadKm.ruralKm,
                highwayKm: roadKm.highwayKm,
                harshAccelerationCount: trip.harshAccelCount ?? 0,
                harshBrakingCount: trip.harshBrakeCount ?? 0,
                harshCorneringCount: trip.harshCornerCount ?? 0,
                aggregateDelta: { ...aggregateDelta },
                trigger: opts?.trigger ?? 'canonical_finalization',
              } as Prisma.InputJsonValue,
              createdBy: 'system:tire-trip-usage',
            },
          });
        }

        const attributionStatus: TireTripUsageAttributionStatus =
          ledgerResult.action === 'UNCHANGED' ? 'UNCHANGED' : 'APPLIED';

        await tx.vehicleTrip.update({
          where: { id: trip.id },
          data: {
            tireUsageAttributionStatus: attributionStatus,
            tireUsageProcessedAt: new Date(),
          },
        });

        return {
          tripId: trip.id,
          vehicleId: trip.vehicleId,
          attributionStatus,
          ledgerAction: ledgerResult.action,
          tireSetupId: setup.id,
          sourceFingerprint: ledgerResult.sourceFingerprint,
        } satisfies TireTripUsageProcessResult;
      });

      this.metrics?.recordTripUsageProcessed(result);
      this.logger.log(
        JSON.stringify({
          event: 'tire_trip_usage_processed',
          tripId: result.tripId,
          vehicleId: result.vehicleId,
          status: result.attributionStatus,
          ledgerAction: result.ledgerAction,
          setupId: result.tireSetupId,
          trigger: opts?.trigger ?? 'canonical_finalization',
        }),
      );
      return result;
    } catch (err) {
      if (err instanceof TireTripUsageLedgerTenantMismatchError) {
        return this.persistSkippedStatus(trip.id, trip.vehicleId, 'SKIPPED_ORG_MISMATCH', {
          reason: err.message,
        });
      }
      throw err;
    }
  }

  private hasNonZeroAggregateDelta(delta: TripUsageAggregateDelta): boolean {
    return (
      delta.distanceKm !== 0 ||
      delta.cityKm !== 0 ||
      delta.ruralKm !== 0 ||
      delta.highwayKm !== 0 ||
      delta.harshAccelerationCount !== 0 ||
      delta.harshBrakingCount !== 0 ||
      delta.harshCorneringCount !== 0
    );
  }

  private async persistSkippedStatus(
    tripId: string,
    vehicleId: string,
    attributionStatus: TireTripUsageAttributionStatus,
    audit: Record<string, unknown>,
  ): Promise<TireTripUsageProcessResult> {
    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        tireUsageAttributionStatus: attributionStatus,
        tireUsageProcessedAt: new Date(),
      },
    });

    const result: TireTripUsageProcessResult = {
      tripId,
      vehicleId,
      attributionStatus,
      reason: typeof audit.reason === 'string' ? audit.reason : undefined,
      requiresReviewSetupIds: Array.isArray(audit.requiresReviewSetupIds)
        ? (audit.requiresReviewSetupIds as string[])
        : undefined,
    };

    this.metrics?.recordTripUsageProcessed(result);
    this.logger.debug(
      JSON.stringify({
        event: 'tire_trip_usage_skipped',
        ...result,
        audit,
      }),
    );
    return result;
  }
}
