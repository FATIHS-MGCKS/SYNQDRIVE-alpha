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
import { ReferenceCaptureSettlementShadowService } from '../reference-capture-settlement-shadow.service';
import { ReferenceCaptureExp021FleetRepository } from '../exp021-fleet/reference-capture-exp021-fleet.repository';
import { publishCanaryLiveWindowPhysicalDriveInterval } from './reference-capture-exp021-canary-live-window-pdi-publish.lib';
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
} from './reference-capture-exp021-canary-live-window-activation.constants';
import {
  resolveExp021CanaryCohortFromEnv,
  type Exp021CanaryCohortMember,
} from './reference-capture-exp021-canary-live-window-cohort.lib';
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
    private readonly settlementShadowService: ReferenceCaptureSettlementShadowService,
  ) {}

  resolveConfigFromEnv(): ReturnType<typeof buildCanaryLiveWindowActivationConfig> {
    const enabled = process.env[EXP021_CANARY_LIVE_WINDOW_ACTIVATION_ENABLED_ENV] === 'true';
    const notBeforeIso = process.env[EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO_ENV];
    const cohort = resolveExp021CanaryCohortFromEnv();
    return buildCanaryLiveWindowActivationConfig({
      enabled,
      activationNotBeforeIso: notBeforeIso,
      cohort,
    });
  }

  private async resolveEligibleCohortMembers(
    cohort: NonNullable<ReturnType<typeof buildCanaryLiveWindowActivationConfig>>['cohort'],
  ): Promise<Exp021CanaryCohortMember[]> {
    const vehicleIds = cohort.members.map((m) => m.vehicleId);
    const vehicles = await this.prisma.vehicle.findMany({
      where: { id: { in: vehicleIds } },
      select: {
        id: true,
        organizationId: true,
        dimoVehicle: { select: { tokenId: true } },
      },
    });
    const eligible: Exp021CanaryCohortMember[] = [];
    for (const member of cohort.members) {
      const row = vehicles.find((v) => v.id === member.vehicleId);
      const boundToken = row?.dimoVehicle?.tokenId;
      if (
        !row ||
        row.organizationId !== member.organizationId ||
        boundToken !== member.tokenId
      ) {
        this.logger.error({
          msg: 'EXP021_CANARY_COHORT_MEMBER_BINDING_INVALID',
          vehicleId: member.vehicleId,
          expectedTokenId: member.tokenId,
          resolvedTokenId: boundToken ?? null,
        });
        continue;
      }
      eligible.push(member);
    }
    return eligible;
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

    const eligibleMembers = await this.resolveEligibleCohortMembers(config.cohort);
    if (eligibleMembers.length === 0) {
      this.logger.error('EXP021 canary cohort has zero eligible members — fail closed');
      return;
    }

    const eligibleVehicleIds = eligibleMembers.map((m) => m.vehicleId);
    const memberByVehicleId = new Map(eligibleMembers.map((m) => [m.vehicleId, m]));

    const notBefore = new Date(config.activationNotBeforeMs);
    const ongoingTrips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId: { in: eligibleVehicleIds },
        tripStatus: TripStatus.ONGOING,
        startTime: { gte: notBefore },
      },
      select: { id: true, vehicleId: true, startTime: true, endTime: true, tripStatus: true },
      orderBy: { startTime: 'asc' },
      take: 15,
    });

    const completedTrips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId: { in: eligibleVehicleIds },
        tripStatus: TripStatus.COMPLETED,
        endTime: { gte: notBefore },
      },
      select: { id: true, vehicleId: true, startTime: true, endTime: true, tripStatus: true },
      orderBy: { endTime: 'desc' },
      take: 15,
    });

    const ledgerRows = await this.prisma.exp021CanaryLiveWindowActivationLedger.findMany({
      where: { vehicleId: { in: eligibleVehicleIds } },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    const ledgerByTripId = new Map<string, CanaryLiveWindowLedgerSnapshot>();
    for (const row of ledgerRows) {
      ledgerByTripId.set(row.vehicleTripId, {
        vehicleTripId: row.vehicleTripId,
        state: mapPrismaLedgerState(row.state),
        sessionId: row.sessionId,
      });
    }

    const blockingSessions = await this.prisma.referenceCaptureSession.findMany({
      where: {
        vehicleId: { in: eligibleVehicleIds },
        status: { in: ACTIVE_REFERENCE_CAPTURE_BLOCKING_STATUSES },
      },
      select: { id: true, vehicleId: true, organizationId: true },
    });
    const activeBlockingSessionByVehicleId = new Map<string, string>();
    for (const session of blockingSessions) {
      activeBlockingSessionByVehicleId.set(session.vehicleId, session.id);
      if (!ledgerRows.some((row) => row.sessionId === session.id)) {
        this.logger.error({
          msg: 'EXP021_CANARY_ORPHAN_BLOCKING_SESSION_WITHOUT_LEDGER',
          sessionId: session.id,
          vehicleId: session.vehicleId,
        });
      }
    }

    const toTripSnapshot = (
      row: (typeof ongoingTrips)[number] | (typeof completedTrips)[number],
    ): CanaryLiveWindowTripSnapshot | null => {
      const member = memberByVehicleId.get(row.vehicleId);
      if (!member) return null;
      return {
        tripId: row.id,
        vehicleId: row.vehicleId,
        organizationId: member.organizationId,
        tokenId: member.tokenId,
        tripStatus: row.tripStatus === TripStatus.COMPLETED ? 'COMPLETED' : 'ONGOING',
        startTimeMs: row.startTime.getTime(),
        endTimeMs: row.endTime?.getTime() ?? null,
      };
    };

    const tick = await runCanaryLiveWindowActivationCoordinatorTick({
      config,
      ongoingTrips: ongoingTrips.map(toTripSnapshot).filter((t): t is CanaryLiveWindowTripSnapshot => t != null),
      completedTrips: completedTrips.map(toTripSnapshot).filter((t): t is CanaryLiveWindowTripSnapshot => t != null),
      ledgerByTripId,
      activeBlockingSessionByVehicleId,
      ports: {
        armOngoingTrip: (trip) => this.armOngoingTrip(trip, config.activationNotBeforeMs, config.cohort),
        finalizeCompletedTrip: (args) =>
          this.finalizeCompletedTrip(
            args.trip,
            args.ledger.sessionId!,
            config.activationNotBeforeMs,
            config.cohort,
          ),
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
    try {
      const row = await this.prisma.exp021CanaryLiveWindowActivationLedger.create({
        data: {
          organizationId: trip.organizationId,
          vehicleId: trip.vehicleId,
          tokenId: trip.tokenId,
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
    cohort: NonNullable<ReturnType<typeof buildCanaryLiveWindowActivationConfig>>['cohort'],
  ): Promise<{ sessionId: string; studyRunId: string }> {
    const ledger = await this.claimVehicleTripLedger(trip, activationNotBeforeMs);

    const enrollment = await this.prisma.exp021StudyEnrollment.findFirst({
      where: {
        vehicleId: trip.vehicleId,
        organizationId: trip.organizationId,
        enrolledTokenId: trip.tokenId,
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
      resolvedTokenId: trip.tokenId,
      organizationId: trip.organizationId,
      vehicleId: trip.vehicleId,
      createSessionWithId: async (sessionId) => {
        await this.sessionService.createSession({
          sessionId,
          organizationId: trip.organizationId,
          vehicleId: trip.vehicleId,
        });
      },
      getSessionStatus: async (sessionId) => {
        const row = await this.prisma.referenceCaptureSession.findFirst({
          where: { id: sessionId, organizationId: trip.organizationId },
          select: { status: true },
        });
        return row?.status ?? null;
      },
      runPreflight: async (sessionId) => {
        await this.sessionService.runPreflight(trip.organizationId, sessionId);
      },
      executeFastGo: async (sessionId) => {
        const fastGo = await this.fastGoService.executeFastGo({
          organizationId: trip.organizationId,
          vehicleId: trip.vehicleId,
          sessionId,
        });
        return { ready: fastGo.readyToDrive, blockers: fastGo.blockers };
      },
    });
  }

  async finalizeCompletedTrip(
    trip: CanaryLiveWindowTripSnapshot,
    sessionId: string,
    currentActivationNotBeforeMs: number,
    cohort: NonNullable<ReturnType<typeof buildCanaryLiveWindowActivationConfig>>['cohort'],
  ): Promise<void> {
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
      where: { id: sessionId, organizationId: trip.organizationId },
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
      organizationId: trip.organizationId,
      sessionId,
      session,
      stopRecording: (org, sid) => this.sessionService.stopRecording(org, sid),
      resumeRecordingStop: (org, sid) => this.sessionService.resumeRecordingStop(org, sid),
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

    const pdiResult = await publishCanaryLiveWindowPhysicalDriveInterval({
      prisma: this.prisma,
      settlementShadow: this.settlementShadowService,
      currentActivationNotBeforeMs,
      ctx: {
        vehicleTripId: trip.tripId,
        vehicleId: trip.vehicleId,
        tokenId: trip.tokenId,
        organizationId: trip.organizationId,
        sessionId,
        activationNotBeforeMs: ledger.activationNotBeforeAt.getTime(),
        cohort,
      },
    });
    if (pdiResult.outcome === 'conflict') {
      this.logger.error({
        msg: 'EXP021_CANARY_PDI_AUTHORITY_CONFLICT',
        vehicleTripId: trip.tripId,
        sessionId,
        reason: pdiResult.reason,
        existing: pdiResult.existing,
      });
    } else if (pdiResult.outcome === 'skipped') {
      this.logger.warn({
        msg: 'EXP021_CANARY_PDI_PUBLISH_SKIPPED',
        vehicleTripId: trip.tripId,
        sessionId,
        reason: pdiResult.reason,
      });
    } else if (pdiResult.outcome === 'published') {
      this.logger.log({
        msg: 'EXP021_CANARY_PDI_PUBLISHED',
        vehicleTripId: trip.tripId,
        sessionId,
        source: pdiResult.source,
      });
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
