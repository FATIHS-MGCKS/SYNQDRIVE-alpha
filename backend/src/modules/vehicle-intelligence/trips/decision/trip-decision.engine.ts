import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { TripStatus, TripSource } from '@prisma/client';
import type { VehicleTrip } from '@prisma/client';
import type { DetectorFinding } from '../detectors/detector.interfaces';
import { TRIP_OWNERSHIP } from '../TRIP_OWNERSHIP';
import type {
  StartDecision,
  ContinuityDecision,
  EndDecision,
  RepairDecision,
  CreateTripParams,
  FinalizeMeta,
  SplitTripAtGapParams,
  SplitTripAtGapResult,
} from './decision.types';
import { END_DETECTION_MODES, START_DETECTION_MODES } from '../trip-detection.types';

/**
 * TripDecisionEngine
 *
 * THE SOLE CANONICAL WRITER for trip lifecycle truth in the SynqDrive platform.
 *
 * ARCHITECTURE RULE: No other class, service, or module may call
 * `prisma.vehicleTrip.create()` or `prisma.vehicleTrip.update({ tripStatus })`
 * for lifecycle transitions. All such mutations must go through this engine.
 *
 * The engine:
 * 1. Accepts detector findings from the policy/detector layer
 * 2. Applies business rules to produce a decision
 * 3. Commits the decision to the database
 * 4. Returns the result for the orchestrator to act on
 *
 * Enrichment (behavior, driving impact) is NOT managed here — that remains
 * the responsibility of TripEnrichmentOrchestratorService.
 */
@Injectable()
export class TripDecisionEngine {
  private readonly logger = new Logger(TripDecisionEngine.name);

  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════
  //  EVALUATION METHODS (pure business logic, no DB writes)
  // ═══════════════════════════════════════════════════════════════

  evaluateStartCandidate(
    findings: DetectorFinding[],
    _context?: Record<string, unknown>,
  ): StartDecision {
    const evidenceFinding = findings.find(
      (f) => f.detectorName === 'SnapshotEvidenceEvaluator',
    );
    const confirmFinding = findings.find(
      (f) => f.detectorName === 'StartConfirmationDetector',
    );

    // Snapshot evidence is mandatory for live start
    if (!evidenceFinding || evidenceFinding.verdict !== 'TRIGGERED') {
      return {
        shouldStart: false,
        confidence: 'LOW',
        mode: 'insufficient_evidence',
        reason: 'Snapshot evidence not triggered',
        findings,
      };
    }

    // If confirmation finding exists, it must also be triggered
    if (confirmFinding && confirmFinding.verdict !== 'TRIGGERED') {
      return {
        shouldStart: false,
        confidence: 'LOW',
        mode: (evidenceFinding.evidence?.mode as string) ?? 'composite',
        reason: 'Start confirmation failed',
        findings,
      };
    }

    const confidence = confirmFinding?.confidence ?? evidenceFinding.confidence;
    const mode = (evidenceFinding.evidence?.mode as string) ?? 'composite';

    return {
      shouldStart: true,
      confidence,
      mode,
      reason: `Evidence confirmed: ${(evidenceFinding.evidence?.reasons as string[])?.join(', ')}`,
      findings,
    };
  }

  evaluateContinuity(
    findings: DetectorFinding[],
    _context?: Record<string, unknown>,
  ): ContinuityDecision {
    const continuityFinding = findings.find(
      (f) => f.detectorName === 'ContinuityAssessmentDetector',
    );

    if (!continuityFinding) {
      return {
        verdict: 'POSSIBLE_END',
        endMode: 'NO_ACTIVITY_TIMEOUT',
        endConfidence: 'LOW',
        reason: 'No continuity finding available',
        findings,
      };
    }

    const ev = continuityFinding.evidence as Record<string, unknown>;
    const rawVerdict = ev?.continuityVerdict as string;

    if (continuityFinding.verdict === 'TRIGGERED') {
      return {
        verdict: rawVerdict === 'IDLE' ? 'IDLE' : 'ACTIVE',
        reason: `Continuity: ${rawVerdict}`,
        findings,
      };
    }

    return {
      verdict: 'POSSIBLE_END',
      endMode: (ev?.endMode as string) ?? 'COMPOSITE_INACTIVITY',
      endConfidence: continuityFinding.confidence,
      reason: `Continuity assessment: ${rawVerdict}`,
      findings,
    };
  }

