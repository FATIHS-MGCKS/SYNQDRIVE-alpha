import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, TireEventType, TripStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildSetupPeriodsFromSetups,
  isTripCanonicallyFinalForTireUsage,
  ledgerRowToAggregateDelta,
  resolveSetupAttributionForTrip,
  type TireTripUsageAttributionStatus,
} from './tire-trip-usage-attribution';
import {
  buildInvalidatedTripUsageFingerprintInput,
  deriveTripUsageRoadKm,
  TIRE_TRIP_USAGE_LEDGER_SOURCE_VERSION,
  type TripUsageDrivingImpactSummary,
} from './tire-trip-usage-ledger';
import {
  invalidateTireTripUsageLedgerEntry,
  TireTripUsageLedgerTenantMismatchError,
  upsertTireTripUsageLedgerEntry,
  type TireTripUsageTenantContext,
} from './tire-trip-usage-ledger.repository';
import {
  acquireTripUsageAdvisoryLock,
  buildInvalidationAuditPayload,
  buildRevisionAuditPayload,
  rebuildSetupUsageAggregatesFromLedger,
  type TireTripUsageMetricName,
  withTripUsageReplayRetry,
} from './tire-trip-usage-replay';
import { TireHealthObservabilityService } from './tire-health-observability.service';

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
  recordMetric?(name: TireTripUsageMetricName, labels?: Record<string, string>): void;
}

@Injectable()
export class TireTripUsageService {
  private readonly logger = new Logger(TireTripUsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly observability?: TireHealthObservabilityService,
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

    if (trip.mergeParentTripId) {
      return this.invalidateTripUsageForTrip(tripId, {
        reason: 'trip_merged',
        supersededByTripId: trip.mergeParentTripId,
        trigger: opts?.trigger,
      });
    }

    if (trip.tripStatus === TripStatus.CANCELLED) {
      const existingLedger = await this.prisma.tireTripUsageLedger.findFirst({
        where: { tripId: trip.id, invalidatedAt: null },
      });
      if (existingLedger) {
        return this.invalidateTripUsageForTrip(tripId, {
          reason: 'trip_cancelled',
          trigger: opts?.trigger,
        });
      }
      return this.persistSkippedStatus(trip.id, trip.vehicleId, 'SKIPPED_TRIP_NOT_COMPLETED', {
        reason: 'trip_cancelled',
        trigger: opts?.trigger,
      });
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
      const result = await withTripUsageReplayRetry(() =>
        this.prisma.$transaction(async (tx) => {
          await acquireTripUsageAdvisoryLock(tx, trip.id, setup.id);

          const existingLedger = await tx.tireTripUsageLedger.findUnique({
            where: {
              tripId_tireSetupId: { tripId: trip.id, tireSetupId: setup.id },
            },
          });

          const ledgerResult = await upsertTireTripUsageLedgerEntry(tx, ledgerInput, tenant);

          if (ledgerResult.action === 'UNCHANGED') {
            this.emitMetric('duplicate_prevented', {
              tripId: trip.id,
              tireSetupId: setup.id,
            });
            return {
              tripId: trip.id,
              vehicleId: trip.vehicleId,
              attributionStatus: 'UNCHANGED' as const,
              ledgerAction: 'UNCHANGED' as const,
              tireSetupId: setup.id,
              sourceFingerprint: ledgerResult.sourceFingerprint,
            };
          }

          const totals = await rebuildSetupUsageAggregatesFromLedger(tx, setup.id);
          this.emitMetric('aggregate_rebuilt', { tireSetupId: setup.id });
          this.emitMetric(
            ledgerResult.action === 'CREATED' ? 'ledger_created' : 'ledger_revised',
            { tripId: trip.id, tireSetupId: setup.id },
          );

          const nextValues = ledgerRowToAggregateDelta(ledgerResult.entry);
          const previousValues = existingLedger
            ? ledgerRowToAggregateDelta(existingLedger)
            : null;

          const eventPayload =
            ledgerResult.action === 'CREATED'
              ? {
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
                  aggregateTotals: totals,
                  trigger: opts?.trigger ?? 'canonical_finalization',
                }
              : buildRevisionAuditPayload({
                  tripId: trip.id,
                  tireSetupId: setup.id,
                  previousFingerprint: ledgerResult.previousFingerprint,
                  nextFingerprint: ledgerResult.sourceFingerprint,
                  previousValues,
                  nextValues,
                  trigger: opts?.trigger ?? 'canonical_finalization',
                });

          await tx.tireEvent.create({
            data: {
              organizationId,
              vehicleId: trip.vehicleId,
              tireSetId: setup.id,
              type:
                ledgerResult.action === 'CREATED'
                  ? TireEventType.TRIP_USAGE_ATTRIBUTED
                  : TireEventType.TRIP_USAGE_REVISED,
              payload: eventPayload as Prisma.InputJsonValue,
              createdBy: 'system:tire-trip-usage',
            },
          });

          await tx.vehicleTrip.update({
            where: { id: trip.id },
            data: {
              tireUsageAttributionStatus: 'APPLIED',
              tireUsageProcessedAt: new Date(),
            },
          });

          return {
            tripId: trip.id,
            vehicleId: trip.vehicleId,
            attributionStatus: 'APPLIED' as const,
            ledgerAction: ledgerResult.action,
            tireSetupId: setup.id,
            sourceFingerprint: ledgerResult.sourceFingerprint,
          };
        }),
      );

      this.observability?.recordTripUsageProcessed(result);
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

  /**
   * Soft-invalidates ledger usage for cancelled, merged, or otherwise voided trips.
   * Row is retained for audit; setup aggregates are rebuilt from active ledger rows.
   */
  async invalidateTripUsageForTrip(
    tripId: string,
    opts: {
      reason: string;
      supersededByTripId?: string | null;
      trigger?: string;
    },
  ): Promise<TireTripUsageProcessResult> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      include: {
        vehicle: { select: { id: true, organizationId: true } },
        tireTripUsageLedgers: {
          where: { invalidatedAt: null },
        },
      },
    });

