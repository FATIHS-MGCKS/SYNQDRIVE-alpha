import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildTripDiBoundaryAdmissionPatch,
  buildTripDiBoundaryRevisionKey,
  canReleaseTripDiBoundaryAdmission,
  readTripDiBoundaryAdmissionV1,
  type TripDiBoundaryAdmissionScope,
  type TripDiBoundaryAdmissionV1,
} from './trip-di-boundary-admission';
import {
  evaluateLiveFsmSplitAdmissionEligibility,
  listLiveFsmSplitAdmissionCandidateTripIdsInReconciliationWindow,
  resolveVerifiedLiveFsmSplitSettlementTripIds,
  type LiveFsmSplitAdmissionEligibility,
} from './trip-di-boundary-admission-live-fsm-split.util';
import {
  isAutomaticLiveFsmAdmissionCohort,
  LIVE_FSM_AUTO_RECONCILIATION_MAX_TRIPS_PER_VEHICLE,
  readLiveFsmAutomaticAdmissionPolicyFromEnv,
} from './trip-di-boundary-admission-live-fsm-auto.policy';
import {
  committedBoundaryRepairMatchesTripRow,
  hasCommittedPartialTripBoundaryExtension,
  partialExtensionAllowsAdmissionDuringRetryableRefresh,
} from '../boundary-repair.state.util';

