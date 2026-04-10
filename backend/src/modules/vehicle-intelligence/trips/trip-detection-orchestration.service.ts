import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSegmentsService } from '../../dimo/dimo-segments.service';
import { BatteryV2Service } from '../battery-health/battery-v2.service';
import { TripEnrichmentOrchestratorService } from './trip-enrichment-orchestrator.service';
import {
  TripDetectionState,
  TripStatus,
  TripTrackingRunType,
  DetectionConfidence,
  VehicleDetectionProfile,
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
} from './trip-detection.types';
import {
  evaluateSnapshotEvidence,
  validateTripStart,
  assessActiveContinuity,
  hasActivityResumed,
  evaluatePerformanceActivity,
  evaluateActivityWindow,
  checkTripQuality,
  resolveDetectionProfile,
  haversineM,
} from './trip-evidence.helpers';
import {
  detectTripEndChangePoint,
  hasOngoingActivityInWindow,
} from './trip-cusum';

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
  private readonly COOLDOWN_MS = 5 * 60_000;

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

    if (detState.updatedAt) {
      const sinceLast = Date.now() - detState.updatedAt.getTime();
      if (sinceLast < this.COOLDOWN_MS) {
        return { shouldStartTracking: false };
      }
    }

    const profile = String(detState.detectionProfile ?? VehicleDetectionProfile.UNKNOWN);
    const evidence = evaluateSnapshotEvidence(
      current,
      previousTelemetry
        ? {
            latitude: previousTelemetry.latitude,
            longitude: previousTelemetry.longitude,
            odometerKm: previousTelemetry.odometerKm,
            fuelLevelAbsolute: previousTelemetry.fuelLevelAbsolute,
            evSoc: previousTelemetry.evSoc,
          }
        : null,
      profile,
    );

    if (!evidence.triggered) {
      return { shouldStartTracking: false };
    }

    const now = new Date();
    const confEnum =
      evidence.confidence === 'HIGH'
        ? DetectionConfidence.HIGH
        : evidence.confidence === 'MEDIUM'
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
        startDetectionMode: evidence.mode,
        startConfidence: confEnum,
        lastEvidenceSummary: {
          strong: evidence.strong,
          weak: evidence.weak,
          hasMovement: evidence.hasMovement,
          reasons: evidence.reasons,
          profile,
        },
      },
    );

    await this.schedulePossibleStart(
      vehicleId,
      detState.organizationId,
      dimoTokenId,
    );

    this.logger.log(
      `POSSIBLE_START ${vehicleId} [${profile}]: ${evidence.reasons.join(', ')} (S=${evidence.strong} W=${evidence.weak})`,
    );

    return {
      shouldStartTracking: true,
      reason: evidence.reasons.join(', '),
      startDetectionMode: evidence.mode,
      confidence: evidence.confidence,
      evidenceSummary: {
        strong: evidence.strong,
        weak: evidence.weak,
        hasMovement: evidence.hasMovement,
        reasons: evidence.reasons,
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

      const profile = String(det.detectionProfile ?? VehicleDetectionProfile.UNKNOWN);
      const now = new Date();
      const startAt = det.possibleStartAt ?? now;
      const from = new Date(startAt.getTime() - this.BACKFILL_MS);

      const corePoints = await this.segments.fetchRawTripCoreData(
        dimoTokenId,
        from,
        now,
      );

      const telemetry = await this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
      });

      const validation = validateTripStart(
        corePoints,
        telemetry
          ? {
              isIgnitionOn: telemetry.isIgnitionOn,
              speedKmh: telemetry.speedKmh,
              engineLoad: telemetry.engineLoad,
            }
          : null,
        profile,
      );

      if (validation.confirmed) {
        const confEnum =
          validation.confidence === 'HIGH'
            ? DetectionConfidence.HIGH
            : validation.confidence === 'MEDIUM'
              ? DetectionConfidence.MEDIUM
              : DetectionConfidence.LOW;

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
          startAt,
        );

        if (mergeCheck.shouldMergeWithPrevious && previousTrip?.id) {
          // Reopen the previous trip instead of creating a new one
          await this.prisma.vehicleTrip.update({
            where: { id: previousTrip.id },
            data: { tripStatus: TripStatus.ONGOING, endTime: null },
          });

          resultState = TripDetectionState.ACTIVE_TRIP;
          await this.transitionState(
            vehicleId,
            TripDetectionState.ACTIVE_TRIP,
            {
              activeTripId: previousTrip.id,
              lastCoreProcessedAt: now,
              lastRouteProcessedAt: null,
              lastDrivingProcessedAt: null,
              lastActivityAt: now,
              startDetectionMode: validation.mode,
              startConfidence: confEnum,
            },
          );

          await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);
          this.logger.log(
            `ACTIVE_TRIP merged with previous: vehicle=${vehicleId} trip=${previousTrip.id}`,
          );
        } else {
          const trip = await this.prisma.vehicleTrip.create({
            data: {
              vehicle: { connect: { id: vehicleId } },
              dimoSegmentId: `v2-${vehicleId}-${startAt.getTime()}`,
              tripStatus: TripStatus.ONGOING,
              startTime: startAt,
              startLatitude: telemetry?.latitude,
              startLongitude: telemetry?.longitude,
              durationMinutes: 0,
              detectionProfile: det.detectionProfile,
              startDetectionMode: validation.mode,
              startConfidence: confEnum,
              possibleStartAt: det.possibleStartAt,
              firstActivityAt: now,
            },
          });

          resultState = TripDetectionState.ACTIVE_TRIP;
          await this.transitionState(
            vehicleId,
            TripDetectionState.ACTIVE_TRIP,
            {
              activeTripId: trip.id,
              lastCoreProcessedAt: now,
              lastRouteProcessedAt: null,
              lastDrivingProcessedAt: null,
              lastActivityAt: now,
              startDetectionMode: validation.mode,
              startConfidence: confEnum,
            },
          );

          this.fetchAndStoreStartTemperature(
            dimoTokenId,
            trip.id,
            startAt,
          ).catch((e) =>
            this.logger.warn(`Temp fetch failed for trip ${trip.id}: ${e}`),
          );

          this.fetchAndStoreInitialRoute(
            dimoTokenId,
            trip.id,
            from,
            now,
          ).catch((e) =>
            this.logger.warn(
              `Initial route fetch failed for trip ${trip.id}: ${e}`,
            ),
          );

          // Battery V2: extract crank features from LV battery time series
          this.batteryV2
            .onTripStart(vehicleId, dimoTokenId, trip.id, startAt)
            .catch((e) =>
              this.logger.warn(
                `Battery V2 crank capture failed for trip ${trip.id}: ${e}`,
              ),
            );

          await this.scheduleActiveTick(vehicleId, organizationId, dimoTokenId);
          this.logger.log(
            `ACTIVE_TRIP confirmed: vehicle=${vehicleId} trip=${trip.id} mode=${validation.mode} [${profile}]`,
          );
        }
      } else {
        const elapsed = now.getTime() - startAt.getTime();
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
        resultSummary: validation.summary,
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

      // ── State transition: time-based continuity evaluation (Fix B) ──
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
      const perfActive = evaluatePerformanceActivity(recentPerf);
      // Fall back to the full fetched window if the time-filtered window is empty
      // (sparse data, first tick, or very slow device) to prevent false POSSIBLE_END.
      const evalCore = recentCore.length > 0 ? recentCore : corePoints.slice(-3);
      const continuity = assessActiveContinuity(evalCore, perfActive, profile);

      const stateUpdateBase = {
        lastCoreProcessedAt: now,
        lastRouteProcessedAt: now,
        lastDrivingProcessedAt: now,
      };

      // Track the last moment meaningful movement was observed
      const hadMeaningfulMovement =
        continuity.verdict === 'ACTIVE' &&
        (continuity.summary as any)?.motionCount > 0;

      switch (continuity.verdict) {
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
                continuity.endMode ?? END_DETECTION_MODES.COMPOSITE_INACTIVITY,
              endConfidence:
                continuity.endConfidence === 'HIGH'
                  ? DetectionConfidence.HIGH
                  : continuity.endConfidence === 'MEDIUM'
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
        resultSummary: continuity.summary,
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
      try {
        const recentFrom = new Date(now.getTime() - 90_000);
        const recentPoints = await this.segments.fetchRawTripCoreData(
          dimoTokenId,
          recentFrom,
          now,
        );

        if (hasActivityResumed(recentPoints, profile)) {
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

      // ── CUSUM change-point detection ──
      const cusum = detectTripEndChangePoint(corePoints);

      // ── Still ongoing? → back to ACTIVE_TRIP ──
      if (cusum.appearsOngoing) {
        resultState = TripDetectionState.ACTIVE_TRIP;
        this.logger.log(
          `CUSUM: trip ${vehicleId} still appears ongoing — returning to ACTIVE_TRIP`,
        );
        await this.transitionState(vehicleId, TripDetectionState.ACTIVE_TRIP, {
          possibleEndAt: null,
          endValidationAttempts: 0,
          cusumValidatedAt: null,
          cusumSegmentStart: null,
          cusumSegmentEnd: null,
          lastActivityAt: now,
          lastMeaningfulMovementAt: cusum.lastMovementAt ?? undefined,
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
          resultSummary: { reason: 'cusum_still_ongoing', cusumReason: cusum.reason },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      // ── Clear change-point detected → finalize ──
      if (cusum.changePointDetected && cusum.changePointAt) {
        const validatedEndTime = cusum.changePointAt;

        this.logger.log(
          `CUSUM: change-point detected for ${vehicleId} at ${validatedEndTime.toISOString()} [${cusum.confidence}]`,
        );

        const confEnum =
          cusum.confidence === 'HIGH'
            ? DetectionConfidence.HIGH
            : cusum.confidence === 'MEDIUM'
              ? DetectionConfidence.MEDIUM
              : DetectionConfidence.LOW;

        await this.transitionState(vehicleId, TripDetectionState.POSSIBLE_END, {
          cusumValidatedAt: now,
          cusumSegmentStart: corePoints.length > 0 ? new Date(corePoints[0].timestamp) : null,
          cusumSegmentEnd: validatedEndTime,
          endDetectionMode: END_DETECTION_MODES.CUSUM_VALIDATED,
          endConfidence: confEnum,
          ...(cusum.lastMovementAt && { lastMeaningfulMovementAt: cusum.lastMovementAt }),
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
            confidence: cusum.confidence,
            cusumReason: cusum.reason,
            lastMovementAt: cusum.lastMovementAt?.toISOString(),
          },
          durationMs: Date.now() - startedMs,
        });
        return;
      }

      // ── Inconclusive: reschedule another attempt ──
      this.logger.debug(
        `CUSUM inconclusive for ${vehicleId}: ${cusum.reason} — rescheduling`,
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
          cusumReason: cusum.reason,
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

    try {
      const det = await this.getOrCreateDetectionState(vehicleId, organizationId);
      const tripId = det.activeTripId;

      if (tripId) {
        const trip = await this.prisma.vehicleTrip.findUnique({
          where: { id: tripId },
        });

        if (trip) {
          const lastWaypoint = await this.prisma.vehicleTripWaypoint.findFirst({
            where: { tripId },
            orderBy: { recordedAt: 'desc' },
          });

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

          const qualityCheck = checkTripQuality(
            durationMs,
            trip.distanceKm,
            0,
            null,
            trip.startTime,
          );

          if (qualityCheck.shouldDiscard) {
            await this.prisma.vehicleTrip.update({
              where: { id: tripId },
              data: {
                tripStatus: TripStatus.CANCELLED,
                endTime,
                rawDetectionMeta: {
                  discardReason: qualityCheck.reason,
                  startDetectionMode: det.startDetectionMode,
                  endDetectionMode: det.endDetectionMode,
                  startConfidence: det.startConfidence,
                  endConfidence: det.endConfidence,
                  endTimeSource: chosenEndSource,
                },
              },
            });
            this.logger.log(`Trip ${tripId} discarded for ${vehicleId}: ${qualityCheck.reason}`);
          } else {
            await this.prisma.vehicleTrip.update({
              where: { id: tripId },
              data: {
                tripStatus: TripStatus.COMPLETED,
                endTime,
                durationMinutes: Math.round((durationMs / 60_000) * 10) / 10,
                endDetectionMode:
                  det.endDetectionMode ?? END_DETECTION_MODES.NO_ACTIVITY_TIMEOUT,
                endConfidence: det.endConfidence ?? DetectionConfidence.MEDIUM,
                possibleEndAt: det.possibleEndAt,
                lastActivityAt: det.lastActivityAt,
                rawDetectionMeta: {
                  detectionProfile: det.detectionProfile,
                  startDetectionMode: det.startDetectionMode,
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
              },
            });
            this.logger.log(
              `Trip ${tripId} finalized for ${vehicleId} [endSource=${chosenEndSource} mode=${det.endDetectionMode}]`,
            );

            // V2 finalize: enqueue enrichment through canonical orchestrator
            // (deterministic jobId, idempotency guard, status tracking)
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
        lastActivityAt: null,
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
        lastEvidenceSummary: null,
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
