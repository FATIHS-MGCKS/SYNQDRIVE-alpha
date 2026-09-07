import { Injectable } from '@nestjs/common';
import {
  BatteryShutdownEvidenceClass,
  BatteryShutdownEvidenceConfidenceClass,
  BatteryShutdownStateAlignmentClass,
  BatteryShutdownStateCompleteness,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface CreateShutdownEvidenceObservationInput {
  organizationId: string;
  vehicleId: string;
  tripId: string | null;
  provider: string;
  providerObservationAt: Date;
  providerResponseAt: Date;
  ingestedAt: Date;
  voltage: number | null;
  voltageObservedAt: Date | null;
  speedKmh: number | null;
  speedObservedAt: Date | null;
  speedTimestampSource: string | null;
  ignitionOn: boolean | null;
  ignitionObservedAt: Date | null;
  ignitionTimestampSource: string | null;
  engineRunning: boolean | null;
  engineRunningObservedAt: Date | null;
  engineRunningTimestampSource: string | null;
  isLvCharging: boolean | null;
  isHvCharging: boolean | null;
  chargingContextObservedAt: Date | null;
  chargingContextTimestampSource: string | null;
  activeTrip: boolean | null;
  activeTripObservedAt: Date | null;
  activeTripTimestampSource: string | null;
  tripStartedAt: Date | null;
  tripEndedAt: Date | null;
  relativeToTripEndMs: number | null;
  vehicleOnline: boolean | null;
  vehicleOnlineObservedAt: Date | null;
  providerLastSeenAt: Date | null;
  sourceObservationId: string | null;
  sourceSnapshotId: string | null;
  sourceKind: string;
  stateTimestampSkewMs: number | null;
  maxFieldTimestampSkewMs: number | null;
  stateCompleteness: BatteryShutdownStateCompleteness;
  stateAlignmentClass: BatteryShutdownStateAlignmentClass;
  evidenceClass: BatteryShutdownEvidenceClass;
  confidenceClass: BatteryShutdownEvidenceConfidenceClass;
  fieldProvenance: Prisma.InputJsonValue | null;
  idempotencyKey: string;
}

export interface CreateTripShutdownContextInput {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  tripEndedAt: Date;
  snapshot: Prisma.InputJsonValue;
  stateTimestampSkewMs: number | null;
  maxFieldTimestampSkewMs: number | null;
  stateCompleteness: BatteryShutdownStateCompleteness;
  stateAlignmentClass: BatteryShutdownStateAlignmentClass;
  providerSilenceAfterTripEnd: boolean;
  firstObservationAfterTripEndAt: Date | null;
  idempotencyKey: string;
}

@Injectable()
export class ShutdownEvidenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createObservationIdempotent(
    input: CreateShutdownEvidenceObservationInput,
  ): Promise<'created' | 'duplicate'> {
    try {
      await this.prisma.batteryShutdownEvidenceObservation.create({
        data: {
          ...input,
          fieldProvenance: input.fieldProvenance ?? undefined,
        },
      });
      return 'created';
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return 'duplicate';
      }
      throw err;
    }
  }

  async createTripContextIdempotent(
    input: CreateTripShutdownContextInput,
  ): Promise<'created' | 'duplicate'> {
    try {
      await this.prisma.batteryTripShutdownContext.create({
        data: input,
      });
      return 'created';
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return 'duplicate';
      }
      throw err;
    }
  }

  async findLatestCompletedIceTripInCaptureWindow(input: {
    vehicleId: string;
    observationAt: Date;
    preWindowMs: number;
    postWindowMs: number;
  }) {
    const windowStart = new Date(input.observationAt.getTime() - input.postWindowMs);
    const windowEnd = new Date(input.observationAt.getTime() + input.preWindowMs);
    return this.prisma.vehicleTrip.findFirst({
      where: {
        vehicleId: input.vehicleId,
        endTime: { not: null, gte: windowStart, lte: windowEnd },
        tripStatus: 'COMPLETED',
      },
      orderBy: { endTime: 'desc' },
      select: {
        id: true,
        startTime: true,
        endTime: true,
      },
    });
  }

  async findFirstLvObservationAfterTripEnd(input: {
    vehicleId: string;
    tripEndedAt: Date;
  }): Promise<Date | null> {
    const row = await this.prisma.batteryShutdownEvidenceObservation.findFirst({
      where: {
        vehicleId: input.vehicleId,
        providerObservationAt: { gt: input.tripEndedAt },
      },
      orderBy: { providerObservationAt: 'asc' },
      select: { providerObservationAt: true },
    });
    return row?.providerObservationAt ?? null;
  }
}