  evaluateEndCandidate(
    findings: DetectorFinding[],
    _context?: Record<string, unknown>,
  ): EndDecision {
    const resumeFinding = findings.find(
      (f) => f.detectorName === 'EndContinuityDetector',
    );
    const cusumFinding = findings.find(
      (f) => f.detectorName === 'ChangePointEndDetector',
    );

    // If activity resumed, reopen the trip
    if (resumeFinding?.verdict === 'TRIGGERED') {
      return {
        shouldEnd: false,
        shouldReopen: true,
        endMode: 'REOPENED',
        confidence: resumeFinding.confidence,
        reason: 'Activity resumed',
        findings,
      };
    }

    // If CUSUM confirms a change point, end the trip
    if (cusumFinding?.verdict === 'TRIGGERED') {
      return {
        shouldEnd: true,
        shouldReopen: false,
        detectedEndAt: cusumFinding.detectedAt,
        cusumSegmentEnd: cusumFinding.detectedAt,
        endMode: 'CUSUM_VALIDATED',
        confidence: cusumFinding.confidence,
        reason: 'CUSUM change-point detected',
        findings,
      };
    }

    // If CUSUM says ongoing (not triggered), reopen
    if (cusumFinding?.verdict === 'NOT_TRIGGERED') {
      const ev = cusumFinding.evidence as Record<string, unknown>;
      if (ev?.appearsOngoing === true) {
        return {
          shouldEnd: false,
          shouldReopen: true,
          endMode: 'CUSUM_ONGOING',
          confidence: cusumFinding.confidence,
          reason: 'CUSUM indicates trip is still active',
          findings,
        };
      }
    }

    // Inconclusive — caller decides (retry or force-end via hard timeout)
    return {
      shouldEnd: false,
      shouldReopen: false,
      endMode: 'INCONCLUSIVE',
      confidence: 'LOW',
      reason: 'End candidate inconclusive — retry',
      findings,
    };
  }

  evaluateRepairCandidate(
    findings: DetectorFinding[],
    _context?: Record<string, unknown>,
  ): RepairDecision {
    const triggered = findings.filter((f) => f.verdict === 'TRIGGERED');
    const hasOverlap = findings.find(
      (f) =>
        f.detectorName === 'TripOverlapDetector' && f.verdict === 'TRIGGERED',
    );

    if (hasOverlap) {
      return {
        shouldApply: false,
        confidence: 'HIGH',
        reason: 'Overlapping trip exists — repair rejected',
        findings,
      };
    }

    if (triggered.length === 0) {
      return {
        shouldApply: false,
        confidence: 'LOW',
        reason: 'No detector found evidence of missing trip',
        findings,
      };
    }

    // Require at least MEDIUM confidence from at least one triggered detector
    const hasHighConfidence = triggered.some(
      (f) => f.confidence === 'HIGH' || f.confidence === 'MEDIUM',
    );

    return {
      shouldApply: hasHighConfidence,
      confidence: hasHighConfidence ? 'MEDIUM' : 'LOW',
      reason: hasHighConfidence
        ? `Repair approved: ${triggered.map((f) => f.detectorName).join(', ')} triggered`
        : 'Confidence too low for automatic repair',
      findings,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  MUTATION METHODS — SOLE WRITERS OF TRIP LIFECYCLE TRUTH
  // ═══════════════════════════════════════════════════════════════

  /**
   * Creates a new canonical trip record.
   * This is the ONLY method that may call prisma.vehicleTrip.create()
   * for lifecycle purposes.
   */
  async createTrip(params: CreateTripParams): Promise<VehicleTrip> {
    const trip = await this.prisma.vehicleTrip.create({
      data: {
        vehicleId: params.vehicleId,
        dimoSegmentId: params.dimoSegmentId,
        tripStatus: TripStatus.ONGOING,
        tripSource: params.tripSource ?? TripSource.V2_LIVE,
        startTime: params.startTime,
        startLatitude: params.startLatitude,
        startLongitude: params.startLongitude,
        detectionProfile: params.detectionProfile as any,
        startDetectionMode: params.startDetectionMode,
        startConfidence: params.startConfidence as any,
        qualityStatus: 'VERIFIED',
        behaviorSummaryStatus: 'PENDING',
        drivingImpactStatus: 'PENDING',
      },
    });

    this.logger.log(
      `[${TRIP_OWNERSHIP.LIFECYCLE_OWNER}] Trip CREATED — id=${trip.id} vehicleId=${params.vehicleId} ` +
        `source=${trip.tripSource} start=${trip.startTime.toISOString()}`,
    );

    return trip;
  }

  /**
   * Finalizes a trip as COMPLETED with full end metadata.
   * This is the ONLY method that may update tripStatus to COMPLETED.
   */
  async finalizeTrip(
    tripId: string,
    meta: FinalizeMeta,
  ): Promise<VehicleTrip> {
    const trip = await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        tripStatus: TripStatus.COMPLETED,
        endTime: meta.endTime,
        endLatitude: meta.endLatitude,
        endLongitude: meta.endLongitude,
        endDetectionMode: meta.endDetectionMode,
        endConfidence: meta.endConfidence as any,
        durationMinutes: meta.durationMs != null && meta.durationMs > 0
          ? meta.durationMs / 60_000
          : undefined,
        distanceKm: meta.distanceKm ?? undefined,
        rawDetectionMeta: (meta.rawDetectionMeta as any) ?? undefined,
        qualityStatus: 'VERIFIED',
        behaviorSummaryStatus: 'PENDING',
        drivingImpactStatus: 'PENDING',
        tripAnalysisStatus: 'PENDING',
      },
    });

