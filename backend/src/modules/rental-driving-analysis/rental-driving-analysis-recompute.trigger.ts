import { Injectable, Logger, Optional } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DrivingIntelligenceJobDispatcherService } from '../vehicle-intelligence/driving-intelligence-jobs/driving-intelligence-jobs.dispatcher.service';
import { DrivingAnalysisInitService } from '../vehicle-intelligence/driving-analysis-init/driving-analysis-init.service';
import { DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION } from '../vehicle-intelligence/driving-analysis-init/driving-analysis-init.types';
import type { RentalDrivingAnalysisRecomputeReason } from './rental-driving-analysis.recompute.types';

export type EnqueueRentalDrivingAnalysisRecomputeInput = {
  organizationId: string;
  vehicleId: string;
  bookingId: string;
  tripId?: string | null;
  reason: RentalDrivingAnalysisRecomputeReason;
  correlationId?: string;
};

@Injectable()
export class RentalDrivingAnalysisRecomputeTriggerService {
  private readonly logger = new Logger(RentalDrivingAnalysisRecomputeTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobDispatcher: DrivingIntelligenceJobDispatcherService,
    @Optional() private readonly analysisInit?: DrivingAnalysisInitService,
  ) {}

  async enqueueForBooking(input: EnqueueRentalDrivingAnalysisRecomputeInput) {
    const booking = await this.prisma.booking.findFirst({
      where: {
        id: input.bookingId,
        organizationId: input.organizationId,
        status: { in: [BookingStatus.ACTIVE, BookingStatus.COMPLETED] },
      },
      select: { id: true, vehicleId: true, status: true },
    });
    if (!booking?.vehicleId) {
      return { enqueued: false, reason: 'BOOKING_NOT_ELIGIBLE' as const };
    }
    if (booking.vehicleId !== input.vehicleId) {
      return { enqueued: false, reason: 'VEHICLE_MISMATCH' as const };
    }

    const anchorTripId =
      input.tripId ??
      (
        await this.prisma.vehicleTrip.findFirst({
          where: {
            assignedBookingId: input.bookingId,
            vehicleId: input.vehicleId,
          },
          select: { id: true },
          orderBy: { endTime: 'desc' },
        })
      )?.id;

    if (!anchorTripId) {
      return { enqueued: false, reason: 'NO_ANCHOR_TRIP' as const };
    }

    const analysisRunId = await this.resolveAnalysisRunId(
      input.organizationId,
      input.vehicleId,
      anchorTripId,
    );
    if (!analysisRunId) {
      return { enqueued: false, reason: 'NO_ANALYSIS_RUN' as const };
    }

    const correlationId =
      input.correlationId ?? `rental-recompute:${input.bookingId}:${input.reason}`;
    const idempotencyKey = `${input.bookingId}:rental-recompute:${input.reason}:${analysisRunId}`;

    const result = await this.jobDispatcher.enqueue({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: anchorTripId,
      bookingId: input.bookingId,
      analysisRunId,
      jobType: 'RENTAL_DRIVING_ANALYSIS_RECOMPUTE',
      modelVersion: DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
      idempotencyKey,
      correlationId,
      requestedAt: new Date(),
    });

    if (result.enqueued) {
      this.logger.log(
        `Enqueued rental analysis recompute booking=${input.bookingId} reason=${input.reason}`,
      );
    }

    return {
      enqueued: result.enqueued,
      deduplicated: result.deduplicated,
      jobId: result.job.id,
      reason: input.reason,
    };
  }

  async enqueueForTrip(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    reason: RentalDrivingAnalysisRecomputeReason;
    correlationId?: string;
  }) {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: {
        id: input.tripId,
        vehicle: { organizationId: input.organizationId },
      },
      select: { assignedBookingId: true, vehicleId: true },
    });
    if (!trip?.assignedBookingId) {
      return { enqueued: false, reason: 'NO_BOOKING_ASSIGNMENT' as const };
    }

    return this.enqueueForBooking({
      organizationId: input.organizationId,
      vehicleId: trip.vehicleId,
      bookingId: trip.assignedBookingId,
      tripId: input.tripId,
      reason: input.reason,
      correlationId: input.correlationId,
    });
  }

  private async resolveAnalysisRunId(
    organizationId: string,
    vehicleId: string,
    tripId: string,
  ): Promise<string | null> {
    const existing = await this.prisma.drivingAnalysisRun.findFirst({
      where: {
        organizationId,
        vehicleId,
        tripId,
        analysisType: 'TRIP_ENRICHMENT',
        status: { in: ['COMPLETED', 'IN_PROGRESS', 'PENDING'] },
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }

    if (!this.analysisInit) {
      return null;
    }

    try {
      const init = await this.analysisInit.initializeForCompletedTrip({
        organizationId,
        vehicleId,
        tripId,
        source: 'REPAIR_FINALIZE',
      });
      return init.runId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to initialize analysis run for rental recompute trip=${tripId}: ${message}`,
      );
      return null;
    }
  }
}
