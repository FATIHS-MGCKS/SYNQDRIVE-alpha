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
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
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
  resolveAnalyticsAssistedEndDecision,
  resolveClickHouseContinuityGuard,
  resolveDetectionProfile,
  isCurrentTelemetryInactive,
  extractLatestSegmentEnd,
} from './trip-evidence.helpers';
// detectTripEndChangePoint → ChangePointEndDetector (Phase 2 seam, done)
import { TripDecisionEngine } from './decision/trip-decision.engine';
import { TripDetectionPolicyResolver } from './policy/trip-detection-policy.resolver';
import {
  DETECTION_PHASES,
  type DetectorFinding,
} from './detectors/detector.interfaces';
import { DetectorRegistry } from './detectors/detector.registry';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import { ClickHouseService } from '@modules/clickhouse/clickhouse.service';
import { isClickHouseTripAssistEnabled } from '@modules/clickhouse/clickhouse-env.util';

type TripTrackingSchedulePhase = 'ps' | 'at' | 'pec' | 'ev' | 'fin';

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

  // ── ClickHouse trip-end assist (first instance; FSM/CUSUM fallback) ──
  private readonly TRIP_END_CH_ASSIST_MIN_STATIONARY_MS: number;
  private readonly TRIP_END_CH_ASSIST_MIN_TRIP_DURATION_MS: number;
  private readonly TRIP_END_CH_ASSIST_STABILITY_MS: number;
  private readonly TRIP_END_CH_ASSIST_HIGH_STATIONARY_MS: number;

  // ── Mid-trip gap split: recognise short ignition-off parks inside a trip ──
  // Silence of at least this duration inside an otherwise ACTIVE trip,
  // sandwiched by stationary data, is treated as a mid-trip end + restart
  // and the trip is split into two canonical trips. Covers the DIMO case
  // where the telematics unit sleeps during a brief stop and no explicit
  // ignition-off signal is ever emitted.
  private readonly TRIP_MID_GAP_SPLIT_MS: number;
  // Max GPS drift between pre-gap and post-gap position that still counts
  // as "same parking spot" (prevents splitting signal dropouts during
  // actual driving, e.g., tunnels).
  private readonly TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M: number;
  // Minimum already-elapsed duration of the trip before we will consider a
  // split. Prevents splitting a trip seconds after it started when a startup
  // hiccup could be mistaken for a parked gap.
  private readonly TRIP_MID_GAP_MIN_PRE_DURATION_MS: number;

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
    @Optional() private readonly clickHouse?: ClickHouseService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {
    this.TRACKING_INTERVAL_MS = this.configService.get<number>('worker.tripTrackingIntervalMs') ?? 30_000;
    this.TRIP_CONTINUITY_CORE_WINDOW_MS = this.configService.get<number>('worker.tripContinuityCoreWindowMs') ?? 120_000;
    this.TRIP_CONTINUITY_PERF_WINDOW_MS = this.configService.get<number>('worker.tripContinuityPerfWindowMs') ?? 90_000;
    this.TRIP_END_TIMEOUT_MS = this.configService.get<number>('worker.tripEndTimeoutMs') ?? 1_800_000;
    this.TRIP_END_STABILITY_WINDOW_MS = this.configService.get<number>('worker.tripEndStabilityWindowMs') ?? 90_000;
    this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS = this.configService.get<number>('worker.tripEndMinInactivityBeforeCusumMs') ?? 120_000;
    this.TRIP_END_VALIDATION_RETRY_MS = this.configService.get<number>('worker.tripEndValidationRetryMs') ?? 60_000;
    this.TRIP_END_VALIDATION_MAX_ATTEMPTS = this.configService.get<number>('worker.tripEndValidationMaxAttempts') ?? 3;
    this.TRIP_END_SEGMENT_LOOKBACK_MS = this.configService.get<number>('worker.tripEndSegmentLookbackMs') ?? 900_000;
    this.TRIP_END_SEGMENT_LOOKAHEAD_MS = this.configService.get<number>('worker.tripEndSegmentLookaheadMs') ?? 300_000;
    this.TRIP_END_CH_ASSIST_MIN_STATIONARY_MS =
      this.configService.get<number>('worker.tripEndChAssistMinStationaryMs') ?? 45_000;
    this.TRIP_END_CH_ASSIST_MIN_TRIP_DURATION_MS =
      this.configService.get<number>('worker.tripEndChAssistMinTripDurationMs') ?? 60_000;
    this.TRIP_END_CH_ASSIST_STABILITY_MS =
      this.configService.get<number>('worker.tripEndChAssistStabilityMs') ?? 30_000;
    this.TRIP_END_CH_ASSIST_HIGH_STATIONARY_MS =
      this.configService.get<number>('worker.tripEndChAssistHighConfidenceStationaryMs') ?? 90_000;
    this.TRIP_MID_GAP_SPLIT_MS = this.configService.get<number>('worker.tripMidGapSplitMs') ?? 180_000;
    this.TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M = this.configService.get<number>('worker.tripMidGapMaxStationaryDriftM') ?? 200;
    this.TRIP_MID_GAP_MIN_PRE_DURATION_MS = this.configService.get<number>('worker.tripMidGapMinPreDurationMs') ?? 60_000;

    this.logger.log(
      `Trip end detection config: trackingIntervalMs=${this.TRACKING_INTERVAL_MS} ` +
        `minInactivityBeforeCusumMs=${this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS} ` +
        `stabilityWindowMs=${this.TRIP_END_STABILITY_WINDOW_MS} ` +
        `validationRetryMs=${this.TRIP_END_VALIDATION_RETRY_MS} ` +
        `validationMaxAttempts=${this.TRIP_END_VALIDATION_MAX_ATTEMPTS} ` +
        `timeoutMs=${this.TRIP_END_TIMEOUT_MS} ` +
        `chEndAssistMinStationaryMs=${this.TRIP_END_CH_ASSIST_MIN_STATIONARY_MS}`,
    );
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

  private tripTrackingJobId(
    phase: TripTrackingSchedulePhase,
    vehicleId: string,
    activeTripId?: string | null,
  ): string {
    if (phase === 'ps') {
      return `trip-ps-${vehicleId}`;
    }
    const tripKey = activeTripId ?? 'pending';
    return `trip-${phase}-${vehicleId}-${tripKey}`;
  }

  private async resolveActiveTripIdForScheduling(
    vehicleId: string,
  ): Promise<string | null> {
    const det = await this.prisma.vehicleTripDetectionState.findUnique({
      where: { vehicleId },
      select: { activeTripId: true },
    });
    return det?.activeTripId ?? null;
  }

  /**
   * Enqueue a trip-tracking job with a stable per-vehicle/phase/trip jobId so
   * concurrent schedule calls do not pile up duplicate BullMQ jobs.
   *
   * Completed jobs are removed (`removeOnComplete`) so legitimate follow-up
   * ticks can reuse the same id after the previous run finishes. When the
   * matching job is still active (self-reschedule from inside the worker),
   * enqueue is deferred to the next event-loop turn.
   */
  private async enqueueTripTrackingJob(
    phase: TripTrackingSchedulePhase,
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
    trigger: TripTrackingJobData['trigger'],
    opts?: {
      delayMs?: number;
      activeTripId?: string | null;
      allowDeferIfActive?: boolean;
    },
  ): Promise<void> {
    if (!canEnqueueQueue(this.logger, 'trip-tracking')) return;

    const activeTripId =
      opts?.activeTripId !== undefined
        ? opts.activeTripId
        : phase === 'ps'
          ? null
          : await this.resolveActiveTripIdForScheduling(vehicleId);

    const jobId = this.tripTrackingJobId(phase, vehicleId, activeTripId);
    const delayMs = opts?.delayMs ?? 0;
    const allowDeferIfActive = opts?.allowDeferIfActive !== false;

    const attemptAdd = async (): Promise<void> => {
      try {
        const existing = await this.trackingQueue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'failed' || state === 'completed') {
            await existing.remove();
          } else if (state === 'waiting' || state === 'delayed') {
            this.logger.debug(
              `Trip tracking job not re-enqueued (already queued): jobId=${jobId} state=${state} trigger=${trigger}`,
            );
            return;
          } else if (state === 'active') {
            if (allowDeferIfActive) {
              this.logger.debug(
                `Trip tracking job deferred until active job completes: jobId=${jobId} trigger=${trigger}`,
              );
              setImmediate(() => {
                void this.enqueueTripTrackingJob(
                  phase,
                  vehicleId,
                  organizationId,
                  dimoTokenId,
                  trigger,
                  { delayMs, activeTripId, allowDeferIfActive: false },
                );
              });
              return;
            }
            this.logger.debug(
              `Trip tracking job not re-enqueued (still active): jobId=${jobId} trigger=${trigger}`,
            );
            return;
          }
        }

        await this.trackingQueue.add(
          'trip-tracking',
          {
            vehicleId,
            organizationId,
            dimoTokenId,
            trigger,
            requestedAt: new Date().toISOString(),
          } satisfies TripTrackingJobData,
          {
            delay: delayMs,
            jobId,
            removeOnComplete: true,
            removeOnFail: 5,
          },
        );
      } catch (err: unknown) {
        const msg = (err as Error).message ?? '';
        if (
          msg.toLowerCase().includes('duplicate') ||
          msg.toLowerCase().includes('already exists')
        ) {
          this.logger.debug(
            `Trip tracking job not re-enqueued (duplicate jobId): jobId=${jobId} trigger=${trigger}`,
          );
          return;
        }
        throw err;
      }
    };

    await attemptAdd();
  }

  async schedulePossibleStart(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
    delayMs = 0,
  ): Promise<void> {
    await this.enqueueTripTrackingJob(
      'ps',
      vehicleId,
      organizationId,
      dimoTokenId,
      TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
      { delayMs },
    );
  }

  async scheduleActiveTick(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
    delayMs?: number,
  ): Promise<void> {
    await this.enqueueTripTrackingJob(
      'at',
      vehicleId,
      organizationId,
      dimoTokenId,
      TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
      { delayMs: delayMs ?? this.TRACKING_INTERVAL_MS },
    );
  }

  async schedulePossibleEndCheck(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
    delayMs?: number,
  ): Promise<void> {
    await this.enqueueTripTrackingJob(
      'pec',
      vehicleId,
      organizationId,
      dimoTokenId,
      TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK,
      { delayMs: delayMs ?? this.TRACKING_INTERVAL_MS },
    );
  }

  async scheduleEndValidation(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
    delayMs?: number,
  ): Promise<void> {
    await this.enqueueTripTrackingJob(
      'ev',
      vehicleId,
      organizationId,
      dimoTokenId,
      TRIP_TRACKING_TRIGGERS.END_VALIDATION,
      { delayMs: delayMs ?? 0 },
    );
  }

  async scheduleFinalize(
    vehicleId: string,
    organizationId: string | null,
    dimoTokenId: number,
  ): Promise<void> {
    await this.enqueueTripTrackingJob(
      'fin',
      vehicleId,
      organizationId,
      dimoTokenId,
      TRIP_TRACKING_TRIGGERS.FINALIZE,
      { delayMs: 0 },
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

          // Battery V2: optional start-window capture for ICE only (never BEV crank).
          if (profile !== VehicleDetectionProfile.EV) {
            this.batteryV2
              .onTripStart(vehicleId, dimoTokenId, trip.id, effectiveStartAt)
              .catch((e) =>
                this.logger.warn(
                  `Battery V2 crank capture failed for trip ${trip.id}: ${e}`,
                ),
              );
          }

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
        const telemetryNoCore = await this.prisma.vehicleLatestState.findUnique({
          where: { vehicleId },
        });
        const chEndAppliedNoCore = await this.tryApplyClickHouseAssistedEnd({
          vehicleId,
          organizationId,
          dimoTokenId,
          tripId,
          det,
          profile,
          tripStartAt: startAt,
          now,
          telemetry: telemetryNoCore,
          corePoints: [],
        });
        if (chEndAppliedNoCore) {
          resultState = TripDetectionState.POSSIBLE_END;
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
            resultSummary: { reason: 'clickhouse_end_assist_no_core_stream' },
            durationMs: Date.now() - startedMs,
          });
          return;
        }

        // ── Inactivity-based POSSIBLE_END transition ────────────────────────
        // DIMO stops streaming core data once the ignition is off and the
        // vehicle drops off the network. Without a core stream the continuity
        // assessment below never runs, so historically the FSM stayed in
        // ACTIVE_TRIP until the 2 h stale-ongoing repair kicked in — leaving
        // the trip visually "ongoing" for up to two hours after the driver
        // parked. If the last meaningful movement is older than the CUSUM
        // inactivity threshold, hand off to POSSIBLE_END and let the
        // POSSIBLE_END_CHECK → END_VALIDATION chain finalize the trip with
        // a proper endTime (lastMeaningfulMovementAt / last waypoint / CUSUM).
        const anchorAt =
          (det as any).lastMeaningfulMovementAt ??
          det.lastActivityAt ??
          det.possibleStartAt ??
          now;
        const inactiveMs = now.getTime() - anchorAt.getTime();
        if (inactiveMs >= this.TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS) {
          resultState = TripDetectionState.POSSIBLE_END;
          await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
            possibleEndAt: anchorAt,
            endValidationAttempts: 0,
            cusumValidatedAt: null,
            cusumSegmentStart: null,
            cusumSegmentEnd: null,
          });
          this.logTripEndTimeline('possible_end_entered', {
            vehicleId,
            tripId,
            lastMeaningfulMovementAt: (det as any).lastMeaningfulMovementAt ?? anchorAt,
            possibleEndAt: anchorAt,
          });
          await this.schedulePossibleEndCheck(
            vehicleId,
            organizationId,
            dimoTokenId,
            0,
          );
          this.logger.log(
            `ACTIVE_TICK: no core data for ${vehicleId}, last movement ${Math.round(inactiveMs / 60_000)}min ago → POSSIBLE_END`,
          );
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
              reason: 'no_core_data_inactivity_to_possible_end',
              inactiveMs,
              anchorAt: anchorAt.toISOString(),
              routePointsCount: routePoints.length,
              drivingPointsCount: perfReadings.length,
            },
            durationMs: Date.now() - startedMs,
          });
          return;
        }

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
            inactiveMs,
            routePointsCount: routePoints.length,
            drivingPointsCount: perfReadings.length,
          },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      // ── Mid-trip gap split (live) ───────────────────────────────────────
      // A sustained stationary silence inside an ACTIVE trip means the
      // vehicle was parked with the engine off and then restarted. DIMO's
      // telematics unit sleeps during such a stop so we never see an
      // ignition-off transition, but the silence + "parked in place" is
      // strong evidence that the old trip ended and a new one begins.
      // Detected here on the LIVE path so the split happens as soon as the
      // new data arrives; a parallel retroactive scan lives in
      // TripReconciliationService.repairIntraTripGapSplits.
      const midGap = this.findMidTripGap(corePoints, det);
      if (midGap) {
        const tripAge =
          new Date().getTime() - det.possibleStartAt!.getTime();
        if (tripAge >= this.TRIP_MID_GAP_MIN_PRE_DURATION_MS) {
          // Validate with GPS drift between the last pre-gap waypoint and
          // the first post-gap waypoint (both still on this trip). If the
          // vehicle drifted more than the stationary threshold, the gap is
          // likely a signal dropout during actual driving (tunnel, rural
          // area) and MUST NOT be split.
          const drift = await this.computeMidGapPositionDrift(
            tripId,
            midGap.firstEndAt,
            midGap.secondStartAt,
          );
          const driftOk =
            drift == null || drift <= this.TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M;

          if (driftOk) {
            try {
              // Persist waypoints that belong to segment 1 (<= firstEndAt)
              // before the split so route rendering stays intact. Anything
              // after the gap will arrive via the next tick on the new trip.
              const seg1Cutoff = det.lastRouteProcessedAt
                ? det.lastRouteProcessedAt.getTime() - 5000
                : 0;
              const seg1Waypoints = routePoints.filter((p) => {
                const tsMs = new Date(p.timestamp).getTime();
                return (
                  tsMs > seg1Cutoff && tsMs <= midGap.firstEndAt.getTime()
                );
              });
              if (seg1Waypoints.length > 0) {
                await this.prisma.vehicleTripWaypoint.createMany({
                  data: seg1Waypoints.map((p) => ({
                    tripId,
                    latitude: p.latitude,
                    longitude: p.longitude,
                    speedKmh: p.speedKmh,
                    recordedAt: new Date(p.timestamp),
                  })),
                });
              }

              const splitResult = await this.decisionEngine.splitTripAtGap({
                tripId,
                firstEndAt: midGap.firstEndAt,
                firstEndLatitude: midGap.firstEndLatitude,
                firstEndLongitude: midGap.firstEndLongitude,
                secondStartAt: midGap.secondStartAt,
                secondStartLatitude: midGap.secondStartLatitude,
                secondStartLongitude: midGap.secondStartLongitude,
                gapMs: midGap.gapMs,
                detectionProfile: String(
                  det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN,
                ),
                reason: 'live_mid_trip_gap_split',
                triggeredBy: 'LIVE_FSM',
              });

              // Re-point the FSM at the continuation trip and reset
              // lifecycle-scoped fields so the next tick processes segment 2
              // from a clean slate.
              await this.transitionState(
                vehicleId,
                TripDetectionState.ACTIVE_TRIP,
                {
                  activeTripId: splitResult.secondTripId,
                  possibleStartAt: midGap.secondStartAt,
                  possibleEndAt: null,
                  endValidationAttempts: 0,
                  endDetectionMode: null,
                  endConfidence: null,
                  cusumValidatedAt: null,
                  cusumSegmentStart: null,
                  cusumSegmentEnd: null,
                  startDetectionMode:
                    'MID_TRIP_GAP_SPLIT' as unknown as StartDetectionMode,
                  startConfidence: 'MEDIUM' as DetectionConfidence,
                  lastActivityAt: midGap.secondStartAt,
                  lastMeaningfulMovementAt: midGap.secondStartAt,
                  // Next fetch windows start at the gap boundary so we do not
                  // re-process segment 1 on the next tick.
                  lastRouteProcessedAt: midGap.secondStartAt,
                  lastDrivingProcessedAt: midGap.secondStartAt,
                  lastCoreProcessedAt: midGap.secondStartAt,
                  startOdometerKm: null,
                  startFuelLevel: null,
                  startEvSoc: null,
                },
              );

              // Enqueue enrichment for the finalized first trip.
              this.enrichmentOrchestrator
                .enqueueBehaviorEnrichment(
                  splitResult.firstTripId,
                  vehicleId,
                  organizationId,
                )
                .catch((e) =>
                  this.logger.warn(
                    `MID_GAP_SPLIT: enrichment enqueue failed for ${splitResult.firstTripId}: ${e}`,
                  ),
                );

              // Schedule the next ACTIVE_TICK so the new trip picks up its
              // own data immediately.
              await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);

              this.logger.log(
                `MID_GAP_SPLIT: vehicle=${vehicleId} firstTrip=${splitResult.firstTripId} ` +
                  `→ secondTrip=${splitResult.secondTripId} gap=${Math.round(midGap.gapMs / 1000)}s ` +
                  `firstEnd=${midGap.firstEndAt.toISOString()} secondStart=${midGap.secondStartAt.toISOString()} ` +
                  `drift=${drift != null ? `${Math.round(drift)}m` : 'unknown'}`,
              );

              this.tripMetrics?.tripEvidencePaths.inc({
                phase: 'mid_gap_split',
                path: 'live_fsm',
              });

              await this.logTrackingRun({
                vehicleId,
                organizationId,
                tripId: splitResult.secondTripId,
                stateAtRun: det.state,
                runType: TripTrackingRunType.ACTIVE_TRACKING,
                requestedFrom: coreFrom,
                requestedTo: now,
                corePointsCount: corePoints.length,
                routePointsCount: routePoints.length,
                drivingPointsCount: perfReadings.length,
                resultState: TripDetectionState.ACTIVE_TRIP,
                resultSummary: {
                  reason: 'live_mid_trip_gap_split_applied',
                  firstTripId: splitResult.firstTripId,
                  secondTripId: splitResult.secondTripId,
                  firstEndAt: midGap.firstEndAt.toISOString(),
                  secondStartAt: midGap.secondStartAt.toISOString(),
                  gapMs: midGap.gapMs,
                  driftM: drift,
                },
                durationMs: Date.now() - startedMs,
              });

              return;
            } catch (err) {
              this.logger.warn(
                `MID_GAP_SPLIT: split failed for ${vehicleId}: ${err}`,
              );
              // Fall through and continue the tick as normal.
            }
          } else {
            this.logger.debug(
              `MID_GAP_SPLIT: rejected for ${vehicleId} — drift=${Math.round(drift!)}m ` +
                `exceeds ${this.TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M}m (likely signal dropout, not park)`,
            );
          }
        }
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

      const chEndApplied = await this.tryApplyClickHouseAssistedEnd({
        vehicleId,
        organizationId,
        dimoTokenId,
        tripId,
        det,
        profile,
        tripStartAt: startAt,
        now,
        telemetry,
        corePoints,
      });
      if (chEndApplied) {
        resultState = TripDetectionState.POSSIBLE_END;
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
          resultSummary: { reason: 'clickhouse_end_assist_applied' },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

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
        select: { tankCapacityLiters: true, fuelType: true },
      });
      const maxTank = vehicleForTank?.tankCapacityLiters ?? 120;
      // EV gating (V4.6.46): no ICE tank → skip legacy fuel delta entirely.
      // Battery-electric consumption is tracked via energyUsedKwh below.
      const isEv = vehicleForTank?.fuelType === 'ELECTRIC';

      let fuelUsedLiters: number | null = null;
      if (
        !isEv &&
        det.startFuelLevel != null &&
        telemetry?.fuelLevelAbsolute != null
      ) {
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
          {
            const possibleEndAt =
              det.lastMeaningfulMovementAt ??
              det.lastActivityAt ??
              now;
            await this.transitionState(
              vehicleId,
              TripDetectionState.POSSIBLE_END,
              {
                ...stateUpdateBase,
                possibleEndAt,
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
            this.logTripEndTimeline('possible_end_entered', {
              vehicleId,
              tripId,
              lastMeaningfulMovementAt: det.lastMeaningfulMovementAt,
              possibleEndAt,
            });
          }
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

        const activityResumed = await this.checkDimoActivityResumed({
          vehicleId,
          dimoTokenId,
          profile: det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN,
          now,
          corePoints: recentPoints,
        });

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
      const cusumGateMs =
        det.endDetectionMode === END_DETECTION_MODES.CLICKHOUSE_END_ASSIST
          ? this.TRIP_END_CH_ASSIST_STABILITY_MS
          : Math.max(
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
        const validationStartedAt = now;
        const priorSummary =
          (det.lastEvidenceSummary as Record<string, unknown> | null) ?? {};
        await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
          endValidationAttempts: attempts + 1,
          lastEvidenceSummary: {
            ...priorSummary,
            endValidationStartedAt: validationStartedAt.toISOString(),
          },
        });
        this.logTripEndTimeline('end_validation_started', {
          vehicleId,
          tripId: det.activeTripId,
          lastMeaningfulMovementAt: det.lastMeaningfulMovementAt,
          possibleEndAt: det.possibleEndAt,
          endValidationStartedAt: validationStartedAt,
          attempt: attempts + 1,
          maxAttempts: this.TRIP_END_VALIDATION_MAX_ATTEMPTS,
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
      this.tripMetrics?.possibleEndStuck.set(
        { vehicle_profile: String(det.detectionProfile ?? 'UNKNOWN') },
        1,
      );
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

      // ── CH end assist (MEDIUM): segment end already validated — skip CUSUM ──
      if (
        det.endDetectionMode === END_DETECTION_MODES.CLICKHOUSE_END_ASSIST &&
        det.cusumSegmentEnd
      ) {
        const validatedEndTime = det.cusumSegmentEnd;
        const endConfEnum = det.endConfidence ?? DetectionConfidence.MEDIUM;

        this.logTripEndTimeline('clickhouse_end_assist_confirmed', {
          vehicleId,
          tripId: det.activeTripId,
          lastMeaningfulMovementAt: det.lastMeaningfulMovementAt,
          possibleEndAt: det.possibleEndAt,
          finalizedAt: validatedEndTime,
          endSource: 'clickhouse_segment_end',
        });

        await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
          cusumValidatedAt: now,
          endDetectionMode: END_DETECTION_MODES.CLICKHOUSE_END_ASSIST,
          endConfidence: endConfEnum,
        });

        resultState = TripDetectionState.RESTING;
        await this.scheduleFinalize(vehicleId, organizationId, dimoTokenId);

        await this.logTrackingRun({
          vehicleId,
          organizationId,
          tripId: det.activeTripId,
          stateAtRun: TripDetectionState.POSSIBLE_END,
          runType: TripTrackingRunType.END_VALIDATION,
          resultState,
          resultSummary: {
            reason: 'clickhouse_end_assist_skip_cusum',
            validatedEndTime: validatedEndTime.toISOString(),
          },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

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

        this.logTripEndTimeline('cusum_confirmed', {
          vehicleId,
          tripId: det.activeTripId,
          lastMeaningfulMovementAt: det.lastMeaningfulMovementAt,
          possibleEndAt: det.possibleEndAt,
          endValidationStartedAt: this.parseEvidenceTimestamp(
            det.lastEvidenceSummary,
            'endValidationStartedAt',
          ),
          finalizedAt: validatedEndTime,
          latencyFromMovementMs:
            det.lastMeaningfulMovementAt != null
              ? validatedEndTime.getTime() - det.lastMeaningfulMovementAt.getTime()
              : null,
          endSource: 'cusum_segment_end',
        });

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
            det.endDetectionMode === END_DETECTION_MODES.CLICKHOUSE_END_ASSIST &&
            (det as any).cusumSegmentEnd
              ? 'clickhouse_segment_end'
              : (det as any).cusumSegmentEnd
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
            this.tripMetrics?.tripQualityAnomalies.inc({
              anomaly_type: qualityCheck.reason ?? 'quality_check_failed',
            });
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

            const movementAnchor =
              (det as any).lastMeaningfulMovementAt ??
              det.possibleEndAt ??
              null;
            if (movementAnchor) {
              const latencyFromMovementMs = endTime.getTime() - movementAnchor.getTime();
              if (latencyFromMovementMs >= 0) {
                this.tripMetrics?.tripEndLatencyFromMovement.observe(
                  { profile: profileLabel, end_source: chosenEndSource },
                  latencyFromMovementMs / 1000,
                );
              }
            }

            this.logTripEndTimeline('trip_finalized', {
              vehicleId,
              tripId,
              lastMeaningfulMovementAt: (det as any).lastMeaningfulMovementAt ?? null,
              possibleEndAt: det.possibleEndAt,
              endValidationStartedAt: this.parseEvidenceTimestamp(
                det.lastEvidenceSummary,
                'endValidationStartedAt',
              ),
              finalizedAt: endTime,
              endSource: chosenEndSource,
              latencyFromMovementMs:
                movementAnchor != null
                  ? endTime.getTime() - movementAnchor.getTime()
                  : null,
            });

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
    if (!isClickHouseTripAssistEnabled()) return false;
    if (!this.clickHouse?.isAvailable) return false;
    return (
      this.detectorRegistry.get('ActivityWindowDetector') != null &&
      this.detectorRegistry.get('IgnitionSegmentDetector') != null
    );
  }

  /**
   * DIMO recent-core resume check shared by CH end assist and POSSIBLE_END_CHECK.
   */
  private async checkDimoActivityResumed(params: {
    vehicleId: string;
    dimoTokenId: number;
    profile: VehicleDetectionProfile;
    now: Date;
    corePoints?: Awaited<ReturnType<DimoSegmentsService['fetchRawTripCoreData']>>;
  }): Promise<boolean> {
    const recentFrom = new Date(params.now.getTime() - 90_000);
    const recentPoints =
      params.corePoints != null
        ? params.corePoints.filter(
            (p) => new Date(p.timestamp).getTime() >= recentFrom.getTime(),
          )
        : await this.segments.fetchRawTripCoreData(
            params.dimoTokenId,
            recentFrom,
            params.now,
          );

    const resumeFindings = await this.detectorRegistry.runAll(
      ['EndContinuityDetector'],
      {
        vehicleId: params.vehicleId,
        dimoTokenId: params.dimoTokenId,
        profile: params.profile,
        phase: DETECTION_PHASES.POSSIBLE_END,
        coreDataPoints: recentPoints,
      },
    );
    return resumeFindings.some(
      (f) =>
        f.detectorName === 'EndContinuityDetector' && f.verdict === 'TRIGGERED',
    );
  }

  private async cancelPossibleEndForResumedActivity(params: {
    vehicleId: string;
    organizationId: string | null;
    dimoTokenId: number;
    now: Date;
  }): Promise<void> {
    await this.transitionState(params.vehicleId, TripDetectionState.ACTIVE_TRIP, {
      possibleEndAt: null,
      endDetectionMode: null,
      endConfidence: null,
      endValidationAttempts: 0,
      cusumValidatedAt: null,
      cusumSegmentStart: null,
      cusumSegmentEnd: null,
      lastActivityAt: params.now,
      lastMeaningfulMovementAt: params.now,
      lastCoreProcessedAt: params.now,
    });
    await this.scheduleActiveTick(
      params.vehicleId,
      params.organizationId,
      params.dimoTokenId,
    );
  }

  private async resolveContinuityFindingForEndAssist(params: {
    vehicleId: string;
    dimoTokenId: number;
    profile: VehicleDetectionProfile;
    tripStartAt: Date;
    now: Date;
    corePoints: Awaited<ReturnType<DimoSegmentsService['fetchRawTripCoreData']>>;
  }): Promise<DetectorFinding | undefined> {
    const nowMs = params.now.getTime();
    const recentCore =
      params.corePoints.length > 0
        ? params.corePoints.filter(
            (p) => nowMs - new Date(p.timestamp).getTime() <= this.TRIP_CONTINUITY_CORE_WINDOW_MS,
          )
        : [];
    const evalCore =
      recentCore.length > 0 ? recentCore : params.corePoints.slice(-3);

    const continuityFindings = await this.detectorRegistry.runAll(
      ['ContinuityAssessmentDetector'],
      {
        vehicleId: params.vehicleId,
        dimoTokenId: params.dimoTokenId,
        profile: params.profile,
        phase: DETECTION_PHASES.ACTIVE_TRIP,
        timeWindow: { from: params.tripStartAt, to: params.now },
        coreDataPoints: evalCore,
        performanceReadings: [],
      },
    );
    return continuityFindings.find(
      (f) => f.detectorName === 'ContinuityAssessmentDetector',
    );
  }

  /**
   * ClickHouse-first trip end assist. Returns true when an end path was
   * scheduled (caller should stop the active tick). FSM/CUSUM remains fallback.
   */
  private async tryApplyClickHouseAssistedEnd(params: {
    vehicleId: string;
    organizationId: string | null;
    dimoTokenId: number;
    tripId: string;
    det: DetState;
    profile: string;
    tripStartAt: Date;
    now: Date;
    telemetry: VehicleLatestState | null;
    corePoints: Awaited<ReturnType<DimoSegmentsService['fetchRawTripCoreData']>>;
  }): Promise<boolean> {
    if (!this.hasClickHouseAnalyticsDetectors()) return false;

    const currentTelemetry = params.telemetry
      ? {
          isIgnitionOn: params.telemetry.isIgnitionOn,
          speedKmh: params.telemetry.speedKmh,
          engineLoad: params.telemetry.engineLoad,
        }
      : null;

    if (!isCurrentTelemetryInactive(currentTelemetry)) return false;

    const profileEnum =
      params.det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN;

    const isEvProfile =
      params.profile === 'EV' ||
      params.profile === 'HYBRID' ||
      params.profile === 'UNKNOWN';
    if (isEvProfile && !this.detectorRegistry.get('MotionSegmentDetector')) {
      this.logger.debug(
        `CH end assist skipped for ${params.vehicleId}: MotionSegmentDetector unavailable for EV profile`,
      );
      return false;
    }

    const endAssistPolicy = this.policyResolver.resolve({
      phase: DETECTION_PHASES.ACTIVE_TRIP,
      profile: profileEnum,
      dataQuality: {
        snapshotFreshness: params.telemetry?.updatedAt ? 'FRESH' : 'MISSING',
        ignitionAvailable: params.telemetry?.isIgnitionOn != null,
        speedAvailable: params.telemetry?.speedKmh != null,
        odometerAvailable: params.telemetry?.odometerKm != null,
        telemetryDensity: params.corePoints.length >= 4 ? 'HIGH' : 'LOW',
        routeCoverage: 'NONE',
        highFrequencyAvailable: true,
      },
      anomalyContext: {
        confirmingEnd: true,
        clickhouseAvailable: true,
      },
    });

    const segmentDetectorNames = endAssistPolicy.detectors.filter(
      (name) => name !== 'ActivityWindowDetector',
    );

    const segmentFindings = await this.detectorRegistry.runAll(
      segmentDetectorNames,
      {
        vehicleId: params.vehicleId,
        dimoTokenId: params.dimoTokenId,
        profile: profileEnum,
        phase: DETECTION_PHASES.ACTIVE_TRIP,
        timeWindow: { from: params.tripStartAt, to: params.now },
        anomalyContext: { confirmingEnd: true, clickhouseAvailable: true },
      },
      endAssistPolicy.timeoutMs,
    );

    const ignitionSegment = segmentFindings.find(
      (f) => f.detectorName === 'IgnitionSegmentDetector',
    );
    const motionSegment = segmentFindings.find(
      (f) => f.detectorName === 'MotionSegmentDetector',
    );

    const preliminaryEnd = extractLatestSegmentEnd(
      { ignitionSegment, motionSegment },
      params.tripStartAt,
      params.now,
      isEvProfile,
    );

    let activityWindow = undefined;
    if (preliminaryEnd) {
      const postStopFrom = new Date(
        Math.max(
          preliminaryEnd.endAt.getTime(),
          params.now.getTime() - 5 * 60_000,
        ),
      );
      const activityFindings = await this.detectorRegistry.runAll(
        ['ActivityWindowDetector'],
        {
          vehicleId: params.vehicleId,
          dimoTokenId: params.dimoTokenId,
          profile: profileEnum,
          phase: DETECTION_PHASES.ACTIVE_TRIP,
          timeWindow: { from: postStopFrom, to: params.now },
          anomalyContext: { confirmingEnd: true, clickhouseAvailable: true },
        },
        endAssistPolicy.timeoutMs,
      );
      activityWindow = activityFindings.find(
        (f) => f.detectorName === 'ActivityWindowDetector',
      );
    }

    const continuityFinding = await this.resolveContinuityFindingForEndAssist({
      vehicleId: params.vehicleId,
      dimoTokenId: params.dimoTokenId,
      profile: profileEnum,
      tripStartAt: params.tripStartAt,
      now: params.now,
      corePoints: params.corePoints,
    });

    const endDecision = resolveAnalyticsAssistedEndDecision({
      continuityFinding,
      activityWindow,
      ignitionSegment,
      motionSegment,
      profile: params.profile,
      tripStartAt: params.tripStartAt,
      now: params.now,
      currentTelemetry,
      minStationaryAfterSegmentMs: this.TRIP_END_CH_ASSIST_MIN_STATIONARY_MS,
      minTripDurationMs: this.TRIP_END_CH_ASSIST_MIN_TRIP_DURATION_MS,
      highConfidenceStationaryMs: this.TRIP_END_CH_ASSIST_HIGH_STATIONARY_MS,
    });

    if (!endDecision.confirmed || !endDecision.detectedEndAt) return false;

    const recentFrom = new Date(params.now.getTime() - 90_000);
    const recentPoints =
      params.corePoints.length > 0
        ? params.corePoints.filter(
            (p) => new Date(p.timestamp).getTime() >= recentFrom.getTime(),
          )
        : undefined;

    if (
      await this.checkDimoActivityResumed({
        vehicleId: params.vehicleId,
        dimoTokenId: params.dimoTokenId,
        profile: profileEnum,
        now: params.now,
        corePoints: recentPoints,
      })
    ) {
      return false;
    }

    const endConfEnum =
      endDecision.confidence === 'HIGH'
        ? DetectionConfidence.HIGH
        : endDecision.confidence === 'MEDIUM'
          ? DetectionConfidence.MEDIUM
          : DetectionConfidence.LOW;

    const detectedEndAt = endDecision.detectedEndAt;

    this.tripMetrics?.tripEvidencePaths.inc({
      phase: 'end_assist',
      path: endDecision.evidencePath,
    });

    this.logger.log(
      `CH end assist for ${params.vehicleId}: end at ${detectedEndAt.toISOString()} ` +
        `[${endDecision.confidence}] path=${endDecision.evidencePath}`,
    );

    this.logTripEndTimeline('clickhouse_end_assist', {
      vehicleId: params.vehicleId,
      tripId: params.tripId,
      lastMeaningfulMovementAt: (params.det as any).lastMeaningfulMovementAt,
      possibleEndAt: detectedEndAt,
      finalizedAt: detectedEndAt,
      endSource: 'clickhouse_segment_end',
      confidence: endDecision.confidence,
    });

    await this.transitionState(params.vehicleId, TripDetectionState.POSSIBLE_END, {
      possibleEndAt: detectedEndAt,
      endValidationAttempts: 0,
      cusumValidatedAt: null,
      cusumSegmentStart: params.tripStartAt,
      cusumSegmentEnd: detectedEndAt,
      endDetectionMode: END_DETECTION_MODES.CLICKHOUSE_END_ASSIST,
      endConfidence: endConfEnum,
      lastMeaningfulMovementAt: detectedEndAt,
      lastEvidenceSummary: {
        clickhouseEndAssist: endDecision.summary,
        clickhouseEndEvidencePath: endDecision.evidencePath,
        dimoContinuityCorroborated:
          endDecision.evidencePath === 'DIMO_PLUS_CLICKHOUSE',
      },
    });

    if (endDecision.confidence === 'HIGH') {
      if (
        await this.checkDimoActivityResumed({
          vehicleId: params.vehicleId,
          dimoTokenId: params.dimoTokenId,
          profile: profileEnum,
          now: params.now,
          corePoints: recentPoints,
        })
      ) {
        this.logger.log(
          `CH end assist HIGH cancelled for ${params.vehicleId}: DIMO activity resumed before finalize`,
        );
        await this.cancelPossibleEndForResumedActivity({
          vehicleId: params.vehicleId,
          organizationId: params.organizationId,
          dimoTokenId: params.dimoTokenId,
          now: params.now,
        });
        return false;
      }

      await this.transitionState(params.vehicleId, TripDetectionState.POSSIBLE_END, {
        cusumValidatedAt: params.now,
      });
      await this.scheduleFinalize(
        params.vehicleId,
        params.organizationId,
        params.dimoTokenId,
      );
    } else {
      await this.schedulePossibleEndCheck(
        params.vehicleId,
        params.organizationId,
        params.dimoTokenId,
        0,
      );
    }

    return true;
  }

  // ══════════════════════════════════════════════════════════
  //  MID-TRIP GAP DETECTION
  // ══════════════════════════════════════════════════════════

  /**
   * Scans a batch of DIMO core points for a mid-trip stationary silence
   * sandwiched between "stopped" and "moving" samples. The anchor is the
   * detection-state's `lastMeaningfulMovementAt`, which represents the
   * previous tick's latest confirmed motion timestamp — so we also detect
   * cross-tick gaps (silence spanning the entire fetch window).
   *
   * Returns the gap boundary and the indicative pre/post coordinates,
   * or `null` if no qualifying gap is present.
   *
   * NOTE: This is evidence only. The orchestrator MUST additionally check
   * GPS drift via `computeMidGapPositionDrift` before actually splitting.
   */
  private findMidTripGap(
    corePoints: Awaited<ReturnType<DimoSegmentsService['fetchRawTripCoreData']>>,
    det: DetState,
  ): {
    gapMs: number;
    firstEndAt: Date;
    firstEndLatitude: number | null;
    firstEndLongitude: number | null;
    secondStartAt: Date;
    secondStartLatitude: number | null;
    secondStartLongitude: number | null;
  } | null {
    if (corePoints.length === 0) return null;

    const anchorAt =
      (det as any).lastMeaningfulMovementAt ??
      det.lastActivityAt ??
      null;

    // Sort defensively (service already sorts but guard anyway).
    const sorted = [...corePoints].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    type TP = { ts: Date; speed: number | null; ign: boolean | null };
    const timeline: TP[] = [];

    // Prepend synthetic anchor (stationary assumption since no motion was
    // recorded between that timestamp and now).
    if (anchorAt) {
      timeline.push({ ts: anchorAt, speed: 0, ign: null });
    }
    for (const p of sorted) {
      timeline.push({
        ts: new Date(p.timestamp),
        speed: p.speed ?? null,
        ign: p.isIgnitionOn ?? null,
      });
    }

    if (timeline.length < 2) return null;

    let bestIdx = -1;
    let bestGapMs = 0;
    for (let i = 1; i < timeline.length; i++) {
      const before = timeline[i - 1];
      const after = timeline[i];
      const gapMs = after.ts.getTime() - before.ts.getTime();
      if (gapMs < this.TRIP_MID_GAP_SPLIT_MS) continue;
      const beforeStopped = before.speed == null || before.speed <= 5;
      if (!beforeStopped) continue;
      if (gapMs > bestGapMs) {
        bestIdx = i;
        bestGapMs = gapMs;
      }
    }

    if (bestIdx < 0) return null;

    // Confirm motion resumed at/after the gap: the `after` sample itself
    // is moving, OR a later sample in the same batch shows motion.
    const after = timeline[bestIdx];
    const afterMoving = after.speed != null && after.speed > 5;
    const anyLaterMoving = timeline
      .slice(bestIdx)
      .some((p) => p.speed != null && p.speed > 5);
    if (!afterMoving && !anyLaterMoving) return null;

    // Resolve the split point: prefer the after-gap sample if it shows
    // motion; otherwise advance to the first later sample that does.
    let secondStartIdx = bestIdx;
    if (!afterMoving) {
      for (let i = bestIdx + 1; i < timeline.length; i++) {
        const p = timeline[i];
        if (p.speed != null && p.speed > 5) {
          secondStartIdx = i;
          break;
        }
      }
    }

    const before = timeline[bestIdx - 1];
    const second = timeline[secondStartIdx];

    // Lat/Lng are not on the core-data shape — caller will resolve these
    // via waypoints when drift-validating the split.
    return {
      gapMs: bestGapMs,
      firstEndAt: before.ts,
      firstEndLatitude: null,
      firstEndLongitude: null,
      secondStartAt: second.ts,
      secondStartLatitude: null,
      secondStartLongitude: null,
    };
  }

  /**
   * Returns the GPS drift in metres between the last pre-gap waypoint and
   * the first post-gap waypoint for the given trip. If either waypoint is
   * missing (e.g., route enrichment lagged), returns `null` — callers should
   * treat that as "cannot validate, allow split" to avoid blocking the fix
   * on missing route data for live detections.
   */
  private async computeMidGapPositionDrift(
    tripId: string,
    firstEndAt: Date,
    secondStartAt: Date,
  ): Promise<number | null> {
    const [pre, post] = await Promise.all([
      this.prisma.vehicleTripWaypoint.findFirst({
        where: { tripId, recordedAt: { lte: firstEndAt } },
        orderBy: { recordedAt: 'desc' },
        select: { latitude: true, longitude: true, recordedAt: true },
      }),
      this.prisma.vehicleTripWaypoint.findFirst({
        where: { tripId, recordedAt: { gte: secondStartAt } },
        orderBy: { recordedAt: 'asc' },
        select: { latitude: true, longitude: true, recordedAt: true },
      }),
    ]);
    if (!pre || !post) return null;
    return this.haversineMeters(
      pre.latitude,
      pre.longitude,
      post.latitude,
      post.longitude,
    );
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
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
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

  private parseEvidenceTimestamp(
    summary: unknown,
    key: string,
  ): Date | null {
    if (!summary || typeof summary !== 'object') return null;
    const raw = (summary as Record<string, unknown>)[key];
    if (typeof raw !== 'string') return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private logTripEndTimeline(
    phase:
      | 'possible_end_entered'
      | 'end_validation_started'
      | 'clickhouse_end_assist'
      | 'clickhouse_end_assist_confirmed'
      | 'cusum_confirmed'
      | 'trip_finalized',
    input: {
      vehicleId: string;
      tripId?: string | null;
      lastMeaningfulMovementAt?: Date | null;
      possibleEndAt?: Date | null;
      endValidationStartedAt?: Date | null;
      finalizedAt?: Date | null;
      endSource?: string;
      confidence?: string;
      latencyFromMovementMs?: number | null;
      attempt?: number;
      maxAttempts?: number;
    },
  ): void {
    const fmt = (d?: Date | null) => (d ? d.toISOString() : '—');
    const latencySec =
      input.latencyFromMovementMs != null
        ? Math.round(input.latencyFromMovementMs / 1000)
        : null;

    this.logger.log(
      `TRIP_END_TIMELINE phase=${phase} vehicle=${input.vehicleId}` +
        (input.tripId ? ` trip=${input.tripId}` : '') +
        ` lastMeaningfulMovementAt=${fmt(input.lastMeaningfulMovementAt)}` +
        ` possibleEndAt=${fmt(input.possibleEndAt)}` +
        ` endValidationStartedAt=${fmt(input.endValidationStartedAt)}` +
        ` finalizedAt=${fmt(input.finalizedAt)}` +
        (latencySec != null ? ` latencyFromMovementSec=${latencySec}` : '') +
        (input.endSource ? ` endSource=${input.endSource}` : '') +
        (input.confidence ? ` confidence=${input.confidence}` : '') +
        (input.attempt != null
          ? ` cusumAttempt=${input.attempt}/${input.maxAttempts ?? '?'}`
          : ''),
    );
  }

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
