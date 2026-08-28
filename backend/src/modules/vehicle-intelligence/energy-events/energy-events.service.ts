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
  collectReplaceableSubSegmentIds,
  isSegmentPersistable,
  type CoalescedEnergySegment,
} from './energy-events.pipeline';
import { EnergyEventsMetricsService } from './energy-events-metrics.service';

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
        events: [],
      };
    }

    const fetchResult = await this.dimoSegments.fetchEnergyEventSegments(
      tokenId,
      options.from,
      options.to,
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
      const { row, wasCreated } = await this.upsertSegment(vehicleId, group);
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
    segment: CoalescedEnergySegment,
  ): Promise<{ row: VehicleEnergyEvent; wasCreated: boolean }> {
    const payload = buildUpsertPayload(vehicleId, segment);
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
    };

    if (existing) {
      const row = await this.prisma.vehicleEnergyEvent.update({
        where: { id: existing.id },
        data,
      });
      return { row, wasCreated: false };
    }
    const row = await this.prisma.vehicleEnergyEvent.create({
      data: { ...data, dimoSegmentId: payload.dimoSegmentId },
    });
    return { row, wasCreated: true };
  }

  private async pruneStaleSubSegments(
    vehicleId: string,
    from: Date,
    to: Date,
    mechanismOutcomes: EnergyMechanismFetchOutcome[],
    persistedCoalescedGroups: CoalescedEnergySegment[],
  ): Promise<number> {
    if (mechanismOutcomes.some((outcome) => outcome.status === 'FAILED')) {
      this.logger.debug(
        `Skipping energy-event prune vehicle=${vehicleId} window=[${from.toISOString()}, ${to.toISOString()}] reason=mechanism_fetch_failed`,
      );
      return 0;
    }

    const replacedSubSegmentIds = collectReplaceableSubSegmentIds(
      persistedCoalescedGroups,
      mechanismOutcomes,
    );

    if (replacedSubSegmentIds.size === 0) {
      return 0;
    }

    const candidates = await this.prisma.vehicleEnergyEvent.findMany({
      where: {
        vehicleId,
        startTime: { gte: from, lte: to },
        dimoSegmentId: { in: [...replacedSubSegmentIds] },
      },
      select: { id: true, dimoSegmentId: true },
    });

    if (candidates.length === 0) return 0;

    const result = await this.prisma.vehicleEnergyEvent.deleteMany({
      where: { id: { in: candidates.map((row) => row.id) } },
    });
    if (result.count > 0) {
      this.logger.debug(
        `Pruned ${result.count} replaced energy-event sub-segments for vehicle=${vehicleId} window=[${from.toISOString()}, ${to.toISOString()}] replacedIds=${[...replacedSubSegmentIds].join(',')}`,
      );
    }
    return result.count;
  }
}
