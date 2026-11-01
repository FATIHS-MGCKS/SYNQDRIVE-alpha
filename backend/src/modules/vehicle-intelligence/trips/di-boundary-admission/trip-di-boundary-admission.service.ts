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
import {
  computeTripDiBoundaryAdmissionRecoveryEligibleFrom,
  isTripDiBoundaryAdmissionRecoveryEnabled,
  isTripDiBoundaryAdmissionRecoveryVehicleEligible,
  readTripDiBoundaryAdmissionRecoveryPolicyFromEnv,
  type TripDiBoundaryAdmissionRecoveryPolicy,
} from './trip-di-boundary-admission-recovery.policy';
import {
  classifyTripDiBoundaryAdmissionRecoveryCandidate,
  listKeysetRecoveryCandidateTripIds,
  listMissingAdmissionRecoveryCandidateTripIds,
} from './trip-di-boundary-admission-recovery.util';
import {
  readTripDiBoundaryAdmissionRecoveryScanCursor,
  writeTripDiBoundaryAdmissionRecoveryScanCursor,
  type TripDiBoundaryAdmissionRecoveryScanCursor,
} from './trip-di-boundary-admission-recovery.cursor';
import type { TripDiBoundaryAdmissionRecoveryFleetBudget } from './trip-di-boundary-admission-recovery.fleet-budget';
import { getTripDiBoundaryAdmissionRecoveryMetrics } from './trip-di-boundary-admission-recovery.metrics';
import { register } from 'prom-client';

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

  /**
   * Bounded durable recovery fallback: idempotent admission for eligible COMPLETED trips when direct hooks fail.
   * Defaults OFF until TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC is set; writer defaults OFF (shadow observe).
   */
  async runDurableAdmissionRecoveryPass(
    organizationId: string,
    vehicleId: string,
    options?: {
      now?: Date;
      policy?: TripDiBoundaryAdmissionRecoveryPolicy;
      fleetBudget?: TripDiBoundaryAdmissionRecoveryFleetBudget;
    },
  ): Promise<{
    mode: 'DISABLED' | 'SHADOW' | 'WRITER';
    scanOutcome:
      | 'disabled'
      | 'none_in_window'
      | 'zero_unadmitted_in_batch'
      | 'cap_truncated'
      | 'unadmitted_observed';
    scanned: number;
    needsRelease: number;
    released: number;
    skipped: number;
    guarded: number;
    alreadyCurrent: number;
    capTruncated: boolean;
    durationMs: number;
  }> {
    const emptyDisabled = (durationMs: number) => ({
      mode: 'DISABLED' as const,
      scanOutcome: 'disabled' as const,
      scanned: 0,
      needsRelease: 0,
      released: 0,
      skipped: 0,
      guarded: 0,
      alreadyCurrent: 0,
      capTruncated: false,
      durationMs,
    });
    const startedMs = Date.now();
    const now = options?.now ?? new Date();
    const policy = options?.policy ?? readTripDiBoundaryAdmissionRecoveryPolicyFromEnv();
    const metrics = getTripDiBoundaryAdmissionRecoveryMetrics(register);

    const setGaugeOutcome = (
      outcome: 'none_in_window' | 'zero_unadmitted_in_batch' | 'cap_truncated' | 'unadmitted_observed',
      ageSec: number,
    ) => {
      for (const label of [
        'none_in_window',
        'zero_unadmitted_in_batch',
        'cap_truncated',
        'unadmitted_observed',
      ] as const) {
        metrics.oldestUnadmittedEligibleAgeSeconds.set({ outcome: label }, label === outcome ? ageSec : 0);
      }
    };

    if (!isTripDiBoundaryAdmissionRecoveryEnabled(policy)) {
      return emptyDisabled(Date.now() - startedMs);
    }
    if (
      !isTripDiBoundaryAdmissionRecoveryVehicleEligible(policy, {
        organizationId,
        vehicleId,
        vehicleOrganizationId: organizationId,
      })
    ) {
      return emptyDisabled(Date.now() - startedMs);
    }
    const eligibleFrom = computeTripDiBoundaryAdmissionRecoveryEligibleFrom(policy, now);
    if (eligibleFrom == null) {
      return emptyDisabled(Date.now() - startedMs);
    }

    const writerActive = policy.writerEnabled;
    const mode: 'SHADOW' | 'WRITER' = writerActive ? 'WRITER' : 'SHADOW';
    if (!writerActive && !policy.shadowObserveEnabled) {
      return emptyDisabled(Date.now() - startedMs);
    }

    metrics.passTotal.inc({ mode });

    const scanLimit = policy.maxTripsPerVehicle;
    const cursor = await readTripDiBoundaryAdmissionRecoveryScanCursor(this.prisma, vehicleId);
    const missingIds = await listMissingAdmissionRecoveryCandidateTripIds(this.prisma, {
      vehicleId,
      eligibleFrom,
      now,
      limit: scanLimit,
    });
    const keysetLimit = Math.max(0, scanLimit - missingIds.length);
    const keysetIds =
      keysetLimit > 0
        ? await listKeysetRecoveryCandidateTripIds(this.prisma, {
            vehicleId,
            eligibleFrom,
            now,
            cursor,
            limit: keysetLimit,
          })
        : [];
    const tripIds = [...missingIds, ...keysetIds.filter((id) => !missingIds.includes(id))];

    const capTruncated =
      missingIds.length >= scanLimit ||
      (keysetLimit > 0 && keysetIds.length >= keysetLimit && tripIds.length >= scanLimit);
    if (capTruncated) {
      metrics.scanCapTruncatedTotal.inc();
    }

    if (tripIds.length === 0) {
      setGaugeOutcome('none_in_window', 0);
      await writeTripDiBoundaryAdmissionRecoveryScanCursor(this.prisma, vehicleId, null);
      const durationMs = Date.now() - startedMs;
      metrics.passDurationMs.observe({ mode }, durationMs);
      return {
        mode,
        scanOutcome: 'none_in_window',
        scanned: 0,
        needsRelease: 0,
        released: 0,
        skipped: 0,
        guarded: 0,
        alreadyCurrent: 0,
        capTruncated: false,
        durationMs,
      };
    }

    let needsRelease = 0;
    let released = 0;
    let skipped = 0;
    let guarded = 0;
    let alreadyCurrent = 0;
    let oldestUnadmittedAgeSec = 0;
    let lastScannedScope: TripDiBoundaryAdmissionScope | null = null;

    let writerAttempts = 0;

    for (const tripId of tripIds) {
      metrics.candidatesScannedTotal.inc();
      const scope = await this.loadScope(tripId);
      if (!scope) {
        skipped += 1;
        continue;
      }
      lastScannedScope = scope;
      const outcome = classifyTripDiBoundaryAdmissionRecoveryCandidate(scope);
      if (outcome.kind === 'ALREADY_CURRENT') {
        alreadyCurrent += 1;
        continue;
      }
      if (outcome.kind === 'GUARDED') {
        guarded += 1;
        metrics.guardRejectedTotal.inc({ code: outcome.code });
        if (outcome.code === 'BOUNDARY_REFRESH_IN_FLIGHT') {
          metrics.revisionMismatchObservedTotal.inc();
        }
        continue;
      }

      needsRelease += 1;
      const existing = readTripDiBoundaryAdmissionV1(scope.rawDetectionMeta);
      if (existing != null) {
        metrics.revisionMismatchObservedTotal.inc();
      }
      const endMs = scope.endTime?.getTime() ?? now.getTime();
      const ageSec = Math.max(0, Math.floor((now.getTime() - endMs) / 1000));
      oldestUnadmittedAgeSec = Math.max(oldestUnadmittedAgeSec, ageSec);

      if (!writerActive) {
        this.logger.log(
          `DI boundary admission recovery SHADOW would release trip=${tripId} vehicle=${vehicleId}`,
        );
        continue;
      }

      const canAttemptWriter =
        options?.fleetBudget != null
          ? options.fleetBudget.consume(1) >= 1
          : writerAttempts < policy.globalMaxPerPass;
      if (!canAttemptWriter) {
        break;
      }
      writerAttempts += 1;

      metrics.admissionAttemptsTotal.inc({ mode: 'WRITER' });
      try {
        const scopeBefore = await this.loadScope(tripId);
        const blockBefore = scopeBefore ? canReleaseTripDiBoundaryAdmission(scopeBefore) : 'TRIP_NOT_COMPLETED';
        const ok = await this.tryReleaseForTripTransactional(tripId, 'RECONCILIATION');
        if (ok) {
          released += 1;
          metrics.admissionsSucceededTotal.inc({ mode: 'WRITER' });
        } else {
          skipped += 1;
          metrics.guardRejectedTotal.inc({ code: blockBefore ?? 'TRIP_NOT_COMPLETED' });
        }
      } catch (err) {
        skipped += 1;
        metrics.transientErrorsTotal.inc();
        this.logger.warn(
          `DI boundary admission recovery release failed trip=${tripId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (lastScannedScope?.endTime && lastScannedScope.tripId) {
      const nextCursor: TripDiBoundaryAdmissionRecoveryScanCursor = {
        endTimeUtc: lastScannedScope.endTime.toISOString(),
        tripId: lastScannedScope.tripId,
      };
      if (tripIds.length < scanLimit) {
        await writeTripDiBoundaryAdmissionRecoveryScanCursor(this.prisma, vehicleId, null);
      } else {
        await writeTripDiBoundaryAdmissionRecoveryScanCursor(this.prisma, vehicleId, nextCursor);
      }
    }

    let scanOutcome: 'zero_unadmitted_in_batch' | 'cap_truncated' | 'unadmitted_observed' =
      'zero_unadmitted_in_batch';
    if (needsRelease > 0) {
      scanOutcome = capTruncated ? 'cap_truncated' : 'unadmitted_observed';
    } else if (capTruncated) {
      scanOutcome = 'cap_truncated';
    }
    setGaugeOutcome(scanOutcome, oldestUnadmittedAgeSec);

    const durationMs = Date.now() - startedMs;
    metrics.passDurationMs.observe({ mode }, durationMs);
    return {
      mode,
      scanOutcome,
      scanned: tripIds.length,
      needsRelease,
      released,
      skipped,
      guarded,
      alreadyCurrent,
      capTruncated,
      durationMs,
    };
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