    if (!trip) {
      throw new Error(`Trip ${tripId} not found.`);
    }

    const organizationId = trip.vehicle.organizationId;
    if (!organizationId) {
      return this.persistSkippedStatus(trip.id, trip.vehicleId, 'SKIPPED_ORG_MISMATCH', {
        reason: 'vehicle_missing_organization',
      });
    }

    const activeLedgers = trip.tireTripUsageLedgers;
    if (activeLedgers.length === 0) {
      return {
        tripId: trip.id,
        vehicleId: trip.vehicleId,
        attributionStatus: 'UNCHANGED',
        reason: 'no_active_ledger_to_invalidate',
      };
    }

    try {
      const result = await withTripUsageReplayRetry(() =>
        this.prisma.$transaction(async (tx) => {
          const affectedSetups = new Set<string>();

          for (const row of activeLedgers) {
            await acquireTripUsageAdvisoryLock(tx, trip.id, row.tireSetupId);
            affectedSetups.add(row.tireSetupId);

            const fingerprintInput = buildInvalidatedTripUsageFingerprintInput({
              tripId: trip.id,
              tireSetupId: row.tireSetupId,
              tripStartedAt: row.tripStartedAt.toISOString(),
              tripEndedAt: row.tripEndedAt?.toISOString() ?? null,
              invalidationReason: opts.reason,
            });

            const invalidated = await invalidateTireTripUsageLedgerEntry(tx, {
              tripId: trip.id,
              tireSetupId: row.tireSetupId,
              organizationId,
              reason: opts.reason,
              supersededByTripId: opts.supersededByTripId ?? null,
              fingerprintInput: {
                organizationId,
                vehicleId: trip.vehicleId,
                ...fingerprintInput,
              },
            });

            if (!invalidated) {
              continue;
            }

            await tx.tireEvent.create({
              data: {
                organizationId,
                vehicleId: trip.vehicleId,
                tireSetId: row.tireSetupId,
                type: TireEventType.TRIP_USAGE_REVISED,
                payload: buildInvalidationAuditPayload({
                  tripId: trip.id,
                  tireSetupId: row.tireSetupId,
                  previousFingerprint: invalidated.previousFingerprint,
                  reason: opts.reason,
                  supersededByTripId: opts.supersededByTripId ?? null,
                }) as Prisma.InputJsonValue,
                createdBy: 'system:tire-trip-usage',
              },
            });

            this.emitMetric('ledger_invalidated', {
              tripId: trip.id,
              tireSetupId: row.tireSetupId,
            });
          }

          for (const setupId of affectedSetups) {
            await rebuildSetupUsageAggregatesFromLedger(tx, setupId);
            this.emitMetric('aggregate_rebuilt', { tireSetupId: setupId });
          }

          await tx.vehicleTrip.update({
            where: { id: trip.id },
            data: {
              tireUsageAttributionStatus: 'INVALIDATED',
              tireUsageProcessedAt: new Date(),
            },
          });

          return {
            tripId: trip.id,
            vehicleId: trip.vehicleId,
            attributionStatus: 'INVALIDATED' as TireTripUsageAttributionStatus,
            ledgerAction: 'UPDATED' as const,
            tireSetupId: activeLedgers[0]?.tireSetupId,
            reason: opts.reason,
          };
        }),
      );

      this.observability?.recordTripUsageProcessed(result);
      this.logger.log(
        JSON.stringify({
          event: 'tire_trip_usage_invalidated',
          tripId: result.tripId,
          reason: opts.reason,
          supersededByTripId: opts.supersededByTripId ?? null,
          trigger: opts.trigger ?? 'invalidation',
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

  private emitMetric(name: TireTripUsageMetricName, labels?: Record<string, string>): void {
    this.observability?.recordMetric?.(name, labels);
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

    this.observability?.recordTripUsageProcessed(result);
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
