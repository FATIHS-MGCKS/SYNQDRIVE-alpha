import { Injectable, NotFoundException } from '@nestjs/common';
import { DriverAttributionSource } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripAttributionService } from '../trips/trip-attribution.service';
import { resolveDrivingAttributionRoles } from '../trips/driving-attribution-roles/driving-attribution-roles';
import { DRIVER_ATTRIBUTION_MODEL_VERSION } from './driver-attribution.config';
import {
  buildDriverAttributionEvidence,
  mapTripAttributionConfidence,
  mapTripAttributionSource,
  mapTripAttributionToDriverAttributionType,
  resolveDriverIdForAttribution,
} from './driver-attribution.mapper';
import { pickCanonicalDriverAttribution } from './driver-attribution-priority';
import { DriverAttributionRepository } from './driver-attribution.repository';
import type { UpsertDriverAttributionInput } from './driver-attribution.types';

@Injectable()
export class DriverAttributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: DriverAttributionRepository,
    private readonly tripAttributionService: TripAttributionService,
  ) {}

  findByTrip(organizationId: string, tripId: string) {
    return this.repository.findByTrip(organizationId, tripId);
  }

  resolveCanonicalForTrip(organizationId: string, tripId: string, at: Date = new Date()) {
    return this.repository.findByTrip(organizationId, tripId).then((rows) =>
      pickCanonicalDriverAttribution(rows, at),
    );
  }

  upsertSnapshot(input: UpsertDriverAttributionInput) {
    return this.repository.upsertSnapshot(input);
  }

  /**
   * Read-only snapshot from current trip assignment/attribution — does not mutate trip detection.
   */
  async materializePipelineSnapshot(input: {
    organizationId: string;
    tripId: string;
    analysisRunId?: string | null;
    pipelineJobId?: string | null;
    source?: DriverAttributionSource;
  }) {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: input.tripId, vehicle: { organizationId: input.organizationId } },
      select: {
        id: true,
        vehicleId: true,
        startTime: true,
        endTime: true,
        isPrivateTrip: true,
        assignmentStatus: true,
        assignmentSubjectType: true,
        assignmentSubjectId: true,
        assignedBookingId: true,
        bookingLinkSource: true,
        bookingCustomerId: true,
        assignedDriverId: true,
        actualDriverId: true,
      },
    });
    if (!trip) {
      throw new NotFoundException('Trip not found for organization');
    }

    const booking =
      trip.assignedBookingId != null
        ? await this.prisma.booking.findFirst({
            where: { id: trip.assignedBookingId, organizationId: input.organizationId },
            select: {
              customerId: true,
              assignedDriverId: true,
              customer: { select: { customerType: true } },
            },
          })
        : null;

    const attribution = await this.tripAttributionService.resolveAttributionForTrip({
      isPrivateTrip: trip.isPrivateTrip,
      assignmentStatus: trip.assignmentStatus,
      assignedBookingId: trip.assignedBookingId,
      assignmentSubjectId: trip.assignmentSubjectId,
      assignmentSubjectType: trip.assignmentSubjectType,
      bookingLinkSource: trip.bookingLinkSource,
      bookingCustomerId: trip.bookingCustomerId,
      assignedDriverId: trip.assignedDriverId,
      actualDriverId: trip.actualDriverId,
      vehicleId: trip.vehicleId,
      startTime: trip.startTime,
      endTime: trip.endTime,
    });

    const roles = resolveDrivingAttributionRoles({
      isPrivateTrip: trip.isPrivateTrip,
      assignmentStatus: trip.assignmentStatus,
      assignmentSubjectType: trip.assignmentSubjectType,
      assignmentSubjectId: trip.assignmentSubjectId,
      assignedBookingId: trip.assignedBookingId,
      bookingLinkSource: trip.bookingLinkSource,
      bookingCustomerId: booking?.customerId ?? trip.bookingCustomerId,
      bookingAssignedDriverId: booking?.assignedDriverId ?? trip.assignedDriverId,
      bookingCustomerType: booking?.customer.customerType ?? null,
      tripBookingCustomerId: trip.bookingCustomerId,
      tripAssignedDriverId: trip.assignedDriverId,
      tripActualDriverId: trip.actualDriverId,
    });

    const attributionType = mapTripAttributionToDriverAttributionType(attribution, roles);
    const source = input.source ?? mapTripAttributionSource(attribution);

    return this.repository.upsertSnapshot({
      organizationId: input.organizationId,
      vehicleId: trip.vehicleId,
      tripId: trip.id,
      analysisRunId: input.analysisRunId ?? null,
      bookingId: attribution.bookingId,
      customerId: roles.bookingCustomerId,
      driverId: resolveDriverIdForAttribution({ roles }),
      attributionType,
      confidence: mapTripAttributionConfidence(attribution.confidence),
      source,
      validFrom: trip.startTime,
      validUntil: trip.endTime,
      evidence: buildDriverAttributionEvidence({
        attribution,
        roles,
        pipelineJobId: input.pipelineJobId ?? null,
      }),
      modelVersion: DRIVER_ATTRIBUTION_MODEL_VERSION,
    });
  }
}