export type TryReleaseAfterPartialTripBoundaryExtensionResult =
  | { released: true }
  | {
      released: false;
      reason:
        | 'TRIP_NOT_FOUND'
        | 'VEHICLE_MISMATCH'
        | 'BOUNDARY_REPAIR_NOT_COMMITTED'
        | 'BOUNDARY_ROW_MISMATCH'
        | 'REFRESH_GENERATION_MISMATCH'
        | 'RELEASE_GUARDS';
    };

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
    return this.rowToScope(row);
  }

  /**
   * After RESTING finalization: admit only the finalized trip and its verified LIVE_FSM split pair.
   */
  async releaseLiveFsmSplitSegmentsAfterFinalization(
    organizationId: string,
    vehicleId: string,
    finalizedTripId: string,
  ): Promise<{ released: number; skipped: number; tripIds: string[] }> {
    const policy = readLiveFsmAutomaticAdmissionPolicyFromEnv();
    if (
      !isAutomaticLiveFsmAdmissionCohort(policy, {
        organizationId,
        vehicleId,
        vehicleOrganizationId: organizationId,
      })
    ) {
      return { released: 0, skipped: 0, tripIds: [] };
    }
    const tripIds = await resolveVerifiedLiveFsmSplitSettlementTripIds(this.prisma, finalizedTripId);
    return this.releaseLiveFsmSettlementTripIds(tripIds);
  }

  /**
   * After reconciliation: bounded window + explicit activation horizon; S4 allowlisted cohort only.
   */
  async releaseLiveFsmSplitSegmentsInReconciliationWindow(
    organizationId: string,
    vehicleId: string,
    windowFrom: Date,
    windowTo: Date,
  ): Promise<{ released: number; skipped: number; tripIds: string[] }> {
    const policy = readLiveFsmAutomaticAdmissionPolicyFromEnv();
    if (
      !isAutomaticLiveFsmAdmissionCohort(policy, {
        organizationId,
        vehicleId,
        vehicleOrganizationId: organizationId,
      })
    ) {
      return { released: 0, skipped: 0, tripIds: [] };
    }
    const horizon = policy.reconciliationActivationHorizonUtc;
    if (horizon == null) {
      return { released: 0, skipped: 0, tripIds: [] };
    }
    const tripIds = await listLiveFsmSplitAdmissionCandidateTripIdsInReconciliationWindow(
      this.prisma,
      vehicleId,
      windowFrom,
      windowTo,
      horizon,
      LIVE_FSM_AUTO_RECONCILIATION_MAX_TRIPS_PER_VEHICLE,
    );
    return this.releaseLiveFsmSettlementTripIds(tripIds);
  }

  private async releaseLiveFsmSettlementTripIds(
    tripIds: readonly string[],
  ): Promise<{ released: number; skipped: number; tripIds: string[] }> {
    let released = 0;
    let skipped = 0;
    const unique = [...new Set(tripIds)];
    for (const tripId of unique) {
      try {
        const ok = await this.tryReleaseForTripTransactional(tripId, 'LIVE_FSM_SETTLEMENT');
        if (ok) released += 1;
        else skipped += 1;
      } catch (err) {
        skipped += 1;
        this.logger.warn(
          `DI boundary admission LIVE_FSM settlement release failed trip=${tripId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { released, skipped, tripIds: unique };
  }

  evaluateLiveFsmSplitAdmissionEligibility(
    tripId: string,
    expectedVehicleId: string,
  ): Promise<LiveFsmSplitAdmissionEligibility> {
    return evaluateLiveFsmSplitAdmissionEligibility(this.prisma, tripId, expectedVehicleId);
  }

  /**
   * Ops recovery: release admission for exactly one trip after canonical LIVE_FSM split eligibility checks.
   * Still uses tryReleaseForTripTransactional (FSM / repair guards).
   */
  async tryReleaseLiveFsmSplitTripScoped(
    tripId: string,
    expectedVehicleId: string,
  ): Promise<{ ok: boolean; eligibility: LiveFsmSplitAdmissionEligibility }> {
    const eligibility = await this.evaluateLiveFsmSplitAdmissionEligibility(tripId, expectedVehicleId);
    if (!eligibility.eligible) {
      return { ok: false, eligibility };
    }
    const ok = await this.tryReleaseForTripTransactional(tripId, 'LIVE_FSM_SETTLEMENT');
    return { ok, eligibility };
  }

  /**
   * After successful PARTIAL_TRIP_BOUNDARY_EXTENSION on the trip row (post-repair transaction).
   * Idempotent via tryReleaseForTripTransactional; does not enqueue S4 work items.
   */
  async tryReleaseAfterPartialTripBoundaryExtension(
    tripId: string,
    expectedVehicleId: string,
  ): Promise<TryReleaseAfterPartialTripBoundaryExtensionResult> {
    const scope = await this.loadScope(tripId);
    if (!scope) return { released: false, reason: 'TRIP_NOT_FOUND' };
    if (scope.vehicleId !== expectedVehicleId) {
      return { released: false, reason: 'VEHICLE_MISMATCH' };
    }
    if (!hasCommittedPartialTripBoundaryExtension(scope.rawDetectionMeta)) {
      return { released: false, reason: 'BOUNDARY_REPAIR_NOT_COMMITTED' };
    }
    if (
      !committedBoundaryRepairMatchesTripRow(
        scope.rawDetectionMeta,
        scope.startTime,
        scope.endTime,
      )
    ) {
      return { released: false, reason: 'BOUNDARY_ROW_MISMATCH' };
    }
    if (!partialExtensionAllowsAdmissionDuringRetryableRefresh(scope.rawDetectionMeta)) {
      return { released: false, reason: 'REFRESH_GENERATION_MISMATCH' };
    }
    const ok = await this.tryReleaseForTripTransactional(tripId, 'RECONCILIATION');
    return ok ? { released: true } : { released: false, reason: 'RELEASE_GUARDS' };
  }

  async releaseForBoundaryScannedTripIds(tripIds: readonly string[]): Promise<{ released: number; skipped: number }> {
    const unique = [...new Set(tripIds.filter((id) => id.length > 0))];
    let released = 0;
    let skipped = 0;
    for (const tripId of unique) {
      try {
        const ok = await this.tryReleaseForTripTransactional(tripId, 'RECONCILIATION');
        if (ok) released += 1;
        else skipped += 1;
      } catch (err) {
        skipped += 1;
        this.logger.warn(
          `DI boundary admission release failed trip=${tripId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { released, skipped };
  }

  /**
   * Idempotent transactional release: row lock, re-validate preconditions, jsonb_set admission only.
   */
  async tryReleaseForTripTransactional(
    tripId: string,
    releasedBy: TripDiBoundaryAdmissionV1['releasedBy'] = 'RECONCILIATION',
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
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
        FOR UPDATE OF t
        LIMIT 1`;
      const row = rows[0];
      if (!row) return false;
      const scope = this.rowToScope(row);
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
      const existing = readTripDiBoundaryAdmissionV1(scope.rawDetectionMeta);
      if (existing?.revisionKey === revisionKey) return true;

      const patch = buildTripDiBoundaryAdmissionPatch(revisionKey, releasedBy);
      const updated = await tx.$executeRaw`
        UPDATE vehicle_trips t
        SET raw_detection_meta = COALESCE(t.raw_detection_meta, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb
        WHERE t.id = ${tripId}
          AND t.trip_status::text = 'COMPLETED'
          AND t.end_time IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM trip_repairs r
            WHERE r.trip_id = t.id AND r.status = 'PROPOSED'
          )`;
      return updated === 1;
    });
  }

  /** @deprecated Use releaseForBoundaryScannedTripIds — window batch release is not reconciliation-proven. */
  async releaseCompletedTripsInWindow(_vehicleId: string, _from: Date, _to: Date): Promise<number> {
    return 0;
  }

  private rowToScope(row: {
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
  }): TripDiBoundaryAdmissionScope {
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
}
