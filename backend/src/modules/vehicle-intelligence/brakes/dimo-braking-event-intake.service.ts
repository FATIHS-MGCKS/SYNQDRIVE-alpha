import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  DimoBrakingEventIntakeStatus,
  DrivingEventSource,
  DrivingEventType,
  HardwareType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DimoSegmentsService,
  type DimoVehicleEventRecord,
} from '../../dimo/dimo-segments.service';
import {
  assessDimoBrakingCapability,
  DIMO_BRAKING_RAW_SOURCE_VERSION,
  parseDimoBrakingSample,
  type DimoBrakingCapabilityGateResult,
  type DimoEventDataSummaryRow,
  type ParsedDimoBrakingSample,
} from './dimo-braking-event-intake.domain';
import { BrakeHealthObservabilityService } from './brake-health-observability.service';

export type DimoBrakingIntakeOutcome =
  | 'created'
  | 'duplicate'
  | 'skipped_unsupported'
  | 'skipped_wrong_vehicle'
  | 'failed';

export interface IngestDimoBrakingEventInput {
  provider?: string;
  tokenId: number;
  vehicleId: string;
  organizationId: string;
  hardwareType: HardwareType;
  expectedVehicleId?: string;
  tripId?: string | null;
  sample: DimoVehicleEventRecord;
  capability?: DimoBrakingCapabilityGateResult;
}

export interface IngestDimoBrakingBatchResult {
  created: number;
  duplicate: number;
  skipped: number;
  failed: number;
  parsed: ParsedDimoBrakingSample[];
}

export interface SyncBrakingDrivingEventsResult {
  created: number;
  linked: number;
  removedOrphans: number;
}

@Injectable()
export class DimoBrakingEventIntakeService {
  private readonly logger = new Logger(DimoBrakingEventIntakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: DimoSegmentsService,
    @Optional() private readonly observability?: BrakeHealthObservabilityService,
  ) {}

  assessCapability(input: {
    hardwareType: HardwareType | null | undefined;
    provider?: string;
    eventDataSummary?: DimoEventDataSummaryRow[] | null;
  }): DimoBrakingCapabilityGateResult {
    return assessDimoBrakingCapability(input);
  }

  async fetchEventDataSummary(tokenId: number): Promise<DimoEventDataSummaryRow[]> {
    return this.segments.fetchEventDataSummary(tokenId);
  }

  async fetchDrivingEventsPaginated(
    tokenId: number,
    from: Date,
    to: Date,
  ): Promise<DimoVehicleEventRecord[]> {
    return this.segments.fetchDrivingEventsPaginated(tokenId, from, to);
  }

