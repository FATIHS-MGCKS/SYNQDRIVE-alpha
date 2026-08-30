import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DimoSegmentsService,
  type DimoEnergyEventSegment,
} from '@modules/dimo/dimo-segments.service';
import type { EnergyMechanismFetchOutcome } from '@modules/dimo/energy-events/energy-mechanism-fetch.types';
import { DIMO_ENERGY_DETECTOR_CONFIG_VERSION } from '@modules/dimo/energy-events/dimo-energy-detector.config';
import {
  EnergyEventKind,
  type VehicleEnergyEvent,
} from '@prisma/client';
import { toEnergyEventDto, type EnergyEventDto } from './energy-events.types';
import {
  buildUpsertPayload,
  coalesceSegments,
  isSegmentPersistable,
  pruneStaleCoalescedSubSegments,
  type CoalescedEnergySegment,
} from './energy-events.pipeline';
import { EnergyEventsMetricsService } from './energy-events-metrics.service';
import { FuelStationEnrichmentProducerService } from '../fuel-stations/enrichment/fuel-station-enrichment-producer.service';
import { deriveRefuelFuelLevelRise } from './refuel-fuel-rise';
import {
  resolveSupersededRefuelSiblingIds,
  type RefuelEventWindow,
} from './refuel-sibling-reconciliation';

export interface DetectEnergyEventsOptions {
  from: Date;
  to: Date;
}

export interface DetectEnergyEventsResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  coalescedGroups: number;
  prunedStale: number;
  reconciledRefuelSiblings: number;
  events: EnergyEventDto[];
  mechanismOutcomes?: EnergyMechanismFetchOutcome[];
}

/**
 * Canonical orchestration layer for refuel/recharge events.
 */
@Injectable()
export class EnergyEventsService {
  private readonly logger = new Logger(EnergyEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dimoSegments: DimoSegmentsService,
    @Optional() private readonly energyMetrics?: EnergyEventsMetricsService,
    @Optional()
    private readonly fuelStationEnrichmentProducer?: FuelStationEnrichmentProducerService,
  ) {}

