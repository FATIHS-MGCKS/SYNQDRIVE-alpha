import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { WaypointMirrorService } from './waypoint-mirror.service';
import { ActivityWindowProducerService } from './activity-window-producer.service';

/**
 * Fire-and-forget coordinator for post-trip ClickHouse evidence producers
 * (waypoints + activity windows). Keeps trip lifecycle callers thin.
 */
@Injectable()
export class TripChEvidenceMirrorCoordinator {
  private readonly logger = new Logger(TripChEvidenceMirrorCoordinator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly waypointMirror: WaypointMirrorService,
    private readonly activityWindowProducer: ActivityWindowProducerService,
  ) {}

  /** Schedule both evidence mirrors without blocking the caller. */
  schedulePostTripEvidence(input: {
    vehicleId: string;
    tripId: string;
    organizationId?: string | null;
    tokenId?: number | null;
    bookingId?: string | null;
    windowStart: Date;
    windowEnd: Date;
  }): void {
    if (!this.waypointMirror.isEnabled && !this.activityWindowProducer.isEnabled) {
      return;
    }

    void this.run(input).catch((err: unknown) => {
      this.logger.warn(
        `Post-trip CH evidence mirror failed for trip ${input.tripId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  private async run(input: {
    vehicleId: string;
    tripId: string;
    organizationId?: string | null;
    tokenId?: number | null;
    bookingId?: string | null;
    windowStart: Date;
    windowEnd: Date;
  }): Promise<void> {
    let orgId = input.organizationId ?? null;
    let tokenId = input.tokenId ?? null;
    let bookingId = input.bookingId ?? null;

    if (!orgId || tokenId == null || bookingId === undefined) {
      const trip = await this.prisma.vehicleTrip.findUnique({
        where: { id: input.tripId },
        select: {
          assignedBookingId: true,
          vehicle: {
            select: {
              organizationId: true,
              dimoVehicle: { select: { tokenId: true } },
            },
          },
        },
      });
      orgId = orgId ?? trip?.vehicle?.organizationId ?? null;
      tokenId = tokenId ?? trip?.vehicle?.dimoVehicle?.tokenId ?? null;
      if (bookingId === undefined) {
        bookingId = trip?.assignedBookingId ?? null;
      }
    }

    if (!orgId || tokenId == null) {
      this.logger.debug(
        `Skipping CH evidence mirror for trip ${input.tripId}: missing org/token.`,
      );
      return;
    }

    const base = {
      orgId,
      vehicleId: input.vehicleId,
      tokenId,
      tripId: input.tripId,
      bookingId,
    };

    const [waypointRes, activityRes] = await Promise.all([
      this.waypointMirror.isEnabled
        ? this.waypointMirror.mirrorTripWaypoints(base)
        : Promise.resolve({ mirrored: false, pointsInserted: 0 }),
      this.activityWindowProducer.isEnabled
        ? this.activityWindowProducer.produceForTrip({
            orgId,
            vehicleId: input.vehicleId,
            tripId: input.tripId,
            bookingId,
            windowStart: input.windowStart,
            windowEnd: input.windowEnd,
          })
        : Promise.resolve({ produced: false, windowsInserted: 0 }),
    ]);

    if (waypointRes.mirrored || activityRes.produced) {
      this.logger.debug(
        `CH evidence mirror trip ${input.tripId}: waypoints=${waypointRes.pointsInserted}, windows=${activityRes.windowsInserted}.`,
      );
    }
  }
}
