import { Injectable, Logger } from '@nestjs/common';
import {
  DrivingEventSource,
  DrivingEventTripAssignment,
  DrivingEventType,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { DimoNativeDrivingEventMapping } from './dimo-native-driving-event-mapper.types';
import type { DimoNativeEventClassification } from './dimo-native-driving-event-mapper.types';
import {
  DIMO_NATIVE_EVENT_PROVIDER,
  buildDimoNativeEventFingerprint,
  extractDimoNativeEventCoreMetadata,
  resolveNativeEventTripAssignment,
} from './dimo-native-event-fingerprint';
import type { NativeEventTripWindow } from './dimo-native-event-fingerprint.types';

export type PersistNativeDimoEventInput = {
  organizationId: string;
  vehicleId: string;
  providerEventName: string;
  providerSourceId: string;
  durationNs: number;
  metadataJson: string | null;
  recordedAt: Date;
  eventType: DrivingEventType;
  classification: DimoNativeEventClassification;
  severity: number;
  speedKmh: number | null;
  durationMs: number | null;
  mapping: DimoNativeDrivingEventMapping;
  enrichmentMetadata: Record<string, unknown>;
};

export type PersistNativeDimoEventResult = {
  id: string;
  providerFingerprint: string;
  tripId: string | null;
  tripAssignment: DrivingEventTripAssignment;
  created: boolean;
  eventType: DrivingEventType;
};

@Injectable()
export class DimoNativeDrivingEventPersistenceService {
  private readonly logger = new Logger(DimoNativeDrivingEventPersistenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert native DIMO events by deterministic fingerprint.
   * Re-fetch / reprocess updates enrichment fields only — never duplicates identity.
   */
  async upsertNativeEvents(
    events: PersistNativeDimoEventInput[],
    trip: NativeEventTripWindow | null,
    tx?: Prisma.TransactionClient,
  ): Promise<PersistNativeDimoEventResult[]> {
    const client = tx ?? this.prisma;
    const results: PersistNativeDimoEventResult[] = [];

    for (const event of events) {
      const core = extractDimoNativeEventCoreMetadata(event.metadataJson);
      const providerFingerprint = buildDimoNativeEventFingerprint({
        organizationId: event.organizationId,
        vehicleId: event.vehicleId,
        provider: DIMO_NATIVE_EVENT_PROVIDER,
        providerEventName: event.providerEventName,
        observedAt: event.recordedAt,
        durationNs: event.durationNs,
        providerSourceId: event.providerSourceId,
        counterValue: core.counterValue,
      });
      const assignment = resolveNativeEventTripAssignment(event.recordedAt, trip);
      const metadataJson = {
        ...event.enrichmentMetadata,
        dimoEventName: event.providerEventName,
        dimoEventSource: event.providerSourceId,
        dimoCounterValue: core.counterValue,
        classification: event.classification,
        provider: DIMO_NATIVE_EVENT_PROVIDER,
        detectionMethod: 'NATIVE_TELEMETRY_EVENT',
        providerSource: event.mapping.providerSource,
        evidenceSourceType: event.mapping.evidenceSourceType,
        mappingVersion: event.mapping.mappingVersion,
        isKnownMapping: event.mapping.isKnownMapping,
        providerFingerprint,
      };

      const existing = await client.drivingEvent.findUnique({
        where: {
          organizationId_providerFingerprint: {
            organizationId: event.organizationId,
            providerFingerprint,
          },
        },
        select: { id: true, tripId: true, tripAssignment: true },
      });

      if (existing) {
        // Identity-stable update: enrich fields + trip linkage without duplicating rows.
        const nextTripId = assignment.tripId ?? existing.tripId;
        const nextAssignment =
          nextTripId != null
            ? DrivingEventTripAssignment.ASSIGNED
            : DrivingEventTripAssignment.UNASSIGNED;

        const updated = await client.drivingEvent.update({
          where: { id: existing.id },
          data: {
            eventType: event.eventType,
            severity: event.severity,
            speedKmh: event.speedKmh,
            durationMs: event.durationMs,
            provider: DIMO_NATIVE_EVENT_PROVIDER,
            providerEventName: event.providerEventName,
            providerSourceId: event.providerSourceId,
            providerFingerprint,
            tripId: nextTripId,
            tripAssignment: nextAssignment,
            metadataJson,
          },
          select: {
            id: true,
            tripId: true,
            tripAssignment: true,
            eventType: true,
          },
        });
        results.push({
          id: updated.id,
          providerFingerprint,
          tripId: updated.tripId,
          tripAssignment: updated.tripAssignment,
          created: false,
          eventType: updated.eventType,
        });
        continue;
      }

      const created = await client.drivingEvent.create({
        data: {
          vehicleId: event.vehicleId,
          organizationId: event.organizationId,
          eventType: event.eventType,
          source: DrivingEventSource.TELEMETRY_EVENTS,
          recordedAt: event.recordedAt,
          speedKmh: event.speedKmh,
          severity: event.severity,
          durationMs: event.durationMs,
          provider: DIMO_NATIVE_EVENT_PROVIDER,
          providerEventName: event.providerEventName,
          providerSourceId: event.providerSourceId,
          providerFingerprint,
          tripId: assignment.tripId,
          tripAssignment: assignment.tripAssignment,
          metadataJson,
        },
        select: {
          id: true,
          tripId: true,
          tripAssignment: true,
          eventType: true,
        },
      });
      results.push({
        id: created.id,
        providerFingerprint,
        tripId: created.tripId,
        tripAssignment: created.tripAssignment,
        created: true,
        eventType: created.eventType,
      });
    }

    return results;
  }

  /**
   * Assign previously unassigned native events to trips when boundaries are known.
   */
  async reconcileUnassignedEvents(
    organizationId: string,
    vehicleId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ assigned: number; examined: number }> {
    const client = tx ?? this.prisma;
    const unassigned = await client.drivingEvent.findMany({
      where: {
        organizationId,
        vehicleId,
        source: DrivingEventSource.TELEMETRY_EVENTS,
        tripAssignment: DrivingEventTripAssignment.UNASSIGNED,
        providerFingerprint: { not: null },
      },
      select: { id: true, recordedAt: true },
      orderBy: { recordedAt: 'asc' },
    });

    let assigned = 0;
    for (const event of unassigned) {
      const trip = await client.vehicleTrip.findFirst({
        where: {
          vehicleId,
          startTime: { lte: event.recordedAt },
          endTime: { gte: event.recordedAt },
        },
        orderBy: { startTime: 'desc' },
        select: { id: true },
      });
      if (!trip) continue;

      await client.drivingEvent.update({
        where: { id: event.id },
        data: {
          tripId: trip.id,
          tripAssignment: DrivingEventTripAssignment.ASSIGNED,
        },
      });
      assigned += 1;
    }

    if (assigned > 0) {
      this.logger.log(
        `Reconciled ${assigned}/${unassigned.length} unassigned native events for vehicle ${vehicleId}`,
      );
    }

    return { assigned, examined: unassigned.length };
  }
}
