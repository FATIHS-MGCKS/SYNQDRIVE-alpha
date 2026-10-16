import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildTripDiBoundaryAdmissionPatch,
  buildTripDiBoundaryRevisionKey,
  canReleaseTripDiBoundaryAdmission,
  readTripDiBoundaryAdmissionV1,
  type TripDiBoundaryAdmissionScope,
} from './trip-di-boundary-admission';
import { readRawDetectionMeta as readMeta } from '../boundary-repair.state.util';

@Injectable()
export class TripDiBoundaryAdmissionService {
  private readonly logger = new Logger(TripDiBoundaryAdmissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async loadScope(tripId: string): Promise<TripDiBoundaryAdmissionScope | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        organization_id: string;
        vehicle_id: string;
        trip_id: string;
        trip_status: string;
        start_time: Date;
        end_time: Date | null;
        dimo_segment_id: string | null;
        merge_parent_trip_id: string | null;
        raw_detection_meta: unknown;
        detection_state: string | null;
        active_trip_id: string | null;
        proposed_repairs: bigint;
      }>
    >`
      SELECT v.organization_id, t.vehicle_id, t.id AS trip_id, t.trip_status::text AS trip_status,
             t.start_time AT TIME ZONE 'UTC' AS start_time, t.end_time AT TIME ZONE 'UTC' AS end_time,
             t.dimo_segment_id, t.merge_parent_trip_id, t.raw_detection_meta,
             d.state::text AS detection_state, d.active_trip_id::text AS active_trip_id,
             (SELECT count(*)::bigint FROM trip_repairs r
              WHERE r.trip_id = t.id AND r.status = 'PROPOSED') AS proposed_repairs
      FROM vehicle_trips t
      JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN vehicle_trip_detection_states d ON d.vehicle_id = t.vehicle_id
      WHERE t.id = ${tripId}
      LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    return {
      organizationId: row.organization_id,
      vehicleId: row.vehicle_id,
      tripId: row.trip_id,
      tripStatus: row.trip_status,
      startTime: row.start_time,
      endTime: row.end_time,
      dimoSegmentId: row.dimo_segment_id,
      mergeParentTripId: row.merge_parent_trip_id,
      rawDetectionMeta: row.raw_detection_meta,
      detectionState: row.detection_state,
      activeTripId: row.active_trip_id,
      proposedBoundaryRepairCount: Number(row.proposed_repairs),
    };
  }

  /**
   * Idempotent: writes admission only when release preconditions hold and revision changed or missing.
   */
  async tryReleaseForTrip(tripId: string, releasedBy: 'RECONCILIATION' | 'OPERATOR' = 'RECONCILIATION'): Promise<boolean> {
    const scope = await this.loadScope(tripId);
    if (!scope) return false;
    const block = canReleaseTripDiBoundaryAdmission(scope);
    if (block != null) return false;
    const revisionKey = buildTripDiBoundaryRevisionKey({
      organizationId: scope.organizationId,
      vehicleId: scope.vehicleId,
      tripId: scope.tripId,
      tripStatus: scope.tripStatus,
      startTime: scope.startTime,
      endTime: scope.endTime,
      dimoSegmentId: scope.dimoSegmentId,
      mergeParentTripId: scope.mergeParentTripId,
      rawDetectionMeta: scope.rawDetectionMeta,
    });
    const patch = buildTripDiBoundaryAdmissionPatch(revisionKey, releasedBy);
    const prior = readMeta(scope.rawDetectionMeta);
    const existing = readTripDiBoundaryAdmissionV1(scope.rawDetectionMeta);
    if (existing?.revisionKey === revisionKey) return true;

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        rawDetectionMeta: {
          ...prior,
          ...patch,
        },
      },
    });
    return true;
  }

  async releaseCompletedTripsInWindow(vehicleId: string, from: Date, to: Date): Promise<number> {
    const trips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId,
        tripStatus: 'COMPLETED',
        endTime: { not: null },
        startTime: { gte: from, lt: to },
      },
      select: { id: true },
      orderBy: { startTime: 'asc' },
    });
    let released = 0;
    for (const t of trips) {
      try {
        if (await this.tryReleaseForTrip(t.id, 'RECONCILIATION')) released += 1;
      } catch (err) {
        this.logger.warn(
          `DI boundary admission release failed trip=${t.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return released;
  }
}