  async ingestBrakingEvent(
    input: IngestDimoBrakingEventInput,
  ): Promise<{ outcome: DimoBrakingIntakeOutcome; intakeId?: string }> {
    const provider = input.provider ?? 'DIMO';
    const capability =
      input.capability ??
      assessDimoBrakingCapability({
        hardwareType: input.hardwareType,
        provider,
      });

    if (!capability.allowed) {
      return { outcome: 'skipped_unsupported' };
    }

    if (input.expectedVehicleId && input.expectedVehicleId !== input.vehicleId) {
      return { outcome: 'skipped_wrong_vehicle' };
    }

    const parsed = parseDimoBrakingSample(
      input.sample,
      input.tokenId,
      input.tripId ?? null,
    );
    if (!parsed) {
      return { outcome: 'skipped_unsupported' };
    }

    try {
      const row = await this.prisma.dimoBrakingEventIntake.upsert({
        where: {
          provider_providerEventId: {
            provider,
            providerEventId: parsed.providerEventId,
          },
        },
        create: {
          provider,
          providerEventId: parsed.providerEventId,
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
          tokenId: input.tokenId,
          eventType: parsed.eventType,
          eventTimestamp: parsed.eventTimestamp,
          severity: parsed.severity,
          rawSourceVersion: DIMO_BRAKING_RAW_SOURCE_VERSION,
          sourceFingerprint: parsed.sourceFingerprint,
          tripId: input.tripId ?? null,
          dimoEventName: parsed.dimoEventName,
          counterValue: parsed.counterValue,
          processingStatus: DimoBrakingEventIntakeStatus.RECEIVED,
        },
        update: {
          tripId: input.tripId ?? undefined,
          sourceFingerprint: parsed.sourceFingerprint,
        },
        select: { id: true, createdAt: true, updatedAt: true },
      });

      const isNew = row.createdAt.getTime() === row.updatedAt.getTime();
      const outcome = isNew ? 'created' : 'duplicate';
      this.observability?.recordEventIntake({
        source: 'dimo',
        outcome: outcome as 'created' | 'duplicate',
      });
      return {
        outcome,
        intakeId: row.id,
      };
    } catch (err: unknown) {
      this.logger.warn(
        `DIMO braking intake failed for vehicle ${input.vehicleId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      this.observability?.recordEventIntake({ source: 'dimo', outcome: 'failed' });
      return { outcome: 'failed' };
    }
  }

  async ingestBrakingBatch(input: {
    provider?: string;
    tokenId: number;
    vehicleId: string;
    organizationId: string;
    hardwareType: HardwareType;
    tripId?: string | null;
    samples: DimoVehicleEventRecord[];
    eventDataSummary?: DimoEventDataSummaryRow[] | null;
  }): Promise<IngestDimoBrakingBatchResult> {
    const capability = assessDimoBrakingCapability({
      hardwareType: input.hardwareType,
      provider: input.provider,
      eventDataSummary: input.eventDataSummary,
    });

    if (!capability.allowed) {
      return { created: 0, duplicate: 0, skipped: input.samples.length, failed: 0, parsed: [] };
    }

    let created = 0;
    let duplicate = 0;
    let skipped = 0;
    let failed = 0;
    const parsed: ParsedDimoBrakingSample[] = [];

    for (const sample of input.samples) {
      const braking = parseDimoBrakingSample(sample, input.tokenId, input.tripId ?? null);
      if (!braking) {
        skipped += 1;
        continue;
      }
      parsed.push(braking);

      const result = await this.ingestBrakingEvent({
        provider: input.provider,
        tokenId: input.tokenId,
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        hardwareType: input.hardwareType,
        tripId: input.tripId,
        sample,
        capability,
      });

      switch (result.outcome) {
        case 'created':
          created += 1;
          break;
        case 'duplicate':
          duplicate += 1;
          break;
        case 'failed':
          failed += 1;
          break;
        default:
          skipped += 1;
      }
    }

    return { created, duplicate, skipped, failed, parsed };
  }

  async resolveTripId(vehicleId: string, observedAt: Date): Promise<string | null> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: {
        vehicleId,
        startTime: { lte: observedAt },
        OR: [{ endTime: { gte: observedAt } }, { endTime: null }],
      },
      orderBy: { startTime: 'desc' },
      select: { id: true },
    });
    return trip?.id ?? null;
  }

  async syncBrakingDrivingEventsForTrip(input: {
    tripId: string;
    vehicleId: string;
    organizationId: string;
    normalizedEvents: Array<{
      providerEventId: string;
      eventType: DrivingEventType;
      recordedAt: Date;
      severity: number;
      speedKmh: number | null;
      metadataJson: Prisma.InputJsonValue;
    }>;
  }): Promise<SyncBrakingDrivingEventsResult> {
    const intakeRows = await this.prisma.dimoBrakingEventIntake.findMany({
      where: {
        tripId: input.tripId,
        eventType: {
          in: [DrivingEventType.HARSH_BRAKING, DrivingEventType.EXTREME_BRAKING],
        },
      },
      select: {
        id: true,
        providerEventId: true,
        drivingEventId: true,
      },
    });

    const intakeByProviderId = new Map(intakeRows.map((row) => [row.providerEventId, row]));
    let created = 0;
    let linked = 0;

    for (const event of input.normalizedEvents) {
      const intake = intakeByProviderId.get(event.providerEventId);
      if (!intake) continue;

      if (intake.drivingEventId) {
        await this.prisma.drivingEvent.update({
          where: { id: intake.drivingEventId },
          data: {
            eventType: event.eventType,
            recordedAt: event.recordedAt,
            severity: event.severity,
            speedKmh: event.speedKmh,
            metadataJson: event.metadataJson,
          },
        });
        linked += 1;
        continue;
      }

      const drivingEvent = await this.prisma.drivingEvent.create({
        data: {
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
          tripId: input.tripId,
          eventType: event.eventType,
          source: DrivingEventSource.TELEMETRY_EVENTS,
          recordedAt: event.recordedAt,
          speedKmh: event.speedKmh,
          severity: event.severity,
          metadataJson: event.metadataJson,
        },
        select: { id: true },
      });

      await this.prisma.dimoBrakingEventIntake.update({
        where: { id: intake.id },
        data: {
          drivingEventId: drivingEvent.id,
          processingStatus: DimoBrakingEventIntakeStatus.PROCESSED,
        },
      });
      created += 1;
      linked += 1;
    }

    const providerIds = new Set(input.normalizedEvents.map((e) => e.providerEventId));
    const orphanIntakeIds = intakeRows
      .filter((row) => !providerIds.has(row.providerEventId) && row.drivingEventId)
      .map((row) => row.drivingEventId!)
      .filter(Boolean);

    let removedOrphans = 0;
    if (orphanIntakeIds.length > 0) {
      const deleted = await this.prisma.drivingEvent.deleteMany({
        where: {
          id: { in: orphanIntakeIds },
          tripId: input.tripId,
          source: DrivingEventSource.TELEMETRY_EVENTS,
          eventType: {
            in: [DrivingEventType.HARSH_BRAKING, DrivingEventType.EXTREME_BRAKING],
          },
        },
      });
      removedOrphans = deleted.count;
      await this.prisma.dimoBrakingEventIntake.updateMany({
        where: { drivingEventId: { in: orphanIntakeIds } },
        data: {
          drivingEventId: null,
          processingStatus: DimoBrakingEventIntakeStatus.RECEIVED,
        },
      });
    }

    return { created, linked, removedOrphans };
  }
}