    this.logger.log(
      `[${TRIP_OWNERSHIP.LIFECYCLE_OWNER}] Trip FINALIZED — id=${tripId} ` +
        `end=${meta.endTime.toISOString()} mode=${meta.endDetectionMode}`,
    );

    return trip;
  }

  /**
   * Marks a trip as CANCELLED (discarded due to quality check failure).
   * This is the ONLY method that may update tripStatus to CANCELLED.
   */
  async discardTrip(tripId: string, reason: string): Promise<void> {
    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        tripStatus: TripStatus.CANCELLED,
        rawDetectionMeta: { discardReason: reason } as any,
        qualityStatus: 'LOW_DATA',
        behaviorSummaryStatus: 'SKIPPED',
        drivingImpactStatus: 'SKIPPED',
        tripAnalysisStatus: 'SKIPPED',
      },
    });

    this.logger.log(
      `[${TRIP_OWNERSHIP.LIFECYCLE_OWNER}] Trip DISCARDED — id=${tripId} reason=${reason}`,
    );
  }

  /**
   * Reopens a previous COMPLETED trip by resetting its status to ONGOING.
   * Used for the short-gap merge case.
   */
  async reopenTripForMerge(targetTripId: string): Promise<VehicleTrip> {
    const trip = await this.prisma.vehicleTrip.update({
      where: { id: targetTripId },
      data: {
        tripStatus: TripStatus.ONGOING,
        endTime: null,
        endLatitude: null,
        endLongitude: null,
      },
    });

    this.logger.log(
      `[${TRIP_OWNERSHIP.LIFECYCLE_OWNER}] Trip REOPENED for merge — id=${targetTripId}`,
    );

    return trip;
  }

  /**
   * Applies a repair to create a missing trip.
   * Sets tripSource: REPAIRED and isRepaired: true.
   */
  async createRepairedTrip(params: CreateTripParams): Promise<VehicleTrip> {
    return this.createTrip({
      ...params,
      tripSource: TripSource.REPAIRED,
    });
  }

  /**
   * Splits a trip into two canonical trips at a detected mid-trip gap
   * (vehicle was parked with engine off for long enough that the previous
   * drive effectively ended and a new drive began).
   *
   * Transactionally:
   *   1. Finalizes the existing trip at `firstEndAt` with the
   *      MID_TRIP_GAP_SPLIT end mode.
   *   2. Creates a new ONGOING trip that begins at `secondStartAt` with
   *      the MID_TRIP_GAP_SPLIT start mode and the same vehicle/organization.
   *   3. Re-parents every waypoint whose `recordedAt >= secondStartAt`
   *      from the old trip to the new trip so route rendering stays intact.
   *   4. Recomputes `durationMinutes` for the old trip from the new
   *      `firstEndAt`. Distance is left to the caller (needs odometer).
   *
   * Returns both trip ids plus the number of waypoints moved.
   *
   * Safety: callers MUST have already verified the gap is real (sustained
   * stationary silence + position drift below threshold + both endpoints
   * stopped). This method does not re-validate.
   */
  async splitTripAtGap(
    params: SplitTripAtGapParams,
  ): Promise<SplitTripAtGapResult> {
    const originalTrip = await this.prisma.vehicleTrip.findUnique({
      where: { id: params.tripId },
      select: {
        id: true,
        vehicleId: true,
        startTime: true,
        distanceKm: true,
        tripStatus: true,
      },
    });
    if (!originalTrip) {
      throw new Error(`splitTripAtGap: trip ${params.tripId} not found`);
    }

    const vehicleRow = await this.prisma.vehicle.findUnique({
      where: { id: originalTrip.vehicleId },
      select: { organizationId: true },
    });

    const firstDurationMs =
      params.firstEndAt.getTime() - originalTrip.startTime.getTime();
    const firstDurationMinutes =
      firstDurationMs > 0 ? firstDurationMs / 60_000 : undefined;

    // Best-effort first-trip distance: if caller knows it, honour it; otherwise
    // keep what was recorded (the original trip was already tracking distance
    // while ONGOING so the last write is the lower bound for segment 1).
    const firstDistanceKm =
      params.firstEndDistanceKm ?? originalTrip.distanceKm ?? undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      // ── 1. Finalize the existing trip as the first segment ────────────
      await tx.vehicleTrip.update({
        where: { id: params.tripId },
        data: {
          tripStatus: TripStatus.COMPLETED,
          endTime: params.firstEndAt,
          endLatitude: params.firstEndLatitude ?? undefined,
          endLongitude: params.firstEndLongitude ?? undefined,
          endDetectionMode: END_DETECTION_MODES.MID_TRIP_GAP_SPLIT,
          endConfidence: 'MEDIUM',
          durationMinutes: firstDurationMinutes,
          distanceKm: firstDistanceKm,
          qualityStatus: 'VERIFIED',
          behaviorSummaryStatus: 'PENDING',
          drivingImpactStatus: 'PENDING',
          rawDetectionMeta: {
            splitReason: params.reason,
            splitTriggeredBy: params.triggeredBy,
            splitGapMs: params.gapMs,
            splitFirstEndAt: params.firstEndAt.toISOString(),
            splitSecondStartAt: params.secondStartAt.toISOString(),
          } as any,
        },
      });

      // ── 2. Create the continuation trip ───────────────────────────────
      const secondTrip = await tx.vehicleTrip.create({
        data: {
          vehicleId: originalTrip.vehicleId,
          tripStatus: TripStatus.ONGOING,
          tripSource:
            params.triggeredBy === 'RECONCILIATION'
              ? TripSource.REPAIRED
              : TripSource.V2_LIVE,
          startTime: params.secondStartAt,
          startLatitude: params.secondStartLatitude ?? undefined,
          startLongitude: params.secondStartLongitude ?? undefined,
          detectionProfile: (params.detectionProfile as any) ?? undefined,
          startDetectionMode: START_DETECTION_MODES.MID_TRIP_GAP_SPLIT,
          startConfidence: 'MEDIUM',
          qualityStatus: 'VERIFIED',
          behaviorSummaryStatus: 'PENDING',
          drivingImpactStatus: 'PENDING',
          isRepaired: params.triggeredBy === 'RECONCILIATION',
          rawDetectionMeta: {
            splitFrom: params.tripId,
            splitReason: params.reason,
            splitTriggeredBy: params.triggeredBy,
            splitGapMs: params.gapMs,
          } as any,
        },
      });

      // ── 3. Re-parent waypoints that belong to segment 2 ───────────────
      const movedWaypoints = await tx.vehicleTripWaypoint.updateMany({
        where: {
          tripId: params.tripId,
          recordedAt: { gte: params.secondStartAt },
        },
        data: { tripId: secondTrip.id },
      });

      return {
        firstTripId: params.tripId,
        secondTripId: secondTrip.id,
        movedWaypoints: movedWaypoints.count,
      };
    });

    this.logger.log(
      `[${TRIP_OWNERSHIP.LIFECYCLE_OWNER}] Trip SPLIT ON GAP — ` +
        `firstId=${result.firstTripId} secondId=${result.secondTripId} ` +
        `firstEnd=${params.firstEndAt.toISOString()} ` +
        `secondStart=${params.secondStartAt.toISOString()} ` +
        `gap=${Math.round(params.gapMs / 1000)}s moved=${result.movedWaypoints} ` +
        `trigger=${params.triggeredBy} reason=${params.reason} ` +
        `vehicleId=${originalTrip.vehicleId} orgId=${vehicleRow?.organizationId ?? '—'}`,
    );

    return result;
  }

  /**
   * Finalizes a repaired trip (sets it to COMPLETED immediately, since
   * the repair layer already knows the full time window).
   */
  async finalizeRepairedTrip(
    tripId: string,
    meta: FinalizeMeta,
  ): Promise<VehicleTrip> {
    const trip = await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        tripStatus: TripStatus.COMPLETED,
        isRepaired: true,
        endTime: meta.endTime,
        endLatitude: meta.endLatitude,
        endLongitude: meta.endLongitude,
        endDetectionMode: meta.endDetectionMode ?? 'REPAIRED',
        endConfidence: (meta.endConfidence as any) ?? 'MEDIUM',
        durationMinutes: meta.durationMs != null && meta.durationMs > 0
          ? meta.durationMs / 60_000
          : undefined,
        distanceKm: meta.distanceKm ?? undefined,
        rawDetectionMeta: (meta.rawDetectionMeta as any) ?? undefined,
        qualityStatus: 'VERIFIED',
        behaviorSummaryStatus: 'PENDING',
        drivingImpactStatus: 'PENDING',
        tripAnalysisStatus: 'PENDING',
      },
    });

    this.logger.log(
      `[${TRIP_OWNERSHIP.LIFECYCLE_OWNER}] Repaired trip FINALIZED — id=${tripId} ` +
        `window=${meta.endTime.toISOString()}`,
    );

    return trip;
  }
}
