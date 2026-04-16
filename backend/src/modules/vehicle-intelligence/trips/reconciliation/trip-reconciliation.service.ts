import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '../../../observability/trip-metrics.service';
import { TripDecisionEngine } from '../decision/trip-decision.engine';
import { TripDetectionPolicyResolver } from '../policy/trip-detection-policy.resolver';
import { TripOverlapDetector } from '../detectors/trip-overlap.detector';
import { IgnitionSegmentDetector } from '../detectors/ignition-segment.detector';
import { MotionSegmentDetector } from '../detectors/motion-segment.detector';
import { ActivityWindowDetector } from '../detectors/activity-window.detector';
import { DETECTION_PHASES } from '../detectors/detector.interfaces';
import type { DetectorFinding } from '../detectors/detector.interfaces';
import {
  REPAIR_TYPES,
  REPAIR_STATUS,
  type ReconciliationResult,
  type ReconciliationTier,
  type TripAnomaly,
} from './reconciliation.types';
import {
  TripDetectionState,
  TripStatus,
  VehicleDetectionProfile,
} from '@prisma/client';
import {
  DimoSegmentsService,
  type DimoTripSegment,
} from '../../../dimo/dimo-segments.service';
import { TripEnrichmentOrchestratorService } from '../trip-enrichment-orchestrator.service';

interface ReconciliationOptions {
  useDimoSegmentFallback?: boolean;
}

interface RepairCandidate {
  source: 'CLICKHOUSE_IGNITION' | 'CLICKHOUSE_MOTION' | 'DIMO_SEGMENT';
  segmentId?: string;
  startTime: Date;
  endTime: Date;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  startDetectionMode: string;
  endDetectionMode: string;
  startLatitude?: number | null;
  startLongitude?: number | null;
  endLatitude?: number | null;
  endLongitude?: number | null;
  distanceKm?: number | null;
  detectorEvidence: Record<string, unknown>;
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value != null;
}

/**
 * TripReconciliationService
 *
 * Replaces the legacy V1 `syncTripsFromSegments` pipeline as the structured
 * reconciliation and repair layer.
 *
 * ARCHITECTURE RULE: This service may NEVER directly call
 * `prisma.vehicleTrip.create()` or update tripStatus. All trip lifecycle
 * mutations go through TripDecisionEngine only.
 *
 * The service:
 * 1. Scans a time window for potential gaps using analytical detectors
 * 2. Checks against existing trips via TripOverlapDetector
 * 3. Creates TripRepair audit records for proposed repairs
 * 4. Applies high-confidence repairs via TripDecisionEngine
 * 5. Leaves low-confidence repairs as PROPOSED for review or auto-expiry
 */
@Injectable()
export class TripReconciliationService {
  private readonly logger = new Logger(TripReconciliationService.name);
  private readonly MISSING_END_REPAIR_GRACE_MS = 15 * 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly decisionEngine: TripDecisionEngine,
    private readonly policyResolver: TripDetectionPolicyResolver,
    private readonly overlapDetector: TripOverlapDetector,
    private readonly dimoSegments: DimoSegmentsService,
    @Optional() private readonly ignitionDetector: IgnitionSegmentDetector,
    @Optional() private readonly motionDetector: MotionSegmentDetector,
    @Optional() private readonly activityDetector: ActivityWindowDetector,
    @Optional()
    @Inject(forwardRef(() => TripEnrichmentOrchestratorService))
    private readonly enrichmentOrchestrator?: TripEnrichmentOrchestratorService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  // ─── TIERED RECONCILIATION ─────────────────────────────────────────────────

