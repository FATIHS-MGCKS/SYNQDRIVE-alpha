import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '../../../observability/trip-metrics.service';
import { isClickHouseTripAssistEnabled } from '@modules/clickhouse/clickhouse-env.util';
import { TripDecisionEngine } from '../decision/trip-decision.engine';
import { TripDetectionPolicyResolver } from '../policy/trip-detection-policy.resolver';
import { END_DETECTION_MODES } from '../trip-detection.types';
import {
  extractLatestSegmentEnd,
  resolveAnalyticsAssistedEndDecision,
} from '../trip-evidence.helpers';
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
import { TripPostFinalizeAnalysisProducer } from '../../driving-analysis-init/trip-post-finalize-analysis.producer';
import { EnergyEventsService } from '../../energy-events/energy-events.service';

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

// Shape returned by the intra-trip gap scanner. All fields are derived
// from VehicleTripWaypoint rows for the current trip (see findWaypointGapForSplit).
interface IntraTripGap {
  gapMs: number;
  driftM: number;
  firstEndAt: Date;
  firstEndLat: number;
  firstEndLng: number;
  secondStartAt: Date;
  secondStartLat: number;
  secondStartLng: number;
  preWaypointCount: number;
  postWaypointCount: number;
  seg1DistanceKm: number;
  seg2DistanceKm: number;
}

// Narrow trip projection used by the retro split scanner. Mirrors the
// `select` shape in `repairIntraTripGapSplits` + the follow-up lookup on
// segment 2 after a split so the recursion stays strictly typed.
interface IntraGapTripRow {
  id: string;
  startTime: Date;
  endTime: Date | null;
  endLatitude: number | null;
  endLongitude: number | null;
  distanceKm: number | null;
  detectionProfile: VehicleDetectionProfile | null;
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

