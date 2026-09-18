import { Injectable, Logger } from '@nestjs/common';
import {
  Exp021CanaryLiveWindowActivationState,
  Prisma,
  ReferenceCaptureSessionStatus,
  TripStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import { ReferenceCaptureFastGoService } from '../reference-capture-fast-go.service';
import { ACTIVE_REFERENCE_CAPTURE_BLOCKING_STATUSES } from '../reference-capture-prearm.policy';
import { ReferenceCaptureSessionService } from '../reference-capture-session.service';
import { ReferenceCaptureExp021FleetRepository } from '../exp021-fleet/reference-capture-exp021-fleet.repository';
import type { CanaryArmLedgerRow } from './reference-capture-exp021-canary-live-window-activation.arm.lib';
import { mapPrismaLedgerState } from './reference-capture-exp021-canary-live-window-activation.claim.lib';
import {
  buildCanaryLiveWindowActivationConfig,
  CanaryLiveWindowLedgerSnapshot,
  CanaryLiveWindowTripSnapshot,
  runCanaryLiveWindowActivationCoordinatorTick,
} from './reference-capture-exp021-canary-live-window-activation.coordinator.lib';
import {
  EXP021_CANARY_LIVE_WINDOW_ACTIVATION_ENABLED_ENV,
  EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO_ENV,
  EXP021_CANARY_LIVE_WINDOW_CANARY,
} from './reference-capture-exp021-canary-live-window-activation.constants';
import {
  finalizeCanaryLiveWindowRecording,
  ledgerStateAfterCanaryFinalize,
} from './reference-capture-exp021-canary-live-window-activation.finalize.lib';
import { executeIdempotentCanaryArm } from './reference-capture-exp021-canary-live-window-activation.idempotent-arm.lib';

@Injectable()
export class ReferenceCaptureExp021CanaryLiveWindowActivationService {
  private readonly logger = new Logger(ReferenceCaptureExp021CanaryLiveWindowActivationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly referenceCaptureConfig: ReferenceCaptureConfig,
    private readonly sessionService: ReferenceCaptureSessionService,
    private readonly fastGoService: ReferenceCaptureFastGoService,
    private readonly fleetRepository: ReferenceCaptureExp021FleetRepository,
  ) {}

  resolveConfigFromEnv(): ReturnType<typeof buildCanaryLiveWindowActivationConfig> {
    const enabled = process.env[EXP021_CANARY_LIVE_WINDOW_ACTIVATION_ENABLED_ENV] === 'true';
    const notBeforeIso = process.env[EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO_ENV];
    return buildCanaryLiveWindowActivationConfig({ enabled, activationNotBeforeIso: notBeforeIso });
  }

  async runActivationTick(now = new Date()): Promise<void> {
    const config = this.resolveConfigFromEnv();
    if (!config) return;
    if (!this.referenceCaptureConfig.isEnabled()) {
      this.logger.warn('EXP021_CANARY_LIVE_WINDOW_ACTIVATION skipped — REFERENCE_CAPTURE_ENABLED=false');
      return;
    }
    if (!this.referenceCaptureConfig.isSettlementShadowEnabled()) {
      this.logger.warn(
        'EXP021_CANARY_LIVE_WINDOW_ACTIVATION skipped — settlement shadow disabled',
      );
      return;
    }

    const canary = EXP021_CANARY_LIVE_WINDOW_CANARY;
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: canary.vehicleId, organizationId: canary.organizationId },
      select: { dimoVehicle: { select: { tokenId: true } } },
    });
    const tokenId = vehicle?.dimoVehicle?.tokenId;
    if (tokenId !== canary.tokenId) {
      this.logger.error('EXP021 canary vehicle token binding mismatch — fail closed');
      return;
    }

    const notBefore = new Date(config.activationNotBeforeMs);
    const ongoingTrips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId: canary.vehicleId,
        tripStatus: TripStatus.ONGOING,
        startTime: { gte: notBefore },
      },
      select: { id: true, vehicleId: true, startTime: true, endTime: true, tripStatus: true },
      orderBy: { startTime: 'asc' },
      take: 5,
    });

    const completedTrips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId: canary.vehicleId,
        tripStatus: TripStatus.COMPLETED,
        endTime: { gte: notBefore },
      },
      select: { id: true, vehicleId: true, startTime: true, endTime: true, tripStatus: true },
      orderBy: { endTime: 'desc' },
      take: 5,
    });

    const ledgerRows = await this.prisma.exp021CanaryLiveWindowActivationLedger.findMany({
      where: { vehicleId: canary.vehicleId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const ledgerByTripId = new Map<string, CanaryLiveWindowLedgerSnapshot>();
    for (const row of ledgerRows) {
      ledgerByTripId.set(row.vehicleTripId, {
        vehicleTripId: row.vehicleTripId,
        state: mapPrismaLedgerState(row.state),
        sessionId: row.sessionId,
      });
    }

    const blockingSession = await this.prisma.referenceCaptureSession.findFirst({
      where: {
        organizationId: canary.organizationId,
        vehicleId: canary.vehicleId,
        status: { in: ACTIVE_REFERENCE_CAPTURE_BLOCKING_STATUSES },
      },
      select: { id: true },
    });

    if (
      blockingSession &&
      !ledgerRows.some((row) => row.sessionId === blockingSession.id)
    ) {
      this.logger.error({
        msg: 'EXP021_CANARY_ORPHAN_BLOCKING_SESSION_WITHOUT_LEDGER',
        sessionId: blockingSession.id,
        vehicleId: canary.vehicleId,
      });
    }

    const toTripSnapshot = (
      row: (typeof ongoingTrips)[number],
    ): CanaryLiveWindowTripSnapshot => ({
      tripId: row.id,
      vehicleId: row.vehicleId,
      organizationId: canary.organizationId,
      tokenId: canary.tokenId,
      tripStatus: row.tripStatus === TripStatus.COMPLETED ? 'COMPLETED' : 'ONGOING',
      startTimeMs: row.startTime.getTime(),
      endTimeMs: row.endTime?.getTime() ?? null,
    });

    const tick = await runCanaryLiveWindowActivationCoordinatorTick({
      config,
      ongoingTrips: ongoingTrips.map(toTripSnapshot),
      completedTrips: completedTrips.map(toTripSnapshot),
      ledgerByTripId,
      activeBlockingSessionId: blockingSession?.id ?? null,
      ports: {
        armOngoingTrip: (trip) => this.armOngoingTrip(trip, config.activationNotBeforeMs),
        finalizeCompletedTrip: (args) => this.finalizeCompletedTrip(args.trip, args.ledger.sessionId!),
      },
    });

    if (tick.armedTripIds.length || tick.finalizedTripIds.length) {
      this.logger.log({
        msg: 'EXP021_CANARY_LIVE_WINDOW_ACTIVATION_TICK',
        at: now.toISOString(),
        armedTripIds: tick.armedTripIds,
        finalizedTripIds: tick.finalizedTripIds,
        skipped: tick.skippedReasons,
      });
    }
  }

  private async claimVehicleTripLedger(
    trip: CanaryLiveWindowTripSnapshot,
    activationNotBeforeMs: number,
  ): Promise<CanaryArmLedgerRow> {
    const canary = EXP021_CANARY_LIVE_WINDOW_CANARY;
    try {
      const row = await this.prisma.exp021CanaryLiveWindowActivationLedger.create({
        data: {
          organizationId: canary.organizationId,
          vehicleId: canary.vehicleId,
          tokenId: canary.tokenId,
          vehicleTripId: trip.tripId,
          state: Exp021CanaryLiveWindowActivationState.CLAIMED,
          activationNotBeforeAt: new Date(activationNotBeforeMs),
          tripStartTime: new Date(trip.startTimeMs),
        },
      });
      return {
        id: row.id,
        vehicleTripId: row.vehicleTripId,
        state: row.state,
        studyRunId: row.studyRunId,
        sessionId: row.sessionId,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.exp021CanaryLiveWindowActivationLedger.findUnique({
          where: { vehicleTripId: trip.tripId },
        });
        if (!raced) throw error;
        return {
          id: raced.id,
          vehicleTripId: raced.vehicleTripId,
          state: raced.state,
          studyRunId: raced.studyRunId,
          sessionId: raced.sessionId,
        };
      }
      throw error;
    }
  }

  async armOngoingTrip(
    trip: CanaryLiveWindowTripSnapshot,
    activationNotBeforeMs: number,
  ): Promise<{ sessionId: string; studyRunId: string }> {
    const canary = EXP021_CANARY_LIVE_WINDOW_CANARY;
    const ledger = await this.claimVehicleTripLedger(trip, activationNotBeforeMs);

    const enrollment = await this.prisma.exp021StudyEnrollment.findFirst({
      where: {
        vehicleId: canary.vehicleId,
        organizationId: canary.organizationId,
        enrolledTokenId: canary.tokenId,
        enabled: true,
      },
      orderBy: { enrolledAt: 'desc' },
    });
    if (!enrollment) {
      await this.prisma.exp021CanaryLiveWindowActivationLedger.update({
        where: { id: ledger.id },
        data: {
          state: Exp021CanaryLiveWindowActivationState.FAILED,
          failureReason: 'enrollment_not_found',
        },
      });
      throw new Error('Canary enrollment not found');
    }

    return executeIdempotentCanaryArm({
      prisma: this.prisma,
      fleetRepository: this.fleetRepository,
      ledger,
      enrollmentId: enrollment.id,
      resolvedTokenId: canary.tokenId,
      organizationId: canary.organizationId,
      vehicleId: canary.vehicleId,
      createSessionWithId: async (sessionId) => {
        await this.sessionService.createSession({
          sessionId,
          organizationId: canary.organizationId,
          vehicleId: canary.vehicleId,
        });
      },
      getSessionStatus: async (sessionId) => {
        const row = await this.prisma.referenceCaptureSession.findFirst({
          where: { id: sessionId, organizationId: canary.organizationId },
          select: { status: true },
        });
        return row?.status ?? null;
      },
      runPreflight: async (sessionId) => {
        await this.sessionService.runPreflight(canary.organizationId, sessionId);
      },
      executeFastGo: async (sessionId) => {
        const fastGo = await this.fastGoService.executeFastGo({
          organizationId: canary.organizationId,
          vehicleId: canary.vehicleId,
          sessionId,
        });
        return { ready: fastGo.readyToDrive, blockers: fastGo.blockers };
      },
    });
  }

  async finalizeCompletedTrip(trip: CanaryLiveWindowTripSnapshot, sessionId: string): Promise<void> {
    const canary = EXP021_CANARY_LIVE_WINDOW_CANARY;
    const ledger = await this.prisma.exp021CanaryLiveWindowActivationLedger.findUnique({
      where: { vehicleTripId: trip.tripId },
    });
    if (!ledger) return;
    if (
      ledger.state === Exp021CanaryLiveWindowActivationState.TRIP_COMPLETED_SEEN ||
      ledger.state === Exp021CanaryLiveWindowActivationState.FINALIZED
    ) {
      return;
    }

    const session = await this.prisma.referenceCaptureSession.findFirst({
      where: { id: sessionId, organizationId: canary.organizationId },
      select: { id: true, status: true },
    });
    if (!session) {
      await this.prisma.exp021CanaryLiveWindowActivationLedger.update({
        where: { vehicleTripId: trip.tripId },
        data: {
          state: Exp021CanaryLiveWindowActivationState.FAILED,
          failureReason: 'finalize_session_not_found',
        },
      });
      return;
    }

    const result = await finalizeCanaryLiveWindowRecording({
      organizationId: canary.organizationId,
      sessionId,
      session,
      stopRecording: (org, sid) => this.sessionService.stopRecording(org, sid),
    });

    if (result.outcome === 'failed') {
      await this.prisma.exp021CanaryLiveWindowActivationLedger.update({
        where: { vehicleTripId: trip.tripId },
        data: {
          state: Exp021CanaryLiveWindowActivationState.FAILED,
          failureReason: result.reason,
        },
      });
      return;
    }

    await this.prisma.exp021CanaryLiveWindowActivationLedger.update({
      where: { vehicleTripId: trip.tripId },
      data: {
        state: ledgerStateAfterCanaryFinalize(ledger.state),
        tripEndTime: trip.endTimeMs != null ? new Date(trip.endTimeMs) : null,
      },
    });
  }
}
