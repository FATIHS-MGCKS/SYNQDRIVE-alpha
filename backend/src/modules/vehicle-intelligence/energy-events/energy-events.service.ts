import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DimoSegmentsService,
  type DimoEnergyEventSegment,
} from '@modules/dimo/dimo-segments.service';
import {
  EnergyEventConfidence,
  EnergyEventKind,
  type VehicleEnergyEvent,
} from '@prisma/client';
import { toEnergyEventDto, type EnergyEventDto } from './energy-events.types';

export interface DetectEnergyEventsOptions {
  from: Date;
  to: Date;
}

export interface DetectEnergyEventsResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  events: EnergyEventDto[];
}

/**
 * Canonical orchestration layer for refuel/recharge events.
 *
 * Data lineage:
 *   DIMO Telemetry API  →  segments(mechanism: refuel|recharge)
 *      │
 *      ▼
 *   DimoSegmentsService.fetchEnergyEventSegments  (raw segment objects)
 *      │
 *      ▼
 *   persistSegments()                              (idempotent upsert by dimoSegmentId)
 *      │
 *      ▼
 *   vehicle_energy_events                          (first-class row per event)
 *
 * Read side:
 *   listEnergyEvents()           → flat list for timeline rendering
 *   buildTripsTimeline()         → merges trips + events chronologically
 *
 * This service intentionally does not merge refuel/recharge semantics into
 * VehicleTrip rows. The trip table continues to describe driving activity;
 * energy events describe stationary refill/charge activity between trips.
 */
@Injectable()
export class EnergyEventsService {
  private readonly logger = new Logger(EnergyEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dimoSegments: DimoSegmentsService,
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

  /**
   * On-demand detection: fetches native DIMO energy segments for a vehicle
   * window and upserts them into `vehicle_energy_events`. Safe to call
   * repeatedly — the underlying `dimoSegmentId` (tokenId + startTs) is the
   * idempotency key.
   */
  async detectEnergyEvents(
    vehicleId: string,
    options: DetectEnergyEventsOptions,
  ): Promise<DetectEnergyEventsResult> {
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
      return { fetched: 0, created: 0, updated: 0, skipped: 0, events: [] };
    }

    let segments: DimoEnergyEventSegment[] = [];
    try {
      segments = await this.dimoSegments.fetchEnergyEventSegments(
        tokenId,
        options.from,
        options.to,
      );
    } catch (err: any) {
      this.logger.warn(
        `DIMO energy-event fetch failed for vehicle=${vehicleId} tokenId=${tokenId}: ${err.message}`,
      );
      return { fetched: 0, created: 0, updated: 0, skipped: 0, events: [] };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const persistedRows: VehicleEnergyEvent[] = [];

    for (const segment of segments) {
      if (!this.isSegmentPersistable(segment)) {
        skipped++;
        continue;
      }
      const { row, wasCreated } = await this.upsertSegment(vehicleId, segment);
      persistedRows.push(row);
      if (wasCreated) created++;
      else updated++;
    }

    return {
      fetched: segments.length,
      created,
      updated,
      skipped,
      events: persistedRows.map(toEnergyEventDto),
    };
  }

  /**
   * Canonical timeline for the Trips tab: interleaves trips and energy
   * events by start time. Trips are passed in by the caller (already
   * hydrated by TripAnalyticsCanonicalService); energy events are loaded
   * here so the merge happens once, in the backend.
   */
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

  // ── internal helpers ────────────────────────────────────────────────────

  private isSegmentPersistable(segment: DimoEnergyEventSegment): boolean {
    if (!segment.endTime) return false;
    if (segment.isOngoing) return false;
    if (segment.durationSeconds <= 0) return false;
    if (segment.mechanism === 'refuel') {
      // Require a meaningful fuel gain to avoid persisting sensor noise.
      return (segment.fuelDeltaLiters ?? 0) > 1.0;
    }
    // recharge: require at least 1 % SoC gain OR any kWh gain
    return (
      (segment.socDeltaPercent ?? 0) >= 1 ||
      (segment.energyDeltaKwh ?? 0) > 0
    );
  }

  private async upsertSegment(
    vehicleId: string,
    segment: DimoEnergyEventSegment,
  ): Promise<{ row: VehicleEnergyEvent; wasCreated: boolean }> {
    const kind: EnergyEventKind =
      segment.mechanism === 'refuel'
        ? EnergyEventKind.REFUEL
        : EnergyEventKind.RECHARGE;

    const existing = await this.prisma.vehicleEnergyEvent.findUnique({
      where: { dimoSegmentId: segment.segmentId },
    });

    const data = {
      vehicleId,
      kind,
      detectionMechanism: segment.mechanism,
      startTime: new Date(segment.startTime),
      endTime: new Date(segment.endTime as string),
      durationSeconds: segment.durationSeconds,
      startLatitude: segment.startLatitude,
      startLongitude: segment.startLongitude,
      endLatitude: segment.endLatitude,
      endLongitude: segment.endLongitude,
      fuelDeltaLiters: segment.fuelDeltaLiters,
      fuelDeltaPercent: segment.fuelDeltaPercent,
      socDeltaPercent: segment.socDeltaPercent,
      energyDeltaKwh: segment.energyDeltaKwh,
      odometerStartKm: segment.odometerStartKm,
      odometerEndKm: segment.odometerEndKm,
      confidence: this.scoreConfidence(segment),
      rawDetectionMeta: {
        fuelStartLiters: segment.fuelStartLiters,
        fuelEndLiters: segment.fuelEndLiters,
        fuelStartPercent: segment.fuelStartPercent,
        fuelEndPercent: segment.fuelEndPercent,
        socStartPercent: segment.socStartPercent,
        socEndPercent: segment.socEndPercent,
        energyStartKwh: segment.energyStartKwh,
        energyEndKwh: segment.energyEndKwh,
      },
    } as const;

    if (existing) {
      const row = await this.prisma.vehicleEnergyEvent.update({
        where: { id: existing.id },
        data,
      });
      return { row, wasCreated: false };
    }
    const row = await this.prisma.vehicleEnergyEvent.create({
      data: { ...data, dimoSegmentId: segment.segmentId },
    });
    return { row, wasCreated: true };
  }

  private scoreConfidence(segment: DimoEnergyEventSegment): EnergyEventConfidence {
    if (segment.mechanism === 'refuel') {
      const liters = segment.fuelDeltaLiters ?? 0;
      if (liters >= 10 && segment.startLatitude != null) {
        return EnergyEventConfidence.HIGH;
      }
      if (liters >= 3) return EnergyEventConfidence.MEDIUM;
      return EnergyEventConfidence.LOW;
    }
    const socDelta = segment.socDeltaPercent ?? 0;
    if (socDelta >= 20 && segment.startLatitude != null) {
      return EnergyEventConfidence.HIGH;
    }
    if (socDelta >= 5) return EnergyEventConfidence.MEDIUM;
    return EnergyEventConfidence.LOW;
  }
}