  /**
   * Reconciles a specific time window for a vehicle.
   * Called by tiered schedulers (fast/warm/cold) or manual trigger.
   */
  async reconcileWindow(
    vehicleId: string,
    from: Date,
    to: Date,
    tier: ReconciliationTier,
    options?: ReconciliationOptions,
  ): Promise<ReconciliationResult> {
    const startedMs = Date.now();
    let repairsProposed = 0;
    let repairsApplied = 0;
    let repairsRejected = 0;

    try {
      // ── Step 1: Fix stale ongoing trips in this window ──────────────────
      await this.repairStaleOngoingTrips(vehicleId, to);

      // ── Step 2: Look for missing trips in the window ────────────────────
      const missingTripRepairs = await this.detectAndRepairMissingTrips(
        vehicleId,
        from,
        to,
        options,
      );
      repairsProposed += missingTripRepairs.proposed;
      repairsApplied += missingTripRepairs.applied;
      repairsRejected += missingTripRepairs.rejected;

      // ── Step 3: Fix open trips with missing end in window ───────────────
      const missingEndRepairs = await this.repairMissingEnds(
        vehicleId,
        from,
        to,
      );
      repairsProposed += missingEndRepairs.proposed;
      repairsApplied += missingEndRepairs.applied;
      repairsRejected += missingEndRepairs.rejected;

    } catch (err: unknown) {
      this.logger.warn(
        `Reconciliation failed for vehicle ${vehicleId} [${tier}]: ${(err as Error).message}`,
      );
    }

    return {
      vehicleId,
      tier,
      windowFrom: from,
      windowTo: to,
      repairsProposed,
      repairsApplied,
      repairsRejected,
      durationMs: Date.now() - startedMs,
    };
  }

  /**
   * Manual reconciliation triggered by the user (replaces old "Sync Trips" button).
   * Uses the warm window (last 12 hours) for a responsive manual check.
   */
  async triggerManualReconciliation(
    vehicleId: string,
    options?: {
      from?: Date;
      to?: Date;
      useDimoSegmentFallback?: boolean;
    },
  ): Promise<ReconciliationResult> {
    const to = options?.to ?? new Date();
    const from = options?.from ?? new Date(to.getTime() - 12 * 3600_000);
    this.logger.log(`Manual reconciliation triggered for vehicle ${vehicleId}`);
    return this.reconcileWindow(vehicleId, from, to, 'warm', {
      useDimoSegmentFallback: options?.useDimoSegmentFallback ?? true,
    });
  }

  // ─── EVENT-TRIGGERED REPAIRS ───────────────────────────────────────────────