  // ─── Retroactive mid-trip gap-split thresholds ─────────────────────────
  // Mirrors TripDetectionOrchestrationService's live-path constants so the
  // two paths stay in lock-step and can't diverge silently.
  private readonly TRIP_MID_GAP_SPLIT_MS: number;
  private readonly TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M: number;
  private readonly TRIP_MID_GAP_MIN_PRE_DURATION_MS: number;
  // Hard cap to prevent pathological recursion when a single trip contains
  // many gaps (e.g., long valet rides with multiple stops).
  private readonly TRIP_MID_GAP_MAX_SPLITS_PER_TRIP = 6;
  private readonly TRIP_END_CH_ASSIST_MIN_STATIONARY_MS: number;
  private readonly TRIP_END_CH_ASSIST_MIN_TRIP_DURATION_MS: number;
  private readonly TRIP_END_CH_ASSIST_HIGH_STATIONARY_MS: number;

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
    @Optional()
    private readonly postFinalizeAnalysisProducer?: TripPostFinalizeAnalysisProducer,
    @Optional() private readonly tripMetrics?: TripMetricsService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly energyEventsService?: EnergyEventsService,
  ) {
    this.TRIP_MID_GAP_SPLIT_MS =
      this.configService?.get<number>('worker.tripMidGapSplitMs') ?? 180_000;
    this.TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M =
      this.configService?.get<number>(
        'worker.tripMidGapMaxStationaryDriftM',
      ) ?? 200;
    this.TRIP_MID_GAP_MIN_PRE_DURATION_MS =
      this.configService?.get<number>(
        'worker.tripMidGapMinPreDurationMs',
      ) ?? 60_000;
    this.TRIP_END_CH_ASSIST_MIN_STATIONARY_MS =
      this.configService?.get<number>('worker.tripEndChAssistMinStationaryMs') ??
      45_000;
    this.TRIP_END_CH_ASSIST_MIN_TRIP_DURATION_MS =
      this.configService?.get<number>('worker.tripEndChAssistMinTripDurationMs') ??
      60_000;
    this.TRIP_END_CH_ASSIST_HIGH_STATIONARY_MS =
      this.configService?.get<number>(
        'worker.tripEndChAssistHighConfidenceStationaryMs',
      ) ?? 90_000;
  }

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

      // ── Step 4: Retroactive intra-trip gap splits ───────────────────────
      // Scans completed trips in the window and splits them at mid-trip
      // stationary silences that the live FSM missed (e.g., the Mercedes
      // case from 17.04.2026 where DIMO went silent during an engine-off
      // stop and resumed on restart without emitting an ignition-off event).
      const intraTripGapRepairs = await this.repairIntraTripGapSplits(
        vehicleId,
        from,
        to,
        tier,
      );
      repairsProposed += intraTripGapRepairs.proposed;
      repairsApplied += intraTripGapRepairs.applied;
      repairsRejected += intraTripGapRepairs.rejected;

      // ── Step 5: Detect refuel / recharge events in the same window ─────
      // Purely additive: runs on the identical window but writes to the
      // `vehicle_energy_events` table, never to VehicleTrip. Failures here
      // must not abort trip reconciliation — they are isolated in a try
      // block of their own.
      if (this.energyEventsService) {
        try {
          await this.energyEventsService.detectEnergyEvents(vehicleId, {
            from,
            to,
          });
        } catch (err: unknown) {
          this.logger.warn(
            `Energy-event detection failed for vehicle ${vehicleId}: ${(err as Error).message}`,
          );
        }
      }
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

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    const organizationId = vehicle?.organizationId ?? null;

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

        const orgId = organizationId;
        if (orgId) {
          await this.enqueueRepairEnrichment(trip.id, vehicleId, orgId);
        }

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

      if (overlapFinding.verdict === 'TRIGGERED') {
        this.tripMetrics?.duplicateCandidates.inc();
        continue;
      }

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
    const chAssistEnabled = isClickHouseTripAssistEnabled();

    if (chAssistEnabled && this.ignitionDetector) {
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

    // Motion fallback / augmentation.
    // Old behavior: only run when ignition returned zero candidates. That
    // was wrong for EVs — a single ignition segment (often from stale device
    // state) was enough to suppress motion entirely, even though motion
    // represents the actual ground truth for Tesla-style vehicles with no
    // ignition telemetry. New behavior:
    //   - EV / HYBRID / UNKNOWN: always run motion (then dedupe).
    //   - ICE: run only as fallback when ignition produced nothing.
    const motionProfileEligible =
      profile === 'EV' || profile === 'HYBRID' || profile === 'UNKNOWN';
    const useMotionFallback =
      chAssistEnabled &&
      this.motionDetector &&
      (motionProfileEligible || candidates.length === 0);

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

    if (candidates.length > 0) {
      this.tripMetrics?.missingTripCandidates.inc(
        { tier: 'reconciliation' },
        candidates.length,
      );
    }

    const deduped = this.dedupeRepairCandidates(candidates);
    return deduped;
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
    if (this.postFinalizeAnalysisProducer) {
      await this.postFinalizeAnalysisProducer.produceAfterPersistedCompletion({
        tripId,
        vehicleId,
        organizationId,
        source: 'REPAIR_FINALIZE',
      });
    }

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

  // ═══════════════════════════════════════════════════════════════════════
  //  INTRA-TRIP GAP SPLIT (retroactive path)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Mirrors TripDetectionOrchestrationService's live mid-gap split on
  // already-finalized trips. Walks VehicleTripWaypoint records for each
  // completed trip in [from, to] and finds the largest eligible "stationary
  // silence" between consecutive waypoints. If the vehicle stayed in place
  // (drift <= TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M) for at least
  // TRIP_MID_GAP_SPLIT_MS, the trip is split into two canonical trips via
  // `TripDecisionEngine.splitTripAtGap`. Segment 2 is then finalized with
  // the original trip's endTime/endLat/endLng so both segments appear as
  // completed trips in the timeline.
  //
  // Why waypoint-first (not core-data)?
  // - Waypoints are our own canonical record. They're always present for
  //   any tracked trip, no DIMO core re-fetch needed.
  // - GPS drift between pre/post-gap waypoints is the strongest signal
  //   that the vehicle actually stopped (vs. signal dropout while driving).
  private async repairIntraTripGapSplits(
    vehicleId: string,
    from: Date,
    to: Date,
    tier: ReconciliationTier,
  ): Promise<{ proposed: number; applied: number; rejected: number }> {
    let proposed = 0;
    let applied = 0;
    let rejected = 0;

    // Only scan completed trips — ongoing trips are owned by the live FSM
    // which has its own mid-gap split detection in processActiveTick.
    const completedTrips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId,
        tripStatus: TripStatus.COMPLETED,
        startTime: { gte: from, lt: to },
        endTime: { not: null },
        // Skip trips that were themselves produced by an earlier split pass
        // to avoid repeatedly re-analyzing the same lineage. The second trip
        // of a prior split still gets scanned for further splits.
        NOT: { endDetectionMode: 'MID_TRIP_GAP_SPLIT' },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        endLatitude: true,
        endLongitude: true,
        distanceKm: true,
        detectionProfile: true,
      },
      orderBy: { startTime: 'asc' },
    });

    for (const trip of completedTrips) {
      try {
        const counts = await this.splitCompletedTripRecursively(
          trip as IntraGapTripRow,
          vehicleId,
          tier,
        );
        proposed += counts.proposed;
        applied += counts.applied;
        rejected += counts.rejected;
      } catch (err: unknown) {
        this.logger.warn(
          `repairIntraTripGapSplits failed for trip ${trip.id}: ${(err as Error).message}`,
        );
      }
    }

    return { proposed, applied, rejected };
  }

  /**
   * Splits a single completed trip at the largest eligible mid-trip gap.
   * After a successful split, the new second segment (still completed,
   * since we preserve the original endTime) is re-scanned for further
   * gaps. A hard cap prevents pathological recursion.
   */
  private async splitCompletedTripRecursively(
    trip: IntraGapTripRow,
    vehicleId: string,
    tier: ReconciliationTier,
  ): Promise<{ proposed: number; applied: number; rejected: number }> {
    let proposed = 0;
    let applied = 0;
    let rejected = 0;

    let current: IntraGapTripRow = trip;
    for (let iter = 0; iter < this.TRIP_MID_GAP_MAX_SPLITS_PER_TRIP; iter++) {
      const gap = await this.findWaypointGapForSplit(current);
      if (!gap) break;

      proposed++;

      const repair = await this.prisma.tripRepair.create({
        data: {
          vehicleId,
          tripId: current.id,
          repairType: REPAIR_TYPES.INTRA_TRIP_GAP_SPLIT,
          status: REPAIR_STATUS.PROPOSED,
          reason:
            `Waypoint silence of ${Math.round(gap.gapMs / 1000)}s with drift ` +
            `${gap.driftM != null ? `${Math.round(gap.driftM)}m` : 'unknown'} ` +
            `(tier=${tier})`,
          confidence: 'MEDIUM',
          windowFrom: gap.firstEndAt,
          windowTo: gap.secondStartAt,
          detectorEvidence: {
            repairSource: 'INTRA_TRIP_WAYPOINT_GAP',
            gapMs: gap.gapMs,
            driftM: gap.driftM,
            firstEndAt: gap.firstEndAt.toISOString(),
            secondStartAt: gap.secondStartAt.toISOString(),
            preWaypointCount: gap.preWaypointCount,
            postWaypointCount: gap.postWaypointCount,
            seg1DistanceKm: gap.seg1DistanceKm,
            seg2DistanceKm: gap.seg2DistanceKm,
            originalTripStart: current.startTime.toISOString(),
            originalTripEnd: current.endTime!.toISOString(),
          },
        },
      });

      try {
        const splitResult = await this.decisionEngine.splitTripAtGap({
          tripId: current.id,
          firstEndAt: gap.firstEndAt,
          firstEndLatitude: gap.firstEndLat,
          firstEndLongitude: gap.firstEndLng,
          firstEndDistanceKm: gap.seg1DistanceKm,
          secondStartAt: gap.secondStartAt,
          secondStartLatitude: gap.secondStartLat,
          secondStartLongitude: gap.secondStartLng,
          gapMs: gap.gapMs,
          detectionProfile: current.detectionProfile
            ? String(current.detectionProfile)
            : undefined,
          reason: 'retroactive_intra_trip_gap_split',
          triggeredBy: 'RECONCILIATION',
        });

        // splitTripAtGap leaves segment 2 as ONGOING (because the live FSM
        // typically owns the continuation). In the retro path we already
        // know the original trip's end, so finalize segment 2 immediately
        // with the preserved endpoint.
        const origEndTime = current.endTime!;
        await this.decisionEngine.finalizeRepairedTrip(
          splitResult.secondTripId,
          {
            endTime: origEndTime,
            endLatitude: current.endLatitude ?? null,
            endLongitude: current.endLongitude ?? null,
            endDetectionMode: 'INTRA_TRIP_GAP_SPLIT_REPAIR',
            endConfidence: 'MEDIUM',
            durationMs: origEndTime.getTime() - gap.secondStartAt.getTime(),
            distanceKm: gap.seg2DistanceKm,
            rawDetectionMeta: {
              splitFrom: current.id,
              splitReason: 'retroactive_intra_trip_gap_split',
              splitTriggeredBy: 'RECONCILIATION',
              splitGapMs: gap.gapMs,
              splitDriftM: gap.driftM,
              originalTripEnd: origEndTime.toISOString(),
            },
          },
        );

        await this.prisma.tripRepair.update({
          where: { id: repair.id },
          data: {
            status: REPAIR_STATUS.APPLIED,
            appliedAt: new Date(),
            tripId: splitResult.firstTripId,
          },
        });

        applied++;
        this.tripMetrics?.repairActions.inc({
          type: REPAIR_TYPES.INTRA_TRIP_GAP_SPLIT,
          result: 'applied',
        });
        this.tripMetrics?.tripEvidencePaths.inc({
          phase: 'mid_gap_split',
          path: 'reconciliation',
        });
        this.logger.log(
          `INTRA_TRIP_GAP_SPLIT retro: vehicle=${vehicleId} ` +
            `first=${splitResult.firstTripId} second=${splitResult.secondTripId} ` +
            `gap=${Math.round(gap.gapMs / 1000)}s ` +
            `drift=${gap.driftM != null ? `${Math.round(gap.driftM)}m` : 'unknown'} ` +
            `firstEnd=${gap.firstEndAt.toISOString()} ` +
            `secondStart=${gap.secondStartAt.toISOString()}`,
        );

        // Enqueue behavior enrichment for both segments so driving impact
        // is recomputed against the correct boundaries.
        const orgId = await this.prisma.vehicle
          .findUnique({
            where: { id: vehicleId },
            select: { organizationId: true },
          })
          .then((v) => v?.organizationId ?? null);
        if (orgId) {
          await this.enqueueRepairEnrichment(
            splitResult.firstTripId,
            vehicleId,
            orgId,
          );
          await this.enqueueRepairEnrichment(
            splitResult.secondTripId,
            vehicleId,
            orgId,
          );
        }

        // Re-scan the new second segment — a single original trip may
        // contain multiple engine-off windows.
        const nextTrip = await this.prisma.vehicleTrip.findUnique({
          where: { id: splitResult.secondTripId },
          select: {
            id: true,
            startTime: true,
            endTime: true,
            endLatitude: true,
            endLongitude: true,
            distanceKm: true,
            detectionProfile: true,
          },
        });
        if (!nextTrip || !nextTrip.endTime) break;
        current = nextTrip as IntraGapTripRow;
      } catch (err: unknown) {
        await this.prisma.tripRepair.update({
          where: { id: repair.id },
          data: {
            status: REPAIR_STATUS.REJECTED,
            reason: `Split failed: ${(err as Error).message}`,
          },
        });
        rejected++;
        this.tripMetrics?.repairActions.inc({
          type: REPAIR_TYPES.INTRA_TRIP_GAP_SPLIT,
          result: 'rejected',
        });
        this.logger.warn(
          `INTRA_TRIP_GAP_SPLIT retro failed for trip ${current.id}: ${(err as Error).message}`,
        );
        break;
      }
    }

    return { proposed, applied, rejected };
  }

  /**
   * Walks the trip's waypoints once and returns the largest gap that
   * satisfies ALL split criteria, or null if none qualify.
   *
   * Criteria:
   *  - Gap between consecutive waypoints >= TRIP_MID_GAP_SPLIT_MS
   *  - Drift between pre- and post-gap waypoints <= TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M
   *  - Speed at pre-gap waypoint is null or <= 5 km/h (stopped)
   *  - Pre-segment duration (trip.startTime -> before.recordedAt) >= MIN_PRE_DURATION_MS
   *  - Post-segment duration (after.recordedAt -> trip.endTime) >= MIN_PRE_DURATION_MS
   *
   * Returns the gap with the largest `gapMs` among qualifying candidates.
   */
  private async findWaypointGapForSplit(
    trip: IntraGapTripRow,
  ): Promise<IntraTripGap | null> {
    const waypoints = await this.prisma.vehicleTripWaypoint.findMany({
      where: { tripId: trip.id },
      orderBy: { recordedAt: 'asc' },
      select: {
        latitude: true,
        longitude: true,
        speedKmh: true,
        recordedAt: true,
      },
    });

    if (waypoints.length < 2) return null;
    if (!trip.endTime) return null;

    const tripStartMs = trip.startTime.getTime();
    const tripEndMs = trip.endTime.getTime();

    let best: IntraTripGap | null = null;

    for (let i = 1; i < waypoints.length; i++) {
      const before = waypoints[i - 1];
      const after = waypoints[i];
      const gapMs = after.recordedAt.getTime() - before.recordedAt.getTime();
      if (gapMs < this.TRIP_MID_GAP_SPLIT_MS) continue;

      const beforeStopped = before.speedKmh == null || before.speedKmh <= 5;
      if (!beforeStopped) continue;

      const preDuration = before.recordedAt.getTime() - tripStartMs;
      if (preDuration < this.TRIP_MID_GAP_MIN_PRE_DURATION_MS) continue;

      const postDuration = tripEndMs - after.recordedAt.getTime();
      if (postDuration < this.TRIP_MID_GAP_MIN_PRE_DURATION_MS) continue;

      const driftM = this.haversineMeters(
        before.latitude,
        before.longitude,
        after.latitude,
        after.longitude,
      );
      if (driftM > this.TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M) continue;

      if (!best || gapMs > best.gapMs) {
        const seg1DistanceKm = this.cumulativeWaypointDistanceKm(
          waypoints.slice(0, i),
        );
        const seg2DistanceKm = this.cumulativeWaypointDistanceKm(
          waypoints.slice(i),
        );

        best = {
          gapMs,
          driftM,
          firstEndAt: before.recordedAt,
          firstEndLat: before.latitude,
          firstEndLng: before.longitude,
          secondStartAt: after.recordedAt,
          secondStartLat: after.latitude,
          secondStartLng: after.longitude,
          preWaypointCount: i,
          postWaypointCount: waypoints.length - i,
          seg1DistanceKm,
          seg2DistanceKm,
        };
      }
    }

    return best;
  }

  private cumulativeWaypointDistanceKm(
    waypoints: Array<{ latitude: number; longitude: number }>,
  ): number {
    if (waypoints.length < 2) return 0;
    let meters = 0;
    for (let i = 1; i < waypoints.length; i++) {
      meters += this.haversineMeters(
        waypoints[i - 1].latitude,
        waypoints[i - 1].longitude,
        waypoints[i].latitude,
        waypoints[i].longitude,
      );
    }
    return meters / 1000;
  }

  private haversineMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
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
        detectionProfile: true,
      },
    });

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        organizationId: true,
        dimoVehicle: { select: { tokenId: true } },
      },
    });
    const profile =
      detState?.detectionProfile ?? VehicleDetectionProfile.UNKNOWN;
    const dimoTokenId = vehicle?.dimoVehicle?.tokenId ?? 0;

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
      this.tripMetrics?.missingEndCandidates.inc();

      // Estimate end time: CH assist first, then last waypoint, then window end
      try {
        const chEndAt = await this.resolveChAssistedMissingEndTime({
          vehicleId,
          dimoTokenId,
          profile,
          tripStartAt: trip.startTime,
          windowTo: to,
        });
        const estimatedEnd = chEndAt ?? lastWaypoint?.recordedAt ?? to;
        const endDetectionMode = chEndAt
          ? END_DETECTION_MODES.CLICKHOUSE_END_ASSIST
          : 'MISSING_END_REPAIR';

        await this.decisionEngine.finalizeRepairedTrip(trip.id, {
          endTime: estimatedEnd,
          endDetectionMode,
        });
        if (vehicle?.organizationId != null) {
          await this.enqueueRepairEnrichment(
            trip.id,
            vehicleId,
            vehicle.organizationId,
          );
        }
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

  /**
   * CH-assisted end time for open trips during reconciliation (REPAIR_MISSING_END).
   */
  private async resolveChAssistedMissingEndTime(params: {
    vehicleId: string;
    dimoTokenId: number;
    profile: VehicleDetectionProfile;
    tripStartAt: Date;
    windowTo: Date;
  }): Promise<Date | null> {
    if (!isClickHouseTripAssistEnabled()) return null;
    if (!this.ignitionDetector && !this.motionDetector) return null;

    const now = params.windowTo;
    const baseCtx = {
      vehicleId: params.vehicleId,
      dimoTokenId: params.dimoTokenId,
      profile: params.profile,
      phase: DETECTION_PHASES.REPAIR_MISSING_END,
      timeWindow: { from: params.tripStartAt, to: now },
    };

    const isEvProfile =
      params.profile === VehicleDetectionProfile.EV ||
      params.profile === VehicleDetectionProfile.HYBRID ||
      params.profile === VehicleDetectionProfile.UNKNOWN;

    const [ignitionFinding, motionFinding] = await Promise.all([
      this.ignitionDetector?.evaluate(baseCtx),
      isEvProfile && this.motionDetector
        ? this.motionDetector.evaluate(baseCtx)
        : Promise.resolve(undefined),
    ]);

    const preliminaryEnd = extractLatestSegmentEnd(
      { ignitionSegment: ignitionFinding, motionSegment: motionFinding },
      params.tripStartAt,
      now,
      isEvProfile,
    );
    if (!preliminaryEnd) return null;

    let activityFinding: DetectorFinding | undefined;
    if (this.activityDetector) {
      activityFinding = await this.activityDetector.evaluate({
        ...baseCtx,
        timeWindow: {
          from: new Date(
            Math.max(preliminaryEnd.endAt.getTime(), now.getTime() - 5 * 60_000),
          ),
          to: now,
        },
      });
    }

    const telemetry = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId: params.vehicleId },
    });

    const endDecision = resolveAnalyticsAssistedEndDecision({
      activityWindow: activityFinding,
      ignitionSegment: ignitionFinding,
      motionSegment: motionFinding,
      profile: String(params.profile),
      tripStartAt: params.tripStartAt,
      now,
      currentTelemetry: telemetry
        ? {
            isIgnitionOn: telemetry.isIgnitionOn,
            speedKmh: telemetry.speedKmh,
            engineLoad: telemetry.engineLoad,
          }
        : null,
      minStationaryAfterSegmentMs: this.TRIP_END_CH_ASSIST_MIN_STATIONARY_MS,
      minTripDurationMs: this.TRIP_END_CH_ASSIST_MIN_TRIP_DURATION_MS,
      highConfidenceStationaryMs: this.TRIP_END_CH_ASSIST_HIGH_STATIONARY_MS,
    });

    if (!endDecision.confirmed || !endDecision.detectedEndAt) return null;

    this.tripMetrics?.tripEvidencePaths.inc({
      phase: 'reconciliation_missing_end',
      path: endDecision.evidencePath,
    });

    return endDecision.detectedEndAt;
  }
}
