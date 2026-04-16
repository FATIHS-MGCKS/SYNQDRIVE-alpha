import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DimoSegmentsService,
  type DimoTripSegment,
} from '../../dimo/dimo-segments.service';
import { BatteryV2Service } from '../battery-health/battery-v2.service';
import { TripEnrichmentOrchestratorService } from './trip-enrichment-orchestrator.service';
import {
  TripDetectionState,
  TripTrackingRunType,
  DetectionConfidence,
  VehicleDetectionProfile,
  TripStatus,
} from '@prisma/client';
import type {
  VehicleTripDetectionState as DetState,
  VehicleLatestState,
} from '@prisma/client';
import { QUEUE_NAMES } from '../../../workers/queues/queue-names';
import {
  TRIP_TRACKING_TRIGGERS,
  END_DETECTION_MODES,
  type TripTrackingJobData,
  type TripStartEvaluation,
  type SnapshotEvidenceSignals,
  type WorkerLockResult,
  type StartDetectionMode,
} from './trip-detection.types';
import {
  // evaluateSnapshotEvidence → SnapshotEvidenceEvaluator (Phase 2 seam, done)
  // validateTripStart → StartConfirmationDetector (Phase 2 seam, done)
  // assessActiveContinuity/evaluatePerformanceActivity → ContinuityAssessmentDetector (Phase 2 seam, done)
  // hasActivityResumed → EndContinuityDetector (Phase 2 seam, done)
  checkTripQuality,
  refineTripStartBoundary,
  resolveAnalyticsAssistedStartDecision,
  resolveClickHouseContinuityGuard,
  resolveDetectionProfile,
} from './trip-evidence.helpers';
// detectTripEndChangePoint → ChangePointEndDetector (Phase 2 seam, done)
import { TripDecisionEngine } from './decision/trip-decision.engine';
import { TripDetectionPolicyResolver } from './policy/trip-detection-policy.resolver';
import { DETECTION_PHASES } from './detectors/detector.interfaces';
import { DetectorRegistry } from './detectors/detector.registry';
import { TripMetricsService } from '../../observability/trip-metrics.service';

@Injectable()
export class TripDetectionOrchestrationService {
  private readonly logger = new Logger(TripDetectionOrchestrationService.name);

  // ── Primary trip lifecycle config ──
  private readonly TRACKING_INTERVAL_MS: number;
  private readonly LOCK_TTL_MS = 120_000;
  private readonly BACKFILL_MS = 60_000;
  private readonly OVERLAP_CORE_MS = 30_000;
  private readonly OVERLAP_ROUTE_MS = 15_000;
  private readonly OVERLAP_PERF_MS = 30_000;
  private readonly CONFIRM_MAX_WAIT_MS = 180_000;
  private readonly POSSIBLE_START_CONFIRMATION_LOOKBACK_MS = 5 * 60_000;

  // ── Smart cooldown constants (replaces blunt COOLDOWN_MS = 5min) ──
  // After a completed trip: 2 min (vehicle likely still) — configurable
  private readonly COOLDOWN_AFTER_COMPLETE_MS = 2 * 60_000;
  // After a cancelled/discarded trip: 30s (allow quick re-detection)
  private readonly COOLDOWN_AFTER_DISCARD_MS = 30_000;
  // After a timeout/forced end: 1 min
  private readonly COOLDOWN_AFTER_TIMEOUT_MS = 60_000;

  // ── Active continuity: time-based evaluation windows (Fix B) ──
  // Replaces the old hardcoded slice(-5) approach with configurable time windows.
  private readonly TRIP_CONTINUITY_CORE_WINDOW_MS: number;
  private readonly TRIP_CONTINUITY_PERF_WINDOW_MS: number;