  async listEnergyEvents(
    vehicleId: string,
    options: { from?: Date; to?: Date } = {},
  ): Promise<EnergyEventDto[]> {
    const rows = await this.prisma.vehicleEnergyEvent.findMany({
      where: {
        vehicleId,
        ...(options.from || options.to
          ? {
              startTime: {
                ...(options.from ? { gte: options.from } : {}),
                ...(options.to ? { lte: options.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { startTime: 'asc' },
    });
    return rows.map(toEnergyEventDto);
  }

  async detectEnergyEvents(
    vehicleId: string,
    options: DetectEnergyEventsOptions,
  ): Promise<DetectEnergyEventsResult> {
    const startedAt = Date.now();
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { dimoVehicle: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const tokenId = vehicle.dimoVehicle?.tokenId ?? 0;
    if (tokenId <= 0) {
      this.logger.debug(
        `Skipping energy-event detection for vehicle ${vehicleId}: no DIMO tokenId`,
      );
      this.energyMetrics?.recordDetectionRun('no_token', Date.now() - startedAt);
      return {
        fetched: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        coalescedGroups: 0,
        prunedStale: 0,
        reconciledRefuelSiblings: 0,
        events: [],
      };
    }

    const requestContext = {
      organizationId: vehicle.organizationId,
      vehicleId,
      tokenId,
    };

    const fetchResult = await this.dimoSegments.fetchEnergyEventSegments(
      tokenId,
      options.from,
      options.to,
      undefined,
      requestContext,
    );
    const mechanismOutcomes = fetchResult.outcomes;
    const segments = fetchResult.segments;

    this.energyMetrics?.recordMechanismOutcomes(mechanismOutcomes);

    for (const outcome of mechanismOutcomes) {
      if (outcome.status === 'FAILED') {
        this.logger.warn(
          `DIMO energy-event fetch failed vehicle=${vehicleId} tokenId=${tokenId} mechanism=${outcome.mechanism} window=${outcome.windowFrom}..${outcome.windowTo} httpStatus=${outcome.error?.httpStatus ?? 'n/a'} retryable=${outcome.error?.retryable ?? false} detectorConfigVersion=${DIMO_ENERGY_DETECTOR_CONFIG_VERSION} message="${outcome.error?.message ?? 'unknown'}"`,
        );
      } else {
        this.logger.debug(
          `DIMO energy-event fetch ${outcome.status} vehicle=${vehicleId} tokenId=${tokenId} mechanism=${outcome.mechanism} window=${outcome.windowFrom}..${outcome.windowTo} segments=${outcome.segments.length} detectorConfigVersion=${DIMO_ENERGY_DETECTOR_CONFIG_VERSION}`,
        );
      }
    }

    const persistableSegments = segments.filter((segment) =>
      isSegmentPersistable(segment),
    );
    const skipped = segments.length - persistableSegments.length;
    const coalesced = coalesceSegments(persistableSegments);

    let created = 0;
    let updated = 0;
    const persistedRows: VehicleEnergyEvent[] = [];

    for (const group of coalesced) {
      const { row, wasCreated } = await this.upsertSegment(
        vehicleId,
        tokenId,
        group,
        requestContext,
      );
      persistedRows.push(row);
      if (wasCreated) created++;
      else updated++;
    }

    const prunedStale = await this.pruneStaleSubSegments(
      vehicleId,
      options.from,
      options.to,
      mechanismOutcomes,
      coalesced,
    );

    const reconciledRefuelSiblings = await this.reconcileSupersededRefuelSiblings(
      vehicleId,
      persistedRows.filter((row) => row.kind === EnergyEventKind.REFUEL),
      options.from,
      options.to,
    );

    const persistableByMechanism: Record<string, number> = {};
    for (const segment of persistableSegments) {
      persistableByMechanism[segment.mechanism] =
        (persistableByMechanism[segment.mechanism] ?? 0) + 1;
    }

    const hadFetchFailure = mechanismOutcomes.some((o) => o.status === 'FAILED');
    this.energyMetrics?.recordPersistStats({
      created,
      updated,
      skipped,
      pruned: prunedStale,
      persistableByMechanism,
      hadFetchFailure,
      totalPersisted: created + updated,
    });
    this.energyMetrics?.recordDetectionRun(
      hadFetchFailure ? 'partial_failure' : 'success',
      Date.now() - startedAt,
    );

    return {
      fetched: segments.length,
      created,
      updated,
      skipped,
      coalescedGroups: coalesced.length,
      prunedStale,
      reconciledRefuelSiblings,
      events: persistedRows.map(toEnergyEventDto),
      mechanismOutcomes,
    };
  }

  async buildTripsTimeline(
    vehicleId: string,
    hydratedTrips: Array<Record<string, unknown> & { startTime: Date | string }>,
    options: { from?: Date; to?: Date } = {},
  ): Promise<
    Array<
      | ({ itemType: 'trip'; startTime: string } & Record<string, unknown>)
      | ({ itemType: 'energy-event'; startTime: string } & EnergyEventDto)
    >
  > {
    const events = await this.listEnergyEvents(vehicleId, options);

    const tripItems = hydratedTrips.map((trip) => {
      const startTime =
        typeof trip.startTime === 'string'
          ? trip.startTime
          : trip.startTime instanceof Date
            ? trip.startTime.toISOString()
            : new Date().toISOString();
      return { ...trip, itemType: 'trip' as const, startTime };
    });

    const eventItems = events.map((event) => ({
      ...event,
      itemType: 'energy-event' as const,
    }));

    return [...tripItems, ...eventItems].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
  }

  private async upsertSegment(
    vehicleId: string,
    tokenId: number,
    segment: CoalescedEnergySegment,
    requestContext: {
      organizationId: string;
      vehicleId: string;
      tokenId: number;
    },
  ): Promise<{ row: VehicleEnergyEvent; wasCreated: boolean }> {
    const refuelObservation =
      segment.mechanism === 'refuel'
        ? await this.deriveRefuelObservation(segment, tokenId, requestContext)
        : null;

    const payload = buildUpsertPayload(
      vehicleId,
      segment,
      refuelObservation ?? undefined,
    );
    const existing = await this.prisma.vehicleEnergyEvent.findUnique({
      where: { dimoSegmentId: payload.dimoSegmentId },
    });

    const data = {
      vehicleId: payload.vehicleId,
      kind: payload.kind,
      detectionMechanism: payload.detectionMechanism,
      startTime: payload.startTime,
      endTime: payload.endTime,
      durationSeconds: payload.durationSeconds,
      startLatitude: payload.startLatitude,
      startLongitude: payload.startLongitude,
      endLatitude: payload.endLatitude,
      endLongitude: payload.endLongitude,
      fuelDeltaLiters: payload.fuelDeltaLiters,
      fuelDeltaPercent: payload.fuelDeltaPercent,
      socDeltaPercent: payload.socDeltaPercent,
      energyDeltaKwh: payload.energyDeltaKwh,
      odometerStartKm: payload.odometerStartKm,
      odometerEndKm: payload.odometerEndKm,
      confidence: payload.confidence,
      rawDetectionMeta: payload.rawDetectionMeta as object,
      fuelLevelRiseStart: payload.fuelLevelRiseStart,
      fuelLevelRiseEnd: payload.fuelLevelRiseEnd,
      fuelLevelRiseDurationSeconds: payload.fuelLevelRiseDurationSeconds,
    };

    let row: VehicleEnergyEvent;
    let wasCreated: boolean;
    if (existing) {
      row = await this.prisma.vehicleEnergyEvent.update({
        where: { id: existing.id },
        data,
      });
      wasCreated = false;
    } else {
      row = await this.prisma.vehicleEnergyEvent.create({
        data: { ...data, dimoSegmentId: payload.dimoSegmentId },
      });
      wasCreated = true;
    }

    if (segment.mechanism === 'refuel') {
      void this.fuelStationEnrichmentProducer
        ?.enqueueAfterPersistFromEvent(row)
        .catch((error: unknown) => {
          this.logger.warn(
            `Fuel station enrichment enqueue failed for energyEventId=${row.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });

      this.energyMetrics?.recordRefuelDetected();
      this.energyMetrics?.recordRefuelFuelRiseObservation({
        vehicleId,
        eventId: row.id,
        source: 'dimo',
        detectionWindowSeconds: payload.durationSeconds,
        fuelLevelRiseDurationSeconds: payload.fuelLevelRiseDurationSeconds,
        fuelDeltaPercent: payload.fuelDeltaPercent,
        fuelDeltaLiters: payload.fuelDeltaLiters,
        sampleCount: refuelObservation?.sampleCount ?? 0,
        derivationReason: refuelObservation?.derivationReason ?? 'insufficient_samples',
      });
    }

    return { row, wasCreated };
  }

  private async deriveRefuelObservation(
    segment: CoalescedEnergySegment,
    tokenId: number,
    requestContext: {
      organizationId: string;
      vehicleId: string;
      tokenId: number;
    },
  ) {
    const windowStart = new Date(segment.startTime);
    const windowEnd = new Date(segment.endTime as string);
    const samples = await this.dimoSegments.fetchFuelLevelSamples(
      tokenId,
      windowStart,
      windowEnd,
      requestContext,
    );
    return deriveRefuelFuelLevelRise(samples, windowStart, windowEnd);
  }

  private async reconcileSupersededRefuelSiblings(
    vehicleId: string,
    canonicalRows: VehicleEnergyEvent[],
    windowFrom: Date,
    windowTo: Date,
  ): Promise<number> {
    if (canonicalRows.length === 0) return 0;

    const canonicalWindows: RefuelEventWindow[] = canonicalRows.map((row) => ({
      id: row.id,
      dimoSegmentId: row.dimoSegmentId,
      startTime: row.startTime,
      endTime: row.endTime,
      durationSeconds: row.durationSeconds,
      fuelDeltaPercent: row.fuelDeltaPercent,
      fuelDeltaLiters: row.fuelDeltaLiters,
    }));

    const searchFrom = new Date(
      Math.min(...canonicalRows.map((r) => r.startTime.getTime())) - 2 * 60 * 60_000,
    );
    const searchTo = new Date(
      Math.max(...canonicalRows.map((r) => r.endTime.getTime())) + 60 * 60_000,
    );

    const candidates = await this.prisma.vehicleEnergyEvent.findMany({
      where: {
        vehicleId,
        kind: EnergyEventKind.REFUEL,
        startTime: { gte: searchFrom, lte: searchTo },
        id: { notIn: canonicalRows.map((row) => row.id) },
      },
    });

    const siblingIds = resolveSupersededRefuelSiblingIds(
      canonicalWindows,
      candidates.map((row) => ({
        id: row.id,
        dimoSegmentId: row.dimoSegmentId,
        startTime: row.startTime,
        endTime: row.endTime,
        durationSeconds: row.durationSeconds,
        fuelDeltaPercent: row.fuelDeltaPercent,
        fuelDeltaLiters: row.fuelDeltaLiters,
      })),
    );

    if (siblingIds.length === 0) return 0;

    const result = await this.prisma.vehicleEnergyEvent.deleteMany({
      where: { id: { in: siblingIds }, vehicleId },
    });
    if (result.count > 0) {
      this.logger.debug(
        `Reconciled ${result.count} superseded REFUEL sibling(s) for vehicle=${vehicleId} window=[${windowFrom.toISOString()}, ${windowTo.toISOString()}]`,
      );
      this.energyMetrics?.recordRefuelSiblingReconciled(result.count);
    }
    return result.count;
  }

  private async pruneStaleSubSegments(
    vehicleId: string,
    from: Date,
    to: Date,
    mechanismOutcomes: EnergyMechanismFetchOutcome[],
    persistedCoalescedGroups: CoalescedEnergySegment[],
  ): Promise<number> {
    const { prunedCount } = await pruneStaleCoalescedSubSegments({
      vehicleId,
      windowFrom: from,
      windowTo: to,
      coalesced: persistedCoalescedGroups,
      mechanismOutcomes,
      findEnergyEventByDimoSegmentId: (dimoSegmentId) =>
        this.prisma.vehicleEnergyEvent.findUnique({
          where: { dimoSegmentId },
        }),
      findStaleCandidates: (staleSubsegmentIds) =>
        this.prisma.vehicleEnergyEvent.findMany({
          where: {
            vehicleId,
            startTime: { gte: from, lte: to },
            dimoSegmentId: { in: staleSubsegmentIds },
          },
          select: { id: true, dimoSegmentId: true },
        }),
      deleteEnergyEventsByIds: async (ids) => {
        if (ids.length === 0) {
          return 0;
        }
        const result = await this.prisma.vehicleEnergyEvent.deleteMany({
          where: { id: { in: ids } },
        });
        if (result.count > 0) {
          this.logger.debug(
            `Pruned ${result.count} replaced energy-event sub-segments for vehicle=${vehicleId} window=[${from.toISOString()}, ${to.toISOString()}]`,
          );
        }
        return result.count;
      },
    });
    return prunedCount;
  }
}