  async onStuckTrip(vehicleId: string, tripId: string): Promise<void> {
    this.logger.log(`Event: stuck trip detected — vehicle=${vehicleId} trip=${tripId}`);
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { id: true, startTime: true, endTime: true, tripStatus: true },
    });
    if (!trip || trip.tripStatus !== TripStatus.ONGOING) return;

    const to = new Date();
    const from = new Date(trip.startTime.getTime() - 5 * 60_000);

    await this.repairMissingEnds(vehicleId, from, to);
  }

  async onEnrichmentFailure(tripId: string): Promise<void> {
    this.logger.log(`Event: enrichment failure — trip=${tripId}`);
    // For now, log and let cold repair handle quality cleanup.
    // Future: flag trip for quality_check reconciliation.
  }

  async onAnomalyDetected(anomaly: TripAnomaly): Promise<void> {
    this.logger.log(
      `Event: anomaly detected — vehicle=${anomaly.vehicleId} type=${anomaly.type}`,
    );
    await this.reconcileWindow(
      anomaly.vehicleId,
      anomaly.windowFrom,
      anomaly.windowTo,
      'fast',
      { useDimoSegmentFallback: true },
    );
  }

  // ─── INTERNAL REPAIR METHODS ───────────────────────────────────────────────

  private async repairStaleOngoingTrips(
    vehicleId: string,
    asOf: Date,
  ): Promise<void> {
    const STALE_THRESHOLD_MS = 2 * 3600_000; // 2 hours

    const staleTrips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId,
        tripStatus: TripStatus.ONGOING,
        startTime: { lt: new Date(asOf.getTime() - STALE_THRESHOLD_MS) },
      },
      select: { id: true, startTime: true, endTime: true },
      orderBy: { startTime: 'asc' },
    });

    for (const trip of staleTrips) {
      this.logger.warn(
        `Repairing stale ONGOING trip ${trip.id} for vehicle ${vehicleId}`,
      );

      // Create audit record
      const repair = await this.prisma.tripRepair.create({
        data: {
          vehicleId,
          tripId: trip.id,
          repairType: REPAIR_TYPES.STALE_ONGOING,
          status: REPAIR_STATUS.PROPOSED,
          reason: 'Trip stuck in ONGOING state for over 2 hours',
          confidence: 'HIGH',
          windowFrom: trip.startTime,
          windowTo: asOf,
        },
      });

      try {
        // Use lastActivityAt from detection state or derive from waypoints
        const detState = await this.prisma.vehicleTripDetectionState.findUnique({
          where: { vehicleId },
          select: { lastActivityAt: true, possibleEndAt: true },
        });

        const lastWaypoint = await this.prisma.vehicleTripWaypoint.findFirst({
          where: { tripId: trip.id },
          orderBy: { recordedAt: 'desc' },
          select: { recordedAt: true },
        });

        const estimatedEnd =
          detState?.possibleEndAt ??
          detState?.lastActivityAt ??
          lastWaypoint?.recordedAt ??
          new Date(trip.startTime.getTime() + 3600_000);

        await this.decisionEngine.finalizeRepairedTrip(trip.id, {
          endTime: estimatedEnd,
          endDetectionMode: 'STALE_ONGOING_REPAIR',
        });

        await this.prisma.tripRepair.update({
          where: { id: repair.id },
          data: {
            status: REPAIR_STATUS.APPLIED,
            appliedAt: new Date(),
          },
        });

        this.tripMetrics?.repairActions.inc({ type: REPAIR_TYPES.STALE_ONGOING, result: 'applied' });
        this.logger.log(`Stale trip ${trip.id} repaired for vehicle ${vehicleId}`);
      } catch (err: unknown) {
        await this.prisma.tripRepair.update({
          where: { id: repair.id },
          data: { status: REPAIR_STATUS.REJECTED, reason: `Repair failed: ${(err as Error).message}` },
        });
        this.tripMetrics?.repairActions.inc({ type: REPAIR_TYPES.STALE_ONGOING, result: 'rejected' });
      }
    }
  }

  private async detectAndRepairMissingTrips(
    vehicleId: string,
    from: Date,
    to: Date,
    options?: ReconciliationOptions,
  ): Promise<{ proposed: number; applied: number; rejected: number }> {
    let proposed = 0;
    let applied = 0;
    let rejected = 0;

    if (!this.ignitionDetector && !this.motionDetector && !options?.useDimoSegmentFallback) {
      return { proposed, applied, rejected };
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        organizationId: true,
        dimoVehicle: { select: { tokenId: true } },
        tripDetectionState: { select: { detectionProfile: true } },
      },
    });
    if (!vehicle) return { proposed, applied, rejected };

    const profile =
      vehicle?.tripDetectionState?.detectionProfile ?? VehicleDetectionProfile.UNKNOWN;
    const dimoTokenId = vehicle.dimoVehicle?.tokenId ?? 0;
    const repairCandidates = await this.collectRepairCandidates(
      vehicleId,
      from,
      to,
      profile,
      dimoTokenId,
      options,
    );

    for (const candidate of repairCandidates) {
      const segStart = candidate.startTime;
      const segEnd = candidate.endTime;

      const overlapFinding = await this.overlapDetector.evaluate({
        vehicleId,
        dimoTokenId,
        profile,
        phase: DETECTION_PHASES.DUPLICATE_OR_OVERLAP_CHECK,
        candidateStart: segStart,
        candidateEnd: segEnd,
      } as any);

      if (overlapFinding.verdict === 'TRIGGERED') continue;

      const repair = await this.prisma.tripRepair.create({
        data: {
          vehicleId,
          repairType: REPAIR_TYPES.MISSING_TRIP,
          status: REPAIR_STATUS.PROPOSED,
          reason: candidate.reason,
          confidence: candidate.confidence,
          windowFrom: segStart,
          windowTo: segEnd,
          detectorEvidence: JSON.parse(JSON.stringify(candidate.detectorEvidence)),
        },
      });
      proposed++;

      const effectiveConfidence = await this.resolveEffectiveConfidence(
        vehicleId,
        profile,
        dimoTokenId,
        candidate,
      );

      if (effectiveConfidence === 'HIGH' || effectiveConfidence === 'MEDIUM') {
        try {
          const trip = await this.decisionEngine.createRepairedTrip({
            vehicleId,
            organizationId: vehicle.organizationId ?? null,
            dimoSegmentId: candidate.segmentId,
            startTime: segStart,
            startLatitude: candidate.startLatitude ?? null,
            startLongitude: candidate.startLongitude ?? null,
            detectionProfile: profile,
            startDetectionMode: candidate.startDetectionMode,
            startConfidence: effectiveConfidence,
          });
          await this.decisionEngine.finalizeRepairedTrip(trip.id, {
            endTime: segEnd,
            endLatitude: candidate.endLatitude ?? null,
            endLongitude: candidate.endLongitude ?? null,
            endDetectionMode: candidate.endDetectionMode,
            endConfidence: effectiveConfidence,
            durationMs: segEnd.getTime() - segStart.getTime(),
            distanceKm: candidate.distanceKm ?? null,
            rawDetectionMeta: candidate.detectorEvidence,
          });
          await this.prisma.tripRepair.update({
            where: { id: repair.id },
            data: {
              tripId: trip.id,
              status: REPAIR_STATUS.APPLIED,
              appliedAt: new Date(),
            },
          });
          if (vehicle.organizationId != null) {
            await this.enqueueRepairEnrichment(
              trip.id,
              vehicleId,
              vehicle.organizationId,
            );
          }
          applied++;
          this.tripMetrics?.repairActions.inc({
            type: REPAIR_TYPES.MISSING_TRIP,
            result: 'applied',
          });
          this.logger.log(
            `Missing trip repaired for vehicle ${vehicleId}: ${segStart.toISOString()} → ${segEnd.toISOString()}`,
          );
        } catch (err: unknown) {
          await this.prisma.tripRepair.update({
            where: { id: repair.id },
            data: { status: REPAIR_STATUS.REJECTED, reason: (err as Error).message },
          });
          rejected++;
          this.tripMetrics?.repairActions.inc({
            type: REPAIR_TYPES.MISSING_TRIP,
            result: 'rejected',
          });
        }
      }
    }

    return { proposed, applied, rejected };
  }

  private async collectRepairCandidates(
    vehicleId: string,
    from: Date,
    to: Date,
    profile: VehicleDetectionProfile,
    dimoTokenId: number,
    options?: ReconciliationOptions,
  ): Promise<RepairCandidate[]> {
    const candidates: RepairCandidate[] = [];

    if (this.ignitionDetector) {
      const ignFinding = await this.ignitionDetector.evaluate({
        vehicleId,
        dimoTokenId,
        profile,
        phase: DETECTION_PHASES.REPAIR_MISSING_TRIP,
        timeWindow: { from, to },
      });
      const ignitionCandidates = this.buildIgnitionCandidates(ignFinding);
      candidates.push(...ignitionCandidates);
      if (ignitionCandidates.length > 0) {
        this.tripMetrics?.tripEvidencePaths.inc({
          phase: 'reconciliation',
          path: 'CLICKHOUSE_IGNITION',
        });
      }
    }

    const useMotionFallback =
      this.motionDetector &&
      candidates.length === 0 &&
      (profile === 'EV' || profile === 'HYBRID' || profile === 'UNKNOWN');

    if (useMotionFallback) {
      const motionFinding = await this.motionDetector!.evaluate({
        vehicleId,
        dimoTokenId,
        profile,
        phase: DETECTION_PHASES.REPAIR_MISSING_TRIP,
        timeWindow: { from, to },
      });
      const motionCandidates = this.buildMotionCandidates(motionFinding);
      candidates.push(...motionCandidates);
      if (motionCandidates.length > 0) {
        this.tripMetrics?.tripEvidencePaths.inc({
          phase: 'reconciliation',
          path: 'CLICKHOUSE_MOTION',
        });
      }
    }

    if (options?.useDimoSegmentFallback && dimoTokenId > 0) {
      const dimoSegments = await this.dimoSegments.fetchTripSegments(
        dimoTokenId,
        from,
        to,
      );
      const dimoCandidates = this.buildDimoSegmentCandidates(dimoSegments);
      candidates.push(...dimoCandidates);
      if (dimoCandidates.length > 0) {
        this.tripMetrics?.tripEvidencePaths.inc({
          phase: 'reconciliation',
          path: 'DIMO_SEGMENT',
        });
      }
    }

    return this.dedupeRepairCandidates(candidates);
  }

  private buildIgnitionCandidates(finding: DetectorFinding): RepairCandidate[] {
    if (finding.verdict !== 'TRIGGERED') return [];

    const segments = (finding.evidence?.segments as Array<{
      start: string;
      end: string;
      durationMs: number;
      confidence: string;
    }> | undefined) ?? [];

    return segments
      .map((segment) => {
        const startTime = new Date(segment.start);
        const endTime = new Date(segment.end);
        if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
          return null;
        }

        return {
          source: 'CLICKHOUSE_IGNITION' as const,
          startTime,
          endTime,
          confidence: this.normalizeConfidence(segment.confidence),
          reason: 'Ignition segment found with no matching trip record',
          startDetectionMode: 'IGNITION_SEGMENT_REPAIR',
          endDetectionMode: 'IGNITION_SEGMENT_REPAIR',
          detectorEvidence: {
            repairSource: 'CLICKHOUSE_IGNITION',
            ignitionFinding: finding.evidence,
            segment,
          },
        };
      })
      .filter(isDefined);
  }

  private buildMotionCandidates(finding: DetectorFinding): RepairCandidate[] {
    if (finding.verdict !== 'TRIGGERED') return [];

    const segments = (finding.evidence?.segments as Array<{
      start: string;
      end: string;
      durationMs: number;
      confidence: string;
    }> | undefined) ?? [];

    return segments
      .map((segment) => {
        const startTime = new Date(segment.start);
        const endTime = new Date(segment.end);
        if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
          return null;
        }

        return {
          source: 'CLICKHOUSE_MOTION' as const,
          startTime,
          endTime,
          confidence: this.normalizeConfidence(segment.confidence),
          reason: 'Motion segment found with no matching trip record (EV fallback)',
          startDetectionMode: 'MOTION_SEGMENT_REPAIR',
          endDetectionMode: 'MOTION_SEGMENT_REPAIR',
          detectorEvidence: {
            repairSource: 'CLICKHOUSE_MOTION',
            motionFinding: finding.evidence,
            segment,
          },
        };
      })
      .filter(isDefined);
  }

  private buildDimoSegmentCandidates(
    segments: DimoTripSegment[],
  ): RepairCandidate[] {
    return segments
      .filter((segment) => !segment.isOngoing && !segment.startedBeforeRange)
      .map((segment) => {
        if (!segment.endTime) return null;

        const startTime = new Date(segment.startTime);
        const endTime = new Date(segment.endTime);
        if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
          return null;
        }

        return {
          source: 'DIMO_SEGMENT' as const,
          segmentId: segment.segmentId,
          startTime,
          endTime,
          confidence: this.inferDimoSegmentConfidence(segment),
          reason: `DIMO ${segment.mechanism} segment found with no matching trip record`,
          startDetectionMode: `DIMO_${segment.mechanism}_REPAIR`,
          endDetectionMode: `DIMO_${segment.mechanism}_REPAIR`,
          startLatitude: segment.startLatitude,
          startLongitude: segment.startLongitude,
          endLatitude: segment.endLatitude,
          endLongitude: segment.endLongitude,
          distanceKm: segment.distanceKm,
          detectorEvidence: {
            repairSource: 'DIMO_SEGMENT',
            dimoSegment: segment,
          },
        };
      })
      .filter(isDefined);
  }

  private async resolveEffectiveConfidence(
    vehicleId: string,
    profile: VehicleDetectionProfile,
    dimoTokenId: number,
    candidate: RepairCandidate,
  ): Promise<'LOW' | 'MEDIUM' | 'HIGH'> {
    let effectiveConfidence = candidate.confidence;

    if (
      candidate.source === 'CLICKHOUSE_IGNITION' &&
      this.activityDetector &&
      (effectiveConfidence === 'HIGH' || effectiveConfidence === 'MEDIUM')
    ) {
      const actFinding = await this.activityDetector.evaluate({
        vehicleId,
        dimoTokenId,
        profile,
        phase: DETECTION_PHASES.REPAIR_MISSING_TRIP,
        timeWindow: { from: candidate.startTime, to: candidate.endTime },
      });
      if (actFinding.verdict === 'NOT_TRIGGERED') {
        effectiveConfidence = 'LOW';
        this.logger.debug(
          `Ignition segment downgraded (no activity): ${candidate.startTime.toISOString()} for vehicle ${vehicleId}`,
        );
      }
    }

    return effectiveConfidence;
  }

  private dedupeRepairCandidates(
    candidates: RepairCandidate[],
  ): RepairCandidate[] {
    const deduped: RepairCandidate[] = [];

    for (const candidate of candidates.sort((a, b) => {
      const delta = a.startTime.getTime() - b.startTime.getTime();
      if (delta !== 0) return delta;
      return this.candidateRank(b) - this.candidateRank(a);
    })) {
      const existingIdx = deduped.findIndex((existing) =>
        this.windowsNearlyOverlap(existing, candidate),
      );

      if (existingIdx === -1) {
        deduped.push(candidate);
        continue;
      }

      if (this.candidateRank(candidate) > this.candidateRank(deduped[existingIdx])) {
        deduped[existingIdx] = candidate;
      }
    }

    return deduped;
  }

  private candidateRank(candidate: RepairCandidate): number {
    const confidenceRank =
      candidate.confidence === 'HIGH'
        ? 30
        : candidate.confidence === 'MEDIUM'
          ? 20
          : 10;
    const sourceRank = candidate.source === 'DIMO_SEGMENT' ? 2 : 1;
    return confidenceRank + sourceRank;
  }

  private windowsNearlyOverlap(
    left: RepairCandidate,
    right: RepairCandidate,
  ): boolean {
    const TOLERANCE_MS = 2 * 60_000;
    return (
      Math.abs(left.startTime.getTime() - right.startTime.getTime()) <=
        TOLERANCE_MS &&
      Math.abs(left.endTime.getTime() - right.endTime.getTime()) <=
        TOLERANCE_MS
    );
  }

  private inferDimoSegmentConfidence(
    segment: DimoTripSegment,
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (
      segment.durationSeconds >= 10 * 60 &&
      (segment.distanceKm ?? 0) >= 1
    ) {
      return 'HIGH';
    }
    if (
      segment.durationSeconds >= 3 * 60 ||
      (segment.distanceKm ?? 0) >= 0.3
    ) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  private normalizeConfidence(
    value: string | null | undefined,
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (value === 'HIGH' || value === 'MEDIUM' || value === 'LOW') {
      return value;
    }
    return 'LOW';
  }

  private async enqueueRepairEnrichment(
    tripId: string,
    vehicleId: string,
    organizationId: string,
  ): Promise<void> {
    if (!this.enrichmentOrchestrator) return;

    try {
      await this.enrichmentOrchestrator.enqueueBehaviorEnrichment(
        tripId,
        vehicleId,
        organizationId,
        { delayMs: 0 },
      );
    } catch (err) {
      this.logger.debug(
        `Repair enrichment enqueue failed for trip ${tripId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async repairMissingEnds(
    vehicleId: string,
    from: Date,
    to: Date,
  ): Promise<{ proposed: number; applied: number; rejected: number }> {
    let proposed = 0;
    let applied = 0;
    let rejected = 0;

    const openTrips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId,
        tripStatus: TripStatus.ONGOING,
        startTime: { gte: from, lte: to },
      },
      select: { id: true, startTime: true },
    });

    const detState = await this.prisma.vehicleTripDetectionState.findUnique({
      where: { vehicleId },
      select: {
        state: true,
        activeTripId: true,
        possibleEndAt: true,
        lastActivityAt: true,
        updatedAt: true,
      },
    });

    for (const trip of openTrips) {
      const lastWaypoint = await this.prisma.vehicleTripWaypoint.findFirst({
        where: { tripId: trip.id },
        orderBy: { recordedAt: 'desc' },
        select: { recordedAt: true },
      });
      const latestKnownActivityAt =
        lastWaypoint?.recordedAt ??
        (detState?.activeTripId === trip.id ? detState.lastActivityAt : null) ??
        trip.startTime;

      const isLiveOwnedTrip =
        detState?.activeTripId === trip.id &&
        detState.state != null &&
        detState.state !== TripDetectionState.RESTING;
      const isWithinGrace =
        to.getTime() - latestKnownActivityAt.getTime() <
        this.MISSING_END_REPAIR_GRACE_MS;

      if (isLiveOwnedTrip || isWithinGrace) {
        this.logger.debug(
          `Skipping missing-end repair for ${trip.id}: ` +
            `${isLiveOwnedTrip ? 'live_fsm_owns_trip' : 'recent_activity_within_grace'}`,
        );
        continue;
      }

      const repair = await this.prisma.tripRepair.create({
        data: {
          vehicleId,
          tripId: trip.id,
          repairType: REPAIR_TYPES.MISSING_END,
          status: REPAIR_STATUS.PROPOSED,
          reason: 'Trip has no end time but falls within reconciliation window',
          confidence: 'MEDIUM',
          windowFrom: trip.startTime,
          windowTo: to,
        },
      });
      proposed++;

      // Estimate end time as window end (cold fallback)
      try {
        const estimatedEnd = lastWaypoint?.recordedAt ?? to;

        await this.decisionEngine.finalizeRepairedTrip(trip.id, {
          endTime: estimatedEnd,
          endDetectionMode: 'MISSING_END_REPAIR',
        });
        await this.prisma.tripRepair.update({
          where: { id: repair.id },
          data: { status: REPAIR_STATUS.APPLIED, appliedAt: new Date() },
        });
        applied++;
        this.tripMetrics?.repairActions.inc({ type: REPAIR_TYPES.MISSING_END, result: 'applied' });
        this.logger.log(`Missing-end trip ${trip.id} repaired for vehicle ${vehicleId}`);
      } catch (err: unknown) {
        await this.prisma.tripRepair.update({
          where: { id: repair.id },
          data: { status: REPAIR_STATUS.REJECTED, reason: (err as Error).message },
        });
        rejected++;
        this.tripMetrics?.repairActions.inc({ type: REPAIR_TYPES.MISSING_END, result: 'rejected' });
      }
    }

    return { proposed, applied, rejected };
  }
}