  // ── Trip End detection config (centralized, overridable via env) ──
  // Timeout fallback: last resort only, not the primary end trigger
  private readonly TRIP_END_TIMEOUT_MS: number;
  // How long POSSIBLE_END must remain stable before CUSUM runs
  private readonly TRIP_END_STABILITY_WINDOW_MS: number;
  // Min inactivity before CUSUM is triggered — enforced in processPossibleEndCheck
  private readonly TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS: number;
  // Retry interval between CUSUM validation attempts
  private readonly TRIP_END_VALIDATION_RETRY_MS: number;
  // Max CUSUM attempts before accepting timeout fallback
  private readonly TRIP_END_VALIDATION_MAX_ATTEMPTS: number;
  // CUSUM data window: how far back from possibleEndAt to fetch
  private readonly TRIP_END_SEGMENT_LOOKBACK_MS: number;
  // CUSUM data window: how far forward from possibleEndAt to fetch
  private readonly TRIP_END_SEGMENT_LOOKAHEAD_MS: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: DimoSegmentsService,
    private readonly batteryV2: BatteryV2Service,
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_NAMES.TRIP_TRACKING)
    private readonly trackingQueue: Queue,
    @InjectQueue(QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT)
    private readonly behaviorQueue: Queue,
    private readonly enrichmentOrchestrator: TripEnrichmentOrchestratorService,
    private readonly decisionEngine: TripDecisionEngine,
    private readonly policyResolver: TripDetectionPolicyResolver,
    private readonly detectorRegistry: DetectorRegistry,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {
    this.TRACKING_INTERVAL_MS = this.configService.get<number>('worker.tripTrackingIntervalMs') ?? 60_000;
    this.TRIP_CONTINUITY_CORE_WINDOW_MS = this.configService.get<number>('worker.tripContinuityCoreWindowMs') ?? 120_000;
    this.TRIP_CONTINUITY_PERF_WINDOW_MS = this.configService.get<number>('worker.tripContinuityPerfWindowMs') ?? 90_000;
    this.TRIP_END_TIMEOUT_MS = this.configService.get<number>('worker.tripEndTimeoutMs') ?? 1_800_000;
    this.TRIP_END_STABILITY_WINDOW_MS = this.configService.get<number>('worker.tripEndStabilityWindowMs') ?? 180_000;
    this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS = this.configService.get<number>('worker.tripEndMinInactivityBeforeCusumMs') ?? 180_000;
    this.TRIP_END_VALIDATION_RETRY_MS = this.configService.get<number>('worker.tripEndValidationRetryMs') ?? 120_000;
    this.TRIP_END_VALIDATION_MAX_ATTEMPTS = this.configService.get<number>('worker.tripEndValidationMaxAttempts') ?? 3;
    this.TRIP_END_SEGMENT_LOOKBACK_MS = this.configService.get<number>('worker.tripEndSegmentLookbackMs') ?? 900_000;
    this.TRIP_END_SEGMENT_LOOKAHEAD_MS = this.configService.get<number>('worker.tripEndSegmentLookaheadMs') ?? 300_000;
  }

  // ══════════════════════════════════════════════════════════
  //  STATE MANAGEMENT
  // ══════════════════════════════════════════════════════════

  async getOrCreateDetectionState(
    vehicleId: string,
    organizationId?: string | null,
  ): Promise<DetState> {
    const existing =
      await this.prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId },
      });
    if (existing) return existing;

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true, fuelType: true },
    });

    const profile = resolveDetectionProfile(vehicle?.fuelType);

    return this.prisma.vehicleTripDetectionState.upsert({
      where: { vehicleId },
      create: {
        vehicleId,
        organizationId: organizationId ?? vehicle?.organizationId ?? null,
        detectionProfile: profile,
      },
      update: {},
    });
  }

  async transitionState(
    vehicleId: string,
    newState: TripDetectionState,
    extras?: Record<string, unknown>,
  ): Promise<DetState> {
    return this.prisma.vehicleTripDetectionState.update({
      where: { vehicleId },
      data: { state: newState, ...extras } as any,
    });
  }

  // ══════════════════════════════════════════════════════════
  //  WORKER LOCKING
  // ══════════════════════════════════════════════════════════

  async acquireWorkerLock(
    vehicleId: string,
    ttlMs = this.LOCK_TTL_MS,
  ): Promise<WorkerLockResult> {
    const runToken = randomUUID();
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + ttlMs);

    const result =
      await this.prisma.vehicleTripDetectionState.updateMany({
        where: {
          vehicleId,
          OR: [
            { workerLockedUntil: null },
            { workerLockedUntil: { lt: now } },
          ],
        },
        data: { workerLockedUntil: lockedUntil, workerRunToken: runToken },
      });

    return { acquired: result.count > 0, runToken };
  }

  async releaseWorkerLock(
    vehicleId: string,
    runToken: string,
  ): Promise<void> {
    await this.prisma.vehicleTripDetectionState.updateMany({
      where: { vehicleId, workerRunToken: runToken },
      data: { workerLockedUntil: null, workerRunToken: null },
    });
  }

  // ══════════════════════════════════════════════════════════
  //  SCHEDULING
  // ══════════════════════════════════════════════════════════

  async schedulePossibleStart(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
    delayMs = 0,
  ): Promise<void> {
    await this.trackingQueue.add(
      'trip-tracking',
      {
        vehicleId,
        organizationId,
        dimoTokenId,
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
        requestedAt: new Date().toISOString(),
      } satisfies TripTrackingJobData,
      {
        delay: delayMs,
        jobId: `trip-ps-${vehicleId}-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: 5,
      },
    );
  }

  async scheduleActiveTick(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
    delayMs?: number,
  ): Promise<void> {
    await this.trackingQueue.add(
      'trip-tracking',
      {
        vehicleId,
        organizationId,
        dimoTokenId,
        trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
        requestedAt: new Date().toISOString(),
      } satisfies TripTrackingJobData,
      {
        delay: delayMs ?? this.TRACKING_INTERVAL_MS,
        jobId: `trip-at-${vehicleId}-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: 5,
      },
    );
  }

  async schedulePossibleEndCheck(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
    delayMs?: number,
  ): Promise<void> {
    await this.trackingQueue.add(
      'trip-tracking',
      {
        vehicleId,
        organizationId,
        dimoTokenId,
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK,
        requestedAt: new Date().toISOString(),
      } satisfies TripTrackingJobData,
      {
        delay: delayMs ?? this.TRACKING_INTERVAL_MS,
        jobId: `trip-pec-${vehicleId}-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: 5,
      },
    );
  }

  async scheduleEndValidation(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
    delayMs?: number,
  ): Promise<void> {
    await this.trackingQueue.add(
      'trip-tracking',
      {
        vehicleId,
        organizationId,
        dimoTokenId,
        trigger: TRIP_TRACKING_TRIGGERS.END_VALIDATION,
        requestedAt: new Date().toISOString(),
      } satisfies TripTrackingJobData,
      {
        delay: delayMs ?? 0,
        jobId: `trip-ev-${vehicleId}-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: 5,
      },
    );
  }

  async scheduleFinalize(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
  ): Promise<void> {
    await this.trackingQueue.add(
      'trip-tracking',
      {
        vehicleId,
        organizationId,
        dimoTokenId,
        trigger: TRIP_TRACKING_TRIGGERS.FINALIZE,
        requestedAt: new Date().toISOString(),
      } satisfies TripTrackingJobData,
      {
        jobId: `trip-fin-${vehicleId}-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: 5,
      },
    );
  }

  // ══════════════════════════════════════════════════════════
  //  SNAPSHOT EVALUATION (trigger layer)
  // ══════════════════════════════════════════════════════════

  async evaluateSnapshotForTripStart(
    vehicleId: string,
    dimoTokenId: number,
    previousTelemetry: VehicleLatestState | null,
    current: SnapshotEvidenceSignals,
  ): Promise<TripStartEvaluation> {
    const detState = await this.getOrCreateDetectionState(vehicleId);

    if (detState.state !== TripDetectionState.RESTING) {
      return { shouldStartTracking: false };
    }

    // ── Smart cooldown (replaces blunt 5-min flat cooldown) ──────────────────
    // Cooldown duration depends on WHY we entered RESTING, not just time elapsed.
    // This prevents false-zero blind spots after discarded micro-trips.
    if (detState.updatedAt) {
      const sinceLast = Date.now() - detState.updatedAt.getTime();
      const lastMeta = detState.lastEvidenceSummary as any;
      const lastReason = lastMeta?.lastRestingReason as string | undefined;

      let cooldownMs: number;
      if (lastReason === 'discard') {
        cooldownMs = this.COOLDOWN_AFTER_DISCARD_MS;
      } else if (lastReason === 'timeout') {
        cooldownMs = this.COOLDOWN_AFTER_TIMEOUT_MS;
      } else {
        cooldownMs = this.COOLDOWN_AFTER_COMPLETE_MS;
      }

      if (sinceLast < cooldownMs) {
        return { shouldStartTracking: false };
      }
    }

    const profile = detState.detectionProfile ?? VehicleDetectionProfile.UNKNOWN;
    const profileStr = String(profile);

    // ── PHASE 2 SEAM: policy → detector → decision ───────────────────────────
    // The policy resolver decides which detectors to run for the live_start phase.
    // Detectors return findings; the decision engine converts findings to a decision.
    // No truth is committed here — this method only decides whether to enter POSSIBLE_START.
    const policy = this.policyResolver.resolve({
      phase: DETECTION_PHASES.LIVE_START,
      profile,
      dataQuality: this.policyResolver.assessDataQuality({
        // Snapshot freshness not available in SnapshotEvidenceSignals type;
        // previousTelemetry.updatedAt is the best proxy we have here.
        // TODO(Phase 2 completion): pass snapshot timestamp from caller context.
        snapshotFreshMs: previousTelemetry?.updatedAt
          ? Date.now() - previousTelemetry.updatedAt.getTime()
          : null,
        ignitionAvailable: current.isIgnitionOn != null,
        speedAvailable: current.speedKmh != null,
        odometerAvailable: current.odometerKm != null,
        corePointCount: 1, // Single snapshot context
        hasRoutePoints: false,
        hasHighFrequency: false,
      }),
      anomalyContext: {},
    });

    const findings = await this.detectorRegistry.runAll(
      policy.detectors,
      {
        vehicleId,
        dimoTokenId,
        profile,
        phase: DETECTION_PHASES.LIVE_START,
        currentState: detState.state,
        snapshotSignals: current,
        previousSnapshot: previousTelemetry
          ? {
              latitude: previousTelemetry.latitude,
              longitude: previousTelemetry.longitude,
              odometerKm: previousTelemetry.odometerKm,
              fuelLevelAbsolute: previousTelemetry.fuelLevelAbsolute,
              evSoc: previousTelemetry.evSoc,
              isIgnitionOn: previousTelemetry.isIgnitionOn,
              speedKmh: previousTelemetry.speedKmh,
            }
          : null,
      },
      policy.timeoutMs,
    );

    const startDecision = this.decisionEngine.evaluateStartCandidate(findings);

    if (!startDecision.shouldStart) {
      return { shouldStartTracking: false };
    }

    // Extract evidence summary from the SnapshotEvidenceEvaluator finding
    const evidenceFinding = findings.find((f) => f.detectorName === 'SnapshotEvidenceEvaluator');
    const ev = evidenceFinding?.evidence ?? {};

    const now = new Date();
    const confEnum =
      startDecision.confidence === 'HIGH'
        ? DetectionConfidence.HIGH
        : startDecision.confidence === 'MEDIUM'
          ? DetectionConfidence.MEDIUM
          : DetectionConfidence.LOW;

    await this.transitionState(
      vehicleId,
      TripDetectionState.POSSIBLE_START,
      {
        possibleStartAt: now,
        lastSnapshotEvidenceAt: now,
        lastActivityAt: now,
        startOdometerKm: current.odometerKm,
        startFuelLevel: current.fuelLevelAbsolute,
        startEvSoc: current.evSoc,
        startDetectionMode: startDecision.mode as StartDetectionMode | undefined,
        startConfidence: confEnum,
        lastEvidenceSummary: {
          strong: ev.strong,
          weak: ev.weak,
          hasMovement: ev.hasMovement,
          reasons: ev.reasons,
          profile: profileStr,
          detectorPolicy: policy.detectors,
        },
      },
    );

    await this.schedulePossibleStart(
      vehicleId,
      detState.organizationId,
      dimoTokenId,
    );

    const reasons = (ev.reasons as string[]) ?? [startDecision.reason];
    this.logger.log(
      `POSSIBLE_START ${vehicleId} [${profileStr}] via ${policy.detectors.join('+')}` +
        `: ${reasons.join(', ')} (conf=${startDecision.confidence})`,
    );
    this.tripMetrics?.tripStartCandidates.inc({ profile: profileStr, detector: policy.detectors[0] ?? 'none' });

    return {
      shouldStartTracking: true,
      reason: reasons.join(', '),
      startDetectionMode: startDecision.mode as StartDetectionMode | undefined,
      confidence: startDecision.confidence,
      evidenceSummary: {
        strong: ev.strong as number,
        weak: ev.weak as number,
        hasMovement: ev.hasMovement as boolean,
        reasons: reasons,
      },
    };
  }

  // ══════════════════════════════════════════════════════════
  //  PROCESS: POSSIBLE_START
  // ══════════════════════════════════════════════════════════

  async processPossibleStart(data: TripTrackingJobData): Promise<void> {
    const { vehicleId, dimoTokenId, organizationId } = data;
    const lock = await this.acquireWorkerLock(vehicleId);
    if (!lock.acquired) {
      this.logger.debug(`Lock not acquired for POSSIBLE_START ${vehicleId}`);
      return;
    }

    const startedMs = Date.now();
    let resultState: TripDetectionState | undefined;

    try {
      const det = await this.getOrCreateDetectionState(vehicleId, organizationId);
      if (det.state !== TripDetectionState.POSSIBLE_START) return;

      const profile = det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN;
      const profileStr = String(profile);
      const now = new Date();
      const startAt = det.possibleStartAt ?? now;
      const elapsed = now.getTime() - startAt.getTime();

      // Expire stale start candidates before they can be confirmed from old data.
      if (elapsed > this.CONFIRM_MAX_WAIT_MS) {
        resultState = TripDetectionState.RESTING;
        await this.transitionState(
          vehicleId,
          TripDetectionState.RESTING,
          {
            possibleStartAt: null,
            startOdometerKm: null,
            startFuelLevel: null,
            startEvSoc: null,
            lastEvidenceSummary: null,
            startDetectionMode: null,
            startConfidence: null,
          },
        );
        this.logger.log(
          `POSSIBLE_START expired for ${vehicleId} after ${Math.round(elapsed / 1000)}s`,
        );

        await this.logTrackingRun({
          vehicleId,
          organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_START,
          runType: TripTrackingRunType.POSSIBLE_START_VALIDATION,
          requestedFrom: startAt,
          requestedTo: now,
          corePointsCount: 0,
          resultState,
          resultSummary: {
            reason: 'possible_start_expired',
            elapsedMs: elapsed,
            maxWaitMs: this.CONFIRM_MAX_WAIT_MS,
          },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      const from = new Date(
        Math.max(
          startAt.getTime() - this.BACKFILL_MS,
          now.getTime() - this.POSSIBLE_START_CONFIRMATION_LOOKBACK_MS,
        ),
      );

      const corePoints = await this.segments.fetchRawTripCoreData(
        dimoTokenId,
        from,
        now,
      );

      const telemetry = await this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
      });

      const clickhouseAvailable = this.hasClickHouseAnalyticsDetectors();
      const confirmationPolicy = this.policyResolver.resolve({
        phase: DETECTION_PHASES.ACTIVE_TRIP,
        profile,
        dataQuality: {
          snapshotFreshness: telemetry?.updatedAt ? 'FRESH' : 'MISSING',
          ignitionAvailable: telemetry?.isIgnitionOn != null,
          speedAvailable: telemetry?.speedKmh != null,
          odometerAvailable: telemetry?.odometerKm != null,
          telemetryDensity:
            corePoints.length >= 4
              ? 'HIGH'
              : corePoints.length >= 2
                ? 'MEDIUM'
                : corePoints.length === 1
                  ? 'LOW'
                  : 'NONE',
          routeCoverage: 'NONE',
          highFrequencyAvailable: clickhouseAvailable,
        },
        anomalyContext: {
          confirmingStart: true,
          clickhouseAvailable,
        },
      });

      // ── PHASE 2 SEAM: Start confirmation with optional ClickHouse corroboration ──
      const confirmFindings = await this.detectorRegistry.runAll(
        confirmationPolicy.detectors,
        {
          vehicleId,
          dimoTokenId,
          profile,
          phase: DETECTION_PHASES.ACTIVE_TRIP,
          timeWindow: { from, to: now },
          coreDataPoints: corePoints,
          snapshotSignals: telemetry
            ? {
                isIgnitionOn: telemetry.isIgnitionOn,
                speedKmh: telemetry.speedKmh,
                engineLoad: telemetry.engineLoad,
                tractionBatteryPowerKw: null,
                latitude: telemetry.latitude,
                longitude: telemetry.longitude,
                odometerKm: telemetry.odometerKm,
                fuelLevelAbsolute: telemetry.fuelLevelAbsolute,
                evSoc: telemetry.evSoc,
              }
            : undefined,
          anomalyContext: {
            confirmingStart: true,
            clickhouseAvailable,
          },
        },
        confirmationPolicy.timeoutMs,
      );

      const confirmFinding = confirmFindings.find(
        (f) => f.detectorName === 'StartConfirmationDetector',
      );
      const analyticsStartDecision = resolveAnalyticsAssistedStartDecision({
        startConfirmation: confirmFinding,
        activityWindow: confirmFindings.find(
          (f) => f.detectorName === 'ActivityWindowDetector',
        ),
        ignitionSegment: confirmFindings.find(
          (f) => f.detectorName === 'IgnitionSegmentDetector',
        ),
        motionSegment: confirmFindings.find(
          (f) => f.detectorName === 'MotionSegmentDetector',
        ),
        profile,
        currentTelemetry: telemetry
          ? {
              isIgnitionOn: telemetry.isIgnitionOn,
              speedKmh: telemetry.speedKmh,
              engineLoad: telemetry.engineLoad,
            }
          : null,
      });
      const confirmed = analyticsStartDecision.confirmed;
      const confirmConfidence = analyticsStartDecision.confidence;
      const confirmMode = analyticsStartDecision.mode;
      const confirmSummary = {
        detectorSummary:
          (confirmFinding?.evidence?.summary as Record<string, unknown> | undefined) ??
          null,
        analytics: analyticsStartDecision.summary,
      };

      if (confirmed) {
        const confEnum =
          confirmConfidence === 'HIGH'
            ? DetectionConfidence.HIGH
            : confirmConfidence === 'MEDIUM'
              ? DetectionConfidence.MEDIUM
              : DetectionConfidence.LOW;
        const resolvedStart = await this.resolveConfirmedStartBoundary({
          dimoTokenId,
          candidateStartAt: startAt,
          confirmedAt: now,
          corePoints,
          profile: profileStr,
        });
        const effectiveStartAt = resolvedStart.startAt;
        const startRouteFetchFrom = new Date(
          Math.max(
            effectiveStartAt.getTime() - this.BACKFILL_MS,
            now.getTime() - this.POSSIBLE_START_CONFIRMATION_LOOKBACK_MS,
          ),
        );
        const startEvidenceSummary = {
          ...(((det.lastEvidenceSummary as Record<string, unknown> | null) ?? {})),
          startCandidateAt: startAt.toISOString(),
          confirmedStartAt: effectiveStartAt.toISOString(),
          confirmedStartSource: resolvedStart.source,
          startBoundaryAdjustedMs: resolvedStart.adjustedMs,
          startEvidencePath: analyticsStartDecision.evidencePath,
          clickhouseAssistedStart: analyticsStartDecision.evidencePath !== 'DIMO_ONLY',
          startConfirmationSummary: analyticsStartDecision.summary,
        };
        this.tripMetrics?.tripEvidencePaths.inc({
          phase: 'start_confirmation',
          path: analyticsStartDecision.evidencePath,
        });

        // Check for merge with recent previous trip
        const previousTrip = await this.prisma.vehicleTrip.findFirst({
          where: { vehicleId, tripStatus: TripStatus.COMPLETED },
          orderBy: { endTime: 'desc' },
          select: { id: true, endTime: true },
        });

        const mergeCheck = checkTripQuality(
          0,
          null,
          0,
          previousTrip?.endTime ?? null,
          effectiveStartAt,
        );

        if (mergeCheck.shouldMergeWithPrevious && previousTrip?.id) {
          // Reopen the previous trip instead of creating a new one
          // DecisionEngine is the sole writer of tripStatus changes
          await this.decisionEngine.reopenTripForMerge(previousTrip.id);

          resultState = TripDetectionState.ACTIVE_TRIP;
          await this.transitionState(
            vehicleId,
            TripDetectionState.ACTIVE_TRIP,
            {
              activeTripId: previousTrip.id,
              possibleStartAt: effectiveStartAt,
              lastCoreProcessedAt: now,
              lastRouteProcessedAt: null,
              lastDrivingProcessedAt: null,
              lastActivityAt: now,
              startDetectionMode: confirmMode as StartDetectionMode,
              startConfidence: confEnum,
              lastEvidenceSummary: startEvidenceSummary,
            },
          );

          await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);
          this.logger.log(
            `ACTIVE_TRIP merged with previous: vehicle=${vehicleId} trip=${previousTrip.id}` +
              ` startSource=${resolvedStart.source} evidencePath=${analyticsStartDecision.evidencePath}` +
              ` adjustedMs=${resolvedStart.adjustedMs}`,
          );
        } else {
          // DecisionEngine.createTrip is the SOLE canonical trip creator
          const trip = await this.decisionEngine.createTrip({
            vehicleId,
            organizationId: det.organizationId ?? null,
            dimoSegmentId:
              resolvedStart.dimoSegmentId ??
              `v2-${vehicleId}-${effectiveStartAt.getTime()}`,
            startTime: effectiveStartAt,
            startLatitude:
              resolvedStart.startLatitude ?? telemetry?.latitude,
            startLongitude:
              resolvedStart.startLongitude ?? telemetry?.longitude,
            detectionProfile: profileStr,
            startDetectionMode: confirmMode,
            startConfidence: confirmConfidence,
          });

          resultState = TripDetectionState.ACTIVE_TRIP;
          await this.transitionState(
            vehicleId,
            TripDetectionState.ACTIVE_TRIP,
            {
              activeTripId: trip.id,
              possibleStartAt: effectiveStartAt,
              lastCoreProcessedAt: now,
              lastRouteProcessedAt: null,
              lastDrivingProcessedAt: null,
              lastActivityAt: now,
              startDetectionMode: confirmMode as StartDetectionMode,
              startConfidence: confEnum,
              lastEvidenceSummary: startEvidenceSummary,
            },
          );

          this.fetchAndStoreStartTemperature(
            dimoTokenId,
            trip.id,
            effectiveStartAt,
          ).catch((e) =>
            this.logger.warn(`Temp fetch failed for trip ${trip.id}: ${e}`),
          );

          this.fetchAndStoreInitialRoute(
            dimoTokenId,
            trip.id,
            startRouteFetchFrom,
            now,
          ).catch((e) =>
            this.logger.warn(
              `Initial route fetch failed for trip ${trip.id}: ${e}`,
            ),
          );

          // Battery V2: extract crank features from LV battery time series
          this.batteryV2
            .onTripStart(vehicleId, dimoTokenId, trip.id, effectiveStartAt)
            .catch((e) =>
              this.logger.warn(
                `Battery V2 crank capture failed for trip ${trip.id}: ${e}`,
              ),
            );

          await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);
          this.logger.log(
            `ACTIVE_TRIP confirmed: vehicle=${vehicleId} trip=${trip.id} mode=${confirmMode}` +
              ` [${profileStr}] startSource=${resolvedStart.source}` +
              ` evidencePath=${analyticsStartDecision.evidencePath} adjustedMs=${resolvedStart.adjustedMs}`,
          );
          this.tripMetrics?.tripStartsConfirmed.inc({ profile: profileStr, mode: confirmMode });
        }
      } else {
        if (elapsed > this.CONFIRM_MAX_WAIT_MS) {
          resultState = TripDetectionState.RESTING;
          await this.transitionState(
            vehicleId,
            TripDetectionState.RESTING,
            {
              possibleStartAt: null,
              startOdometerKm: null,
              startFuelLevel: null,
              startEvSoc: null,
              lastEvidenceSummary: null,
              startDetectionMode: null,
              startConfidence: null,
            },
          );
          this.logger.log(
            `POSSIBLE_START timeout for ${vehicleId}, reverting to RESTING`,
          );
        } else {
          await this.schedulePossibleStart(
            vehicleId,
            organizationId,
            dimoTokenId,
            30_000,
          );
        }
      }

      await this.logTrackingRun({
        vehicleId,
        organizationId,
        tripId: det.activeTripId,
        stateAtRun: TripDetectionState.POSSIBLE_START,
        runType: TripTrackingRunType.POSSIBLE_START_VALIDATION,
        requestedFrom: from,
        requestedTo: now,
        corePointsCount: corePoints.length,
        resultState,
        resultSummary: confirmSummary as Record<string, unknown> | undefined,
        durationMs: Date.now() - startedMs,
      });
    } catch (err) {
      this.logger.warn(`POSSIBLE_START error for ${vehicleId}: ${err}`);
      await this.logTrackingRun({
        vehicleId,
        organizationId,
        stateAtRun: TripDetectionState.POSSIBLE_START,
        runType: TripTrackingRunType.POSSIBLE_START_VALIDATION,
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedMs,
      }).catch(() => {});
    } finally {
      await this.releaseWorkerLock(vehicleId, lock.runToken);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  PROCESS: ACTIVE_TICK
  // ══════════════════════════════════════════════════════════

  async processActiveTick(data: TripTrackingJobData): Promise<void> {
    const { vehicleId, dimoTokenId, organizationId } = data;
    const lock = await this.acquireWorkerLock(vehicleId);
    if (!lock.acquired) {
      this.logger.debug(`Lock not acquired for ACTIVE_TICK ${vehicleId}`);
      return;
    }

    const startedMs = Date.now();
    let resultState: TripDetectionState | undefined;

    try {
      const det = await this.getOrCreateDetectionState(vehicleId, organizationId);
      if (
        det.state !== TripDetectionState.ACTIVE_TRIP &&
        det.state !== TripDetectionState.IDLE_WITHIN_TRIP
      ) {
        return;
      }

      const tripId = det.activeTripId;
      if (!tripId) {
        this.logger.warn(`ACTIVE_TICK but no activeTripId for ${vehicleId}`);
        await this.transitionState(vehicleId, TripDetectionState.RESTING, {
          activeTripId: null,
        });
        return;
      }

      const profile = String(det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN);
      const now = new Date();
      const startAt = det.possibleStartAt ?? now;

      const isFirstCore = det.lastCoreProcessedAt == null;
      const isFirstRoute = det.lastRouteProcessedAt == null;
      const isFirstDriving = det.lastDrivingProcessedAt == null;

      const coreFrom = isFirstCore
        ? new Date(startAt.getTime() - this.BACKFILL_MS)
        : new Date(det.lastCoreProcessedAt!.getTime() - this.OVERLAP_CORE_MS);
      const routeFrom = isFirstRoute
        ? new Date(startAt.getTime() - this.BACKFILL_MS)
        : new Date(det.lastRouteProcessedAt!.getTime() - this.OVERLAP_ROUTE_MS);
      const perfFrom = isFirstDriving
        ? new Date(startAt.getTime() - this.BACKFILL_MS)
        : new Date(det.lastDrivingProcessedAt!.getTime() - this.OVERLAP_PERF_MS);

      const [corePoints, routePoints, perfReadings] = await Promise.all([
        this.segments.fetchRawTripCoreData(dimoTokenId, coreFrom, now),
        this.segments.fetchRouteEnrichment(dimoTokenId, routeFrom, now),
        this.segments.fetchPerformance(dimoTokenId, perfFrom, now),
      ]);

      if (corePoints.length === 0) {
        resultState = det.state;
        await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);
        await this.logTrackingRun({
          vehicleId,
          organizationId,
          tripId,
          stateAtRun: det.state,
          runType: TripTrackingRunType.ACTIVE_TRACKING,
          requestedFrom: coreFrom,
          requestedTo: now,
          corePointsCount: 0,
          routePointsCount: routePoints.length,
          drivingPointsCount: perfReadings.length,
          resultState,
          resultSummary: {
            reason: 'no_core_data_keep_open',
            routePointsCount: routePoints.length,
            drivingPointsCount: perfReadings.length,
          },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      // ── Store new waypoints (deduplicate overlap) ──
      const waypointCutoff = det.lastRouteProcessedAt
        ? det.lastRouteProcessedAt.getTime() - 5000
        : 0;
      const newWaypoints = routePoints.filter(
        (p) => new Date(p.timestamp).getTime() > waypointCutoff,
      );
      if (newWaypoints.length > 0) {
        await this.prisma.vehicleTripWaypoint.createMany({
          data: newWaypoints.map((p) => ({
            tripId,
            latitude: p.latitude,
            longitude: p.longitude,
            speedKmh: p.speedKmh,
            recordedAt: new Date(p.timestamp),
          })),
        });
      }

      // ── Update trip metrics ──
      const telemetry = await this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
      });

      const endCoord =
        routePoints.length > 0
          ? routePoints[routePoints.length - 1]
          : null;
      const speeds = corePoints
        .filter((p) => p.speed != null && p.speed > 0)
        .map((p) => p.speed!);

      let distanceKm: number | null = null;
      if (det.startOdometerKm != null && telemetry?.odometerKm != null) {
        const delta = telemetry.odometerKm - det.startOdometerKm;
        if (delta >= 0 && delta < 2000) {
          distanceKm = Math.round(delta * 10) / 10;
        }
      }

      const vehicleForTank = await this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { tankCapacityLiters: true },
      });
      const maxTank = vehicleForTank?.tankCapacityLiters ?? 120;

      let fuelUsedLiters: number | null = null;
      if (det.startFuelLevel != null && telemetry?.fuelLevelAbsolute != null) {
        if (
          det.startFuelLevel <= maxTank * 1.1 &&
          telemetry.fuelLevelAbsolute <= maxTank * 1.1
        ) {
          const delta = det.startFuelLevel - telemetry.fuelLevelAbsolute;
          if (delta >= 0 && delta <= maxTank) {
            fuelUsedLiters = Math.round(delta * 100) / 100;
          }
        }
      }

      let energyUsedKwh: number | null = null;
      if (det.startEvSoc != null && telemetry?.evSoc != null) {
        const delta = det.startEvSoc - telemetry.evSoc;
        if (delta >= 0 && delta < 200) {
          energyUsedKwh = Math.round(delta * 100) / 100;
        }
      }

      const durationMin =
        (now.getTime() - (det.possibleStartAt?.getTime() ?? now.getTime())) /
        60_000;

      // Extract perf-based metrics for trip enrichment
      const rpmValues = perfReadings
        .filter((r) => r.rpm != null)
        .map((r) => r.rpm!);
      const throttleValues = perfReadings
        .filter((r) => r.throttlePosition != null)
        .map((r) => r.throttlePosition!);
      const engineLoadValues = perfReadings
        .filter((r) => r.engineLoad != null)
        .map((r) => r.engineLoad!);

      await this.prisma.vehicleTrip.update({
        where: { id: tripId },
        data: {
          endTime: now,
          ...(endCoord && {
            endLatitude: endCoord.latitude,
            endLongitude: endCoord.longitude,
          }),
          ...(distanceKm != null && { distanceKm }),
          durationMinutes: Math.round(durationMin * 10) / 10,
          ...(speeds.length > 0 && {
            maxSpeedKmh: Math.max(...speeds),
            avgSpeedKmh:
              Math.round(
                (speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10,
              ) / 10,
          }),
          ...(fuelUsedLiters != null && { fuelUsedLiters }),
          ...(energyUsedKwh != null && { energyUsedKwh }),
          ...(rpmValues.length > 0 && {
            avgRpm:
              Math.round(rpmValues.reduce((a, b) => a + b, 0) / rpmValues.length),
          }),
          ...(throttleValues.length > 0 && {
            avgThrottlePosition:
              Math.round(
                (throttleValues.reduce((a, b) => a + b, 0) / throttleValues.length) * 10,
              ) / 10,
          }),
          ...(engineLoadValues.length > 0 && {
            avgEngineLoad:
              Math.round(
                (engineLoadValues.reduce((a, b) => a + b, 0) / engineLoadValues.length) * 10,
              ) / 10,
          }),
          lastActivityAt: now,
          ...(isFirstDriving && perfReadings.length > 0 && {
            drivingTrackingStartedAt: now,
          }),
          ...(isFirstRoute && routePoints.length > 0 && {
            routeTrackingStartedAt: now,
          }),
        },
      });

      // ── State transition: time-based continuity evaluation ───────────────────
      // Use a configurable time window rather than a fixed last-N-points slice.
      // This prevents relevant earlier activity in the fetched window from being
      // silently discarded when the fetch window is larger than 5 points.
      const nowMs = now.getTime();
      const recentCore = corePoints.filter(
        (p) => nowMs - new Date(p.timestamp).getTime() <= this.TRIP_CONTINUITY_CORE_WINDOW_MS,
      );
      const recentPerf = perfReadings.filter(
        (p) => nowMs - new Date(p.timestamp).getTime() <= this.TRIP_CONTINUITY_PERF_WINDOW_MS,
      );
      // Fall back to the full fetched window if the time-filtered window is empty
      // (sparse data, first tick, or very slow device) to prevent false POSSIBLE_END.
      const evalCore = recentCore.length > 0 ? recentCore : corePoints.slice(-3);
      const analyticsGuardWindowFrom = new Date(
        Math.max(
          startAt.getTime() - this.BACKFILL_MS,
          now.getTime() - 5 * 60_000,
        ),
      );

      const clickhouseAvailable = this.hasClickHouseAnalyticsDetectors();
      const continuityPolicy = this.policyResolver.resolve({
        phase: DETECTION_PHASES.ACTIVE_TRIP,
        profile: det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN,
        dataQuality: {
          snapshotFreshness: telemetry?.updatedAt ? 'FRESH' : 'MISSING',
          ignitionAvailable: telemetry?.isIgnitionOn != null,
          speedAvailable: telemetry?.speedKmh != null,
          odometerAvailable: telemetry?.odometerKm != null,
          telemetryDensity:
            evalCore.length >= 4
              ? 'HIGH'
              : evalCore.length >= 2
                ? 'MEDIUM'
                : evalCore.length === 1
                  ? 'LOW'
                  : 'NONE',
          routeCoverage:
            routePoints.length >= 4
              ? 'FULL'
              : routePoints.length > 0
                ? 'PARTIAL'
                : 'NONE',
          highFrequencyAvailable: clickhouseAvailable,
        },
        anomalyContext: {
          clickhouseAvailable,
        },
      });

      // ── PHASE 2 SEAM: ContinuityAssessmentDetector ───────────────────────────
      const continuityFindings = await this.detectorRegistry.runAll(
        continuityPolicy.detectors,
        {
          vehicleId,
          dimoTokenId,
          profile: det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN,
          phase: DETECTION_PHASES.ACTIVE_TRIP,
          timeWindow: { from: coreFrom, to: now },
          coreDataPoints: evalCore,
          performanceReadings: recentPerf,
          anomalyContext: {
            clickhouseAvailable,
          },
        },
        continuityPolicy.timeoutMs,
      );

      const continuityDecision = this.decisionEngine.evaluateContinuity(continuityFindings);
      const continuityFinding = continuityFindings.find(
        (f) => f.detectorName === 'ContinuityAssessmentDetector',
      );
      const continuitySummary = continuityFinding?.evidence?.summary;
      let effectiveContinuityDecision = continuityDecision;
      let effectiveContinuitySummary =
        continuitySummary as Record<string, unknown> | undefined;

      if (
        clickhouseAvailable &&
        continuityDecision.verdict === 'POSSIBLE_END' &&
        continuityDecision.endConfidence !== 'HIGH'
      ) {
        const ambiguousContinuityPolicy = this.policyResolver.resolve({
          phase: DETECTION_PHASES.ACTIVE_TRIP,
          profile: det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN,
          dataQuality: {
            snapshotFreshness: telemetry?.updatedAt ? 'FRESH' : 'MISSING',
            ignitionAvailable: telemetry?.isIgnitionOn != null,
            speedAvailable: telemetry?.speedKmh != null,
            odometerAvailable: telemetry?.odometerKm != null,
            telemetryDensity:
              evalCore.length >= 4
                ? 'HIGH'
                : evalCore.length >= 2
                  ? 'MEDIUM'
                  : evalCore.length === 1
                    ? 'LOW'
                    : 'NONE',
            routeCoverage:
              routePoints.length >= 4
                ? 'FULL'
                : routePoints.length > 0
                  ? 'PARTIAL'
                  : 'NONE',
            highFrequencyAvailable: clickhouseAvailable,
          },
          anomalyContext: {
            ambiguousContinuity: true,
            clickhouseAvailable,
          },
        });

        const ambiguousFindings = await this.detectorRegistry.runAll(
          ambiguousContinuityPolicy.detectors,
          {
            vehicleId,
            dimoTokenId,
            profile: det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN,
            phase: DETECTION_PHASES.ACTIVE_TRIP,
            timeWindow: { from: analyticsGuardWindowFrom, to: now },
            anomalyContext: {
              ambiguousContinuity: true,
              clickhouseAvailable,
            },
          },
          ambiguousContinuityPolicy.timeoutMs,
        );
        const activityWindowFinding = ambiguousFindings.find(
          (f) => f.detectorName === 'ActivityWindowDetector',
        );
        const clickhouseGuard = resolveClickHouseContinuityGuard(
          activityWindowFinding,
        );

        if (clickhouseGuard.keepTripOpen) {
          effectiveContinuityDecision = {
            verdict: 'ACTIVE',
            reason: 'ClickHouse activity guard kept trip open',
            findings: ambiguousFindings,
          };
          effectiveContinuitySummary = {
            ...(effectiveContinuitySummary ?? {}),
            clickhouseGuard: clickhouseGuard.summary,
          };
          this.tripMetrics?.tripEvidencePaths.inc({
            phase: 'active_continuity',
            path: clickhouseGuard.evidencePath,
          });
        } else {
          this.tripMetrics?.tripEvidencePaths.inc({
            phase: 'active_continuity',
            path: clickhouseGuard.evidencePath,
          });
        }
      }

      const stateUpdateBase = {
        lastCoreProcessedAt: now,
        lastRouteProcessedAt: now,
        lastDrivingProcessedAt: now,
      };

      // Track the last moment meaningful movement was observed
      const hadMeaningfulMovement =
        effectiveContinuityDecision.verdict === 'ACTIVE' &&
        (((effectiveContinuitySummary as any)?.motionCount ?? 0) > 0 ||
          ((effectiveContinuitySummary as any)?.clickhouseGuard?.maxSpeedKmh ?? 0) > 5 ||
          ((effectiveContinuitySummary as any)?.clickhouseGuard?.odometerDeltaKm ?? 0) > 0.05);

      switch (effectiveContinuityDecision.verdict) {
        case 'ACTIVE':
          resultState = TripDetectionState.ACTIVE_TRIP;
          await this.transitionState(
            vehicleId,
            TripDetectionState.ACTIVE_TRIP,
            {
              ...stateUpdateBase,
              lastActivityAt: now,
              ...(hadMeaningfulMovement && { lastMeaningfulMovementAt: now }),
            },
          );
          await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);
          break;

        case 'IDLE':
          resultState = TripDetectionState.IDLE_WITHIN_TRIP;
          await this.transitionState(
            vehicleId,
            TripDetectionState.IDLE_WITHIN_TRIP,
            { ...stateUpdateBase, lastActivityAt: now },
          );
          await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);
          break;

        case 'POSSIBLE_END':
          resultState = TripDetectionState.POSSIBLE_END;
          await this.transitionState(
            vehicleId,
            TripDetectionState.POSSIBLE_END,
            {
              ...stateUpdateBase,
              possibleEndAt: now,
              endValidationAttempts: 0,
              endDetectionMode:
                effectiveContinuityDecision.endMode ?? END_DETECTION_MODES.COMPOSITE_INACTIVITY,
              endConfidence:
                effectiveContinuityDecision.endConfidence === 'HIGH'
                  ? DetectionConfidence.HIGH
                  : effectiveContinuityDecision.endConfidence === 'MEDIUM'
                    ? DetectionConfidence.MEDIUM
                    : DetectionConfidence.LOW,
            },
          );
          await this.schedulePossibleEndCheck(
            vehicleId,
            organizationId,
            dimoTokenId,
          );
          break;
      }

      await this.logTrackingRun({
        vehicleId,
        organizationId,
        tripId,
        stateAtRun: det.state,
        runType: TripTrackingRunType.ACTIVE_TRACKING,
        requestedFrom: coreFrom,
        requestedTo: now,
        corePointsCount: corePoints.length,
        routePointsCount: routePoints.length,
        drivingPointsCount: perfReadings.length,
        resultState,
        resultSummary: effectiveContinuitySummary,
        durationMs: Date.now() - startedMs,
      });
    } catch (err) {
      this.logger.warn(`ACTIVE_TICK error for ${vehicleId}: ${err}`);
      await this.logTrackingRun({
        vehicleId,
        organizationId,
        stateAtRun: TripDetectionState.ACTIVE_TRIP,
        runType: TripTrackingRunType.ACTIVE_TRACKING,
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedMs,
      }).catch(() => {});

      await this.scheduleActiveTick(
        vehicleId,
        organizationId,
        dimoTokenId,
        this.TRACKING_INTERVAL_MS,
      ).catch(() => {});
    } finally {
      await this.releaseWorkerLock(vehicleId, lock.runToken);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  PROCESS: POSSIBLE_END_CHECK
  // ══════════════════════════════════════════════════════════

  async processPossibleEndCheck(data: TripTrackingJobData): Promise<void> {
    const { vehicleId, dimoTokenId, organizationId } = data;
    const lock = await this.acquireWorkerLock(vehicleId);
    if (!lock.acquired) {
      this.logger.debug(`Lock not acquired for POSSIBLE_END_CHECK ${vehicleId}`);
      return;
    }

    const startedMs = Date.now();
    let resultState: TripDetectionState | undefined;

    try {
      const det = await this.getOrCreateDetectionState(vehicleId, organizationId);
      if (det.state !== TripDetectionState.POSSIBLE_END) return;

      const profile = String(det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN);
      const now = new Date();
      const endCandidateAt = det.possibleEndAt ?? now;
      const elapsedMs = now.getTime() - endCandidateAt.getTime();

      // ── Step 1: Check if activity has resumed ──
      // PHASE 2 SEAM: EndContinuityDetector wraps hasActivityResumed via registry.
      try {
        const recentFrom = new Date(now.getTime() - 90_000);
        const recentPoints = await this.segments.fetchRawTripCoreData(
          dimoTokenId,
          recentFrom,
          now,
        );

        const resumeFindings = await this.detectorRegistry.runAll(
          ['EndContinuityDetector'],
          {
            vehicleId,
            dimoTokenId,
            profile: det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN,
            phase: DETECTION_PHASES.POSSIBLE_END,
            coreDataPoints: recentPoints,
          },
        );
        const activityResumed = resumeFindings.some(
          (f) => f.detectorName === 'EndContinuityDetector' && f.verdict === 'TRIGGERED',
        );

        if (activityResumed) {
          resultState = TripDetectionState.ACTIVE_TRIP;
          this.logger.log(
            `Activity resumed for ${vehicleId} [${profile}], cancelling POSSIBLE_END`,
          );
          await this.transitionState(vehicleId, TripDetectionState.ACTIVE_TRIP, {
            possibleEndAt: null,
            endDetectionMode: null,
            endConfidence: null,
            endValidationAttempts: 0,
            cusumValidatedAt: null,
            cusumSegmentStart: null,
            cusumSegmentEnd: null,
            lastActivityAt: now,
            lastMeaningfulMovementAt: now,
            lastCoreProcessedAt: now,
          });
          await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);

          await this.logTrackingRun({
            vehicleId, organizationId,
            tripId: det.activeTripId,
            stateAtRun: TripDetectionState.POSSIBLE_END,
            runType: TripTrackingRunType.POSSIBLE_END_CHECK,
            requestedFrom: recentFrom, requestedTo: now,
            corePointsCount: recentPoints.length,
            resultState,
            resultSummary: { reason: 'activity_resumed', profile },
            durationMs: Date.now() - startedMs,
          });
          return;
        }
      } catch {
        // Fetch failure → keep waiting, do not finalize prematurely
      }

      // ── Step 2: Hard timeout fallback (last resort only) ──
      if (elapsedMs >= this.TRIP_END_TIMEOUT_MS) {
        this.logger.warn(
          `POSSIBLE_END timeout reached for ${vehicleId} (${Math.round(elapsedMs / 60000)} min), forcing finalize`,
        );
        resultState = TripDetectionState.RESTING;
        await this.scheduleFinalize(vehicleId, organizationId, dimoTokenId);
        await this.logTrackingRun({
          vehicleId, organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_END,
          runType: TripTrackingRunType.POSSIBLE_END_CHECK,
          resultState,
          resultSummary: { reason: 'hard_timeout_fallback', elapsedMs, profile },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      // ── Step 3: Stability window — wait before triggering CUSUM ──
      // Also enforces TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS: CUSUM must not run
      // until both the stability window AND the min-inactivity guard have elapsed.
      const cusumGateMs = Math.max(
        this.TRIP_END_STABILITY_WINDOW_MS,
        this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS,
      );
      if (elapsedMs < cusumGateMs) {
        // Still within stability/inactivity window — keep watching, reschedule
        await this.schedulePossibleEndCheck(vehicleId, organizationId, dimoTokenId);
        await this.logTrackingRun({
          vehicleId, organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_END,
          runType: TripTrackingRunType.POSSIBLE_END_CHECK,
          resultSummary: {
            reason: 'stability_window_waiting',
            elapsedMs,
            stabilityWindowMs: this.TRIP_END_STABILITY_WINDOW_MS,
            minInactivityMs: this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS,
            cusumGateMs,
          },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      // ── Step 4: Gate elapsed — trigger CUSUM end validation ──
      const attempts = det.endValidationAttempts ?? 0;
      if (attempts < this.TRIP_END_VALIDATION_MAX_ATTEMPTS) {
        await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
          endValidationAttempts: attempts + 1,
        });
        await this.scheduleEndValidation(vehicleId, organizationId, dimoTokenId);
        await this.logTrackingRun({
          vehicleId, organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_END,
          runType: TripTrackingRunType.POSSIBLE_END_CHECK,
          resultSummary: {
            reason: 'triggering_cusum_validation',
            attempt: attempts + 1,
            maxAttempts: this.TRIP_END_VALIDATION_MAX_ATTEMPTS,
            elapsedMs,
          },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      // ── Step 5: Max CUSUM attempts exhausted — finalize with best available data ──
      this.logger.log(
        `CUSUM max attempts (${attempts}) for ${vehicleId}, finalizing`,
      );
      resultState = TripDetectionState.RESTING;
      await this.scheduleFinalize(vehicleId, organizationId, dimoTokenId);
      await this.logTrackingRun({
        vehicleId, organizationId,
        tripId: det.activeTripId,
        stateAtRun: TripDetectionState.POSSIBLE_END,
        runType: TripTrackingRunType.POSSIBLE_END_CHECK,
        resultState,
        resultSummary: {
          reason: 'max_cusum_attempts_finalize',
          attempts, elapsedMs, profile,
        },
        durationMs: Date.now() - startedMs,
      });
    } catch (err) {
      this.logger.warn(`POSSIBLE_END_CHECK error for ${vehicleId}: ${err}`);
      await this.schedulePossibleEndCheck(vehicleId, organizationId, dimoTokenId).catch(() => {});
    } finally {
      await this.releaseWorkerLock(vehicleId, lock.runToken);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  PROCESS: END_VALIDATION (CUSUM targeted validation)
  // ══════════════════════════════════════════════════════════

  async processEndValidation(data: TripTrackingJobData): Promise<void> {
    const { vehicleId, dimoTokenId, organizationId } = data;
    const lock = await this.acquireWorkerLock(vehicleId);
    if (!lock.acquired) {
      this.logger.debug(`Lock not acquired for END_VALIDATION ${vehicleId}`);
      return;
    }

    const startedMs = Date.now();
    let resultState: TripDetectionState | undefined;

    try {
      const det = await this.getOrCreateDetectionState(vehicleId, organizationId);
      if (det.state !== TripDetectionState.POSSIBLE_END) return;

      const now = new Date();
      const endCandidateAt = det.possibleEndAt ?? now;

      // Fetch a bounded window of data centred on the POSSIBLE_END candidate
      const corePoints = await this.segments.fetchEndValidationWindow(
        dimoTokenId,
        endCandidateAt,
        this.TRIP_END_SEGMENT_LOOKBACK_MS,
        this.TRIP_END_SEGMENT_LOOKAHEAD_MS,
      );

      this.logger.debug(
        `END_VALIDATION for ${vehicleId}: fetched ${corePoints.length} points around ${endCandidateAt.toISOString()}`,
      );

      // ── PHASE 2 SEAM: ChangePointEndDetector + evaluateEndCandidate ──────────
      // ChangePointEndDetector wraps detectTripEndChangePoint and sorts inputs.
      // evaluateEndCandidate converts the finding into a typed EndDecision.
      const endFindings = await this.detectorRegistry.runAll(
        ['ChangePointEndDetector'],
        {
          vehicleId,
          dimoTokenId,
          profile: det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN,
          phase: DETECTION_PHASES.POSSIBLE_END,
          coreDataPoints: corePoints,
          possibleEndAt: endCandidateAt,
          endValidationAttempts: det.endValidationAttempts ?? 0,
        },
      );

      const endDecision = this.decisionEngine.evaluateEndCandidate(endFindings);
      const endFinding = endFindings.find((f) => f.detectorName === 'ChangePointEndDetector');
      const endConfEnum =
        endDecision.confidence === 'HIGH'
          ? DetectionConfidence.HIGH
          : endDecision.confidence === 'MEDIUM'
            ? DetectionConfidence.MEDIUM
            : DetectionConfidence.LOW;

      // ── Still ongoing? → back to ACTIVE_TRIP ──
      if (endDecision.shouldReopen && endDecision.endMode !== 'CUSUM_VALIDATED') {
        resultState = TripDetectionState.ACTIVE_TRIP;
        this.logger.log(
          `CUSUM: trip ${vehicleId} still appears ongoing — returning to ACTIVE_TRIP`,
        );

        // Extract lastMovementAt from evidence if available
        const lastMovementStr = endFinding?.evidence?.cusumLastMovementAt as string | undefined;
        const lastMovementAt = lastMovementStr ? new Date(lastMovementStr) : undefined;

        await this.transitionState(vehicleId, TripDetectionState.ACTIVE_TRIP, {
          possibleEndAt: null,
          endValidationAttempts: 0,
          cusumValidatedAt: null,
          cusumSegmentStart: null,
          cusumSegmentEnd: null,
          lastActivityAt: now,
          ...(lastMovementAt && { lastMeaningfulMovementAt: lastMovementAt }),
          lastCoreProcessedAt: now,
        });
        await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);

        await this.logTrackingRun({
          vehicleId, organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_END,
          runType: TripTrackingRunType.END_VALIDATION,
          corePointsCount: corePoints.length,
          resultState,
          resultSummary: { reason: 'cusum_still_ongoing', endDecisionReason: endDecision.reason },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      // ── Clear change-point detected → finalize ──
      if (endDecision.shouldEnd && endDecision.detectedEndAt) {
        const validatedEndTime = endDecision.detectedEndAt;
        const lastMovementStr = endFinding?.evidence?.cusumLastMovementAt as string | undefined;
        const lastMovementAt = lastMovementStr ? new Date(lastMovementStr) : undefined;

        this.logger.log(
          `CUSUM: change-point detected for ${vehicleId} at ${validatedEndTime.toISOString()} [${endDecision.confidence}]`,
        );

        await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
          cusumValidatedAt: now,
          cusumSegmentStart: corePoints.length > 0 ? new Date(corePoints[0].timestamp) : null,
          cusumSegmentEnd: validatedEndTime,
          endDetectionMode: END_DETECTION_MODES.CUSUM_VALIDATED,
          endConfidence: endConfEnum,
          ...(lastMovementAt && { lastMeaningfulMovementAt: lastMovementAt }),
        });

        resultState = TripDetectionState.RESTING;
        await this.scheduleFinalize(vehicleId, organizationId, dimoTokenId);

        await this.logTrackingRun({
          vehicleId, organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_END,
          runType: TripTrackingRunType.END_VALIDATION,
          corePointsCount: corePoints.length,
          resultState,
          resultSummary: {
            reason: 'cusum_change_point_confirmed',
            validatedEndTime: validatedEndTime.toISOString(),
            confidence: endDecision.confidence,
            endDecisionReason: endDecision.reason,
            lastMovementAt: lastMovementAt?.toISOString(),
          },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      // ── Inconclusive: reschedule another attempt ──
      this.logger.debug(
        `CUSUM inconclusive for ${vehicleId}: ${endDecision.reason} — rescheduling`,
      );
      await this.schedulePossibleEndCheck(
        vehicleId, organizationId, dimoTokenId,
        this.TRIP_END_VALIDATION_RETRY_MS,
      );

      await this.logTrackingRun({
        vehicleId, organizationId,
        tripId: det.activeTripId,
        stateAtRun: TripDetectionState.POSSIBLE_END,
        runType: TripTrackingRunType.END_VALIDATION,
        corePointsCount: corePoints.length,
        resultSummary: {
          reason: 'cusum_inconclusive',
          endDecisionReason: endDecision.reason,
          attempts: det.endValidationAttempts,
        },
        durationMs: Date.now() - startedMs,
      });
    } catch (err) {
      this.logger.warn(`END_VALIDATION error for ${vehicleId}: ${err}`);
      // On error, fall back to rescheduling the basic check
      await this.schedulePossibleEndCheck(vehicleId, organizationId, dimoTokenId,
        this.TRIP_END_VALIDATION_RETRY_MS,
      ).catch(() => {});
    } finally {
      await this.releaseWorkerLock(vehicleId, lock.runToken);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  PROCESS: FINALIZE
  // ══════════════════════════════════════════════════════════

  async processFinalize(data: TripTrackingJobData): Promise<void> {
    const { vehicleId, organizationId } = data;
    const lock = await this.acquireWorkerLock(vehicleId);
    if (!lock.acquired) {
      this.logger.debug(`Lock not acquired for FINALIZE ${vehicleId}`);
      return;
    }

    const startedMs = Date.now();
    // 'complete' | 'discard' | 'timeout' — used to select smart cooldown window
    let restingReason = 'complete';
    let restWindowAnchorAt: Date | null = null;

    try {
      const det = await this.getOrCreateDetectionState(vehicleId, organizationId);
      const tripId = det.activeTripId;

      if (tripId) {
        const trip = await this.prisma.vehicleTrip.findUnique({
          where: { id: tripId },
        });

        if (trip) {
          const [lastWaypoint, waypointCount] = await Promise.all([
            this.prisma.vehicleTripWaypoint.findFirst({
              where: { tripId },
              orderBy: { recordedAt: 'desc' },
            }),
            this.prisma.vehicleTripWaypoint.count({ where: { tripId } }),
          ]);

          // ── End-time priority (most reliable → least reliable):
          //   1. CUSUM validated segment end (change-point detected)
          //   2. lastMeaningfulMovementAt (last observed movement)
          //   3. lastWaypoint.recordedAt (last GPS fix)
          //   4. possibleEndAt (first inactivity candidate)
          //   5. now (absolute fallback)
          const endTime =
            (det as any).cusumSegmentEnd ??
            (det as any).lastMeaningfulMovementAt ??
            lastWaypoint?.recordedAt ??
            det.possibleEndAt ??
            new Date();

          const chosenEndSource =
            (det as any).cusumSegmentEnd
              ? 'cusum_segment_end'
              : (det as any).lastMeaningfulMovementAt
                ? 'last_meaningful_movement'
                : lastWaypoint?.recordedAt
                  ? 'last_waypoint'
                  : det.possibleEndAt
                    ? 'possible_end_at'
                    : 'fallback_now';

          const durationMs = endTime.getTime() - trip.startTime.getTime();
          // Keep the latest known trip end as rest-window anchor for Battery V2.
          restWindowAnchorAt = endTime;
          // Tracks why we are entering RESTING, for smart cooldown in next evaluation.
          restingReason = 'complete';

          // Derive a practical maxConsecutiveActive proxy from waypoint count.
          // Any trip that made it to finalize has already survived
          // POSSIBLE_START → ACTIVE_TRIP → POSSIBLE_END, so passing a hardcoded
          // 0 here would discard every finalizing trip whose distance < 100m
          // regardless of real movement — catastrophic for urban short trips.
          // waypointCount reflects actual route density without re-evaluating
          // core points. A trip with 0–1 waypoints is genuinely suspect and
          // still legitimately subject to the `no_meaningful_movement` rule.
          const qualityCheck = checkTripQuality(
            durationMs,
            trip.distanceKm,
            waypointCount,
            null,
            trip.startTime,
          );

          // ── Delegate all lifecycle mutations to TripDecisionEngine ──────────
          const profileLabel = String(det.detectionProfile ?? 'UNKNOWN');

          if (qualityCheck.shouldDiscard) {
            await this.decisionEngine.discardTrip(
              tripId,
              qualityCheck.reason ?? 'quality_check_failed',
            );
            // Smart cooldown: discard → short 30s cooldown
            restingReason = 'discard';
            this.logger.log(`Trip ${tripId} discarded for ${vehicleId}: ${qualityCheck.reason}`);
            this.tripMetrics?.tripDiscarded.inc({ reason: qualityCheck.reason ?? 'quality_check_failed' });
          } else {
            await this.decisionEngine.finalizeTrip(tripId, {
              endTime,
              endDetectionMode:
                det.endDetectionMode ?? END_DETECTION_MODES.NO_ACTIVITY_TIMEOUT,
              endConfidence: (det.endConfidence as 'LOW' | 'MEDIUM' | 'HIGH' | null) ?? undefined,
              cusumSegmentStart: (det as any).cusumSegmentStart ?? null,
              cusumSegmentEnd: (det as any).cusumSegmentEnd ?? null,
              durationMs,
              rawDetectionMeta: {
                detectionProfile: det.detectionProfile,
                startDetectionMode: det.startDetectionMode,
                startBoundarySource:
                  typeof (det.lastEvidenceSummary as any)?.confirmedStartSource === 'string'
                    ? (det.lastEvidenceSummary as any).confirmedStartSource
                    : null,
                startCandidateAt:
                  typeof (det.lastEvidenceSummary as any)?.startCandidateAt === 'string'
                    ? (det.lastEvidenceSummary as any).startCandidateAt
                    : null,
                startBoundaryAdjustedMs:
                  typeof (det.lastEvidenceSummary as any)?.startBoundaryAdjustedMs === 'number'
                    ? (det.lastEvidenceSummary as any).startBoundaryAdjustedMs
                    : null,
                startEvidencePath:
                  typeof (det.lastEvidenceSummary as any)?.startEvidencePath === 'string'
                    ? (det.lastEvidenceSummary as any).startEvidencePath
                    : null,
                endDetectionMode: det.endDetectionMode,
                startConfidence: det.startConfidence,
                endConfidence: det.endConfidence,
                endTimeSource: chosenEndSource,
                possibleStartAt: det.possibleStartAt?.toISOString(),
                possibleEndAt: det.possibleEndAt?.toISOString(),
                lastActivityAt: det.lastActivityAt?.toISOString(),
                lastMeaningfulMovementAt: (det as any).lastMeaningfulMovementAt?.toISOString() ?? null,
                cusumValidatedAt: (det as any).cusumValidatedAt?.toISOString() ?? null,
                cusumSegmentStart: (det as any).cusumSegmentStart?.toISOString() ?? null,
                cusumSegmentEnd: (det as any).cusumSegmentEnd?.toISOString() ?? null,
                endValidationAttempts: (det as any).endValidationAttempts ?? 0,
                startOdometerKm: det.startOdometerKm,
                startFuelLevel: det.startFuelLevel,
                startEvSoc: det.startEvSoc,
              },
            });
            this.logger.log(
              `Trip ${tripId} finalized for ${vehicleId} [endSource=${chosenEndSource} mode=${det.endDetectionMode}]`,
            );
            this.tripMetrics?.tripFinalized.inc({ profile: profileLabel, quality: 'ok', source: 'v2_live' });
            this.tripMetrics?.tripFinalizeLatency.observe(
              { profile: profileLabel },
              durationMs / 1000,
            );

            // V2 finalize: enqueue enrichment through canonical orchestrator
            this.enrichmentOrchestrator
              .enqueueBehaviorEnrichment(tripId, vehicleId, organizationId)
              .catch((e) => this.logger.error(`V2 finalize: failed to enqueue enrichment for trip ${tripId}: ${e}`));
          }
        }
      }

      await this.transitionState(vehicleId, TripDetectionState.RESTING, {
        activeTripId: null,
        possibleStartAt: null,
        possibleEndAt: null,
        lastActivityAt: restWindowAnchorAt,
        lastMeaningfulMovementAt: null,
        lastCoreProcessedAt: null,
        lastRouteProcessedAt: null,
        lastDrivingProcessedAt: null,
        startOdometerKm: null,
        startFuelLevel: null,
        startEvSoc: null,
        startDetectionMode: null,
        startConfidence: null,
        endDetectionMode: null,
        endConfidence: null,
        endValidationAttempts: 0,
        cusumValidatedAt: null,
        cusumSegmentStart: null,
        cusumSegmentEnd: null,
        // Store resting reason for smart cooldown selection on next snapshot
        lastEvidenceSummary: { lastRestingReason: restingReason },
      });

      await this.logTrackingRun({
        vehicleId,
        organizationId,
        tripId,
        stateAtRun: det.state,
        runType: TripTrackingRunType.FINALIZATION_CHECK,
        resultState: TripDetectionState.RESTING,
        durationMs: Date.now() - startedMs,
      });
    } catch (err) {
      this.logger.warn(`FINALIZE error for ${vehicleId}: ${err}`);
    } finally {
      await this.releaseWorkerLock(vehicleId, lock.runToken);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  TRIP LIFECYCLE HELPERS
  // ══════════════════════════════════════════════════════════

  private hasClickHouseAnalyticsDetectors(): boolean {
    return (
      this.detectorRegistry.get('ActivityWindowDetector') != null &&
      this.detectorRegistry.get('IgnitionSegmentDetector') != null
    );
  }

  private async resolveConfirmedStartBoundary(input: {
    dimoTokenId: number;
    candidateStartAt: Date;
    confirmedAt: Date;
    corePoints: Awaited<ReturnType<DimoSegmentsService['fetchRawTripCoreData']>>;
    profile: string;
  }): Promise<{
    startAt: Date;
    source: 'DIMO_SEGMENT' | 'ROUTE_ACTIVITY' | 'CORE_ACTIVITY' | 'SNAPSHOT_CANDIDATE';
    startLatitude: number | null;
    startLongitude: number | null;
    adjustedMs: number;
    dimoSegmentId: string | null;
  }> {
    const boundaryWindowFrom = new Date(
      Math.max(
        input.candidateStartAt.getTime() - this.POSSIBLE_START_CONFIRMATION_LOOKBACK_MS,
        input.confirmedAt.getTime() - this.POSSIBLE_START_CONFIRMATION_LOOKBACK_MS,
      ),
    );
    const matchingSegment = this.selectConfirmedStartSegment(
      await this.segments.fetchTripSegments(
        input.dimoTokenId,
        boundaryWindowFrom,
        input.confirmedAt,
      ),
      input.candidateStartAt,
      input.confirmedAt,
    );

    if (matchingSegment) {
      const startAt = new Date(matchingSegment.startTime);
      return {
        startAt,
        source: 'DIMO_SEGMENT',
        startLatitude: matchingSegment.startLatitude,
        startLongitude: matchingSegment.startLongitude,
        adjustedMs: startAt.getTime() - input.candidateStartAt.getTime(),
        dimoSegmentId: matchingSegment.segmentId,
      };
    }

    const routePoints = await this.segments.fetchRouteEnrichment(
      input.dimoTokenId,
      boundaryWindowFrom,
      input.confirmedAt,
    );
    const refined = refineTripStartBoundary(
      input.candidateStartAt,
      input.corePoints,
      routePoints,
      input.profile,
    );

    return {
      ...refined,
      dimoSegmentId: null,
    };
  }

  private selectConfirmedStartSegment(
    segments: DimoTripSegment[],
    candidateStartAt: Date,
    confirmedAt: Date,
  ): DimoTripSegment | null {
    const candidateMs = candidateStartAt.getTime();
    const confirmedMs = confirmedAt.getTime();

    return (
      segments.find((segment) => {
        if (segment.startedBeforeRange) return false;

        const startMs = new Date(segment.startTime).getTime();
        const endMs = segment.endTime
          ? new Date(segment.endTime).getTime()
          : confirmedMs;

        return startMs <= confirmedMs && endMs >= candidateMs;
      }) ?? null
    );
  }

  private async fetchAndStoreStartTemperature(
    tokenId: number,
    tripId: string,
    startTime: Date,
  ): Promise<void> {
    const from = new Date(startTime.getTime() - 5 * 60_000);
    const to = new Date(startTime.getTime() + 5 * 60_000);
    const readings = await this.segments.fetchEnvironmentTemperature(
      tokenId,
      from,
      to,
    );

    if (readings.length > 0) {
      const closest = DimoSegmentsService.closestReading(
        readings,
        startTime,
      );
      if (closest) {
        await this.prisma.vehicleTrip.update({
          where: { id: tripId },
          data: {
            outsideTemperatureStartC:
              Math.round(closest.temperatureC * 10) / 10,
          },
        });
      }
    }
  }

  private async fetchAndStoreInitialRoute(
    tokenId: number,
    tripId: string,
    from: Date,
    to: Date,
  ): Promise<void> {
    const routePoints = await this.segments.fetchRouteEnrichment(
      tokenId,
      from,
      to,
    );
    if (routePoints.length === 0) return;

    await this.prisma.vehicleTripWaypoint.createMany({
      data: routePoints.map((p) => ({
        tripId,
        latitude: p.latitude,
        longitude: p.longitude,
        speedKmh: p.speedKmh,
        recordedAt: new Date(p.timestamp),
      })),
    });

    const first = routePoints[0];
    const last = routePoints[routePoints.length - 1];
    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        startLatitude: first.latitude,
        startLongitude: first.longitude,
        endLatitude: last.latitude,
        endLongitude: last.longitude,
        routeTrackingStartedAt: new Date(),
      },
    });
  }

  // ══════════════════════════════════════════════════════════
  //  OBSERVABILITY
  // ══════════════════════════════════════════════════════════

  async logTrackingRun(input: {
    vehicleId: string;
    organizationId?: string | null;
    tripId?: string | null;
    stateAtRun: TripDetectionState;
    runType: TripTrackingRunType;
    requestedFrom?: Date | null;
    requestedTo?: Date | null;
    corePointsCount?: number | null;
    routePointsCount?: number | null;
    drivingPointsCount?: number | null;
    resultState?: TripDetectionState | null;
    resultSummary?: Record<string, unknown> | null;
    errorMessage?: string | null;
    durationMs?: number | null;
  }): Promise<void> {
    try {
      await this.prisma.vehicleTripTrackingRun.create({
        data: {
          vehicleId: input.vehicleId,
          organizationId: input.organizationId ?? null,
          tripId: input.tripId ?? null,
          stateAtRun: input.stateAtRun,
          runType: input.runType,
          requestedFrom: input.requestedFrom ?? null,
          requestedTo: input.requestedTo ?? null,
          corePointsCount: input.corePointsCount ?? null,
          routePointsCount: input.routePointsCount ?? null,
          drivingPointsCount: input.drivingPointsCount ?? null,
          resultState: input.resultState ?? null,
          resultSummary: (input.resultSummary as any) ?? null,
          errorMessage: input.errorMessage ?? null,
          durationMs: input.durationMs ?? null,
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to log tracking run: ${e}`);
    }
  }
}
