import { randomUUID } from 'crypto';
import {
  Exp021CanaryLiveWindowActivationState,
  ReferenceCaptureSessionStatus,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { ReferenceCaptureExp021FleetRepository } from '../exp021-fleet/reference-capture-exp021-fleet.repository';
import type { CanaryArmLedgerRow } from './reference-capture-exp021-canary-live-window-activation.arm.lib';
import {
  lockCanaryActivationLedgerRow,
  patchCanaryActivationLedger,
} from './reference-capture-exp021-canary-live-window-activation.persistence.lib';

export type CanaryIdempotentArmTestHooks = {
  afterLedgerLockedForStudyRun?: () => Promise<void>;
  afterStudyRunReserved?: () => Promise<void>;
  afterSessionIdAllocated?: () => Promise<void>;
  afterSessionCreated?: () => Promise<void>;
  afterPreflight?: () => Promise<void>;
  afterFastGo?: () => Promise<void>;
};

export type ExecuteIdempotentCanaryArmInput = {
  prisma: PrismaService;
  fleetRepository: ReferenceCaptureExp021FleetRepository;
  ledger: CanaryArmLedgerRow;
  enrollmentId: string;
  resolvedTokenId: number;
  organizationId: string;
  vehicleId: string;
  createSessionWithId: (sessionId: string) => Promise<void>;
  getSessionStatus: (sessionId: string) => Promise<ReferenceCaptureSessionStatus | null>;
  runPreflight: (sessionId: string) => Promise<void>;
  executeFastGo: (sessionId: string) => Promise<{ ready: boolean; blockers: string[] }>;
  testHooks?: CanaryIdempotentArmTestHooks;
};

export async function executeIdempotentCanaryArm(
  input: ExecuteIdempotentCanaryArmInput,
): Promise<{ sessionId: string; studyRunId: string }> {
  const { prisma, ledger: initialLedger, testHooks } = input;
  let ledger = initialLedger;

  if (ledger.state === Exp021CanaryLiveWindowActivationState.FAILED) {
    throw new Error(`Ledger ${ledger.vehicleTripId} is FAILED`);
  }

  if (
    ledger.state === Exp021CanaryLiveWindowActivationState.RECORDING_STARTED &&
    ledger.sessionId &&
    ledger.studyRunId
  ) {
    return { sessionId: ledger.sessionId, studyRunId: ledger.studyRunId };
  }

  // --- Study run (durable per vehicleTripId) ---
  if (!ledger.studyRunId) {
    await prisma.$transaction(async (tx) => {
      ledger = await lockCanaryActivationLedgerRow(tx, ledger.id);
      await testHooks?.afterLedgerLockedForStudyRun?.();
    });

    if (!ledger.studyRunId) {
      const reserved = await input.fleetRepository.reserveStudyRunForCanaryActivation({
        enrollmentId: input.enrollmentId,
        resolvedTokenId: input.resolvedTokenId,
        canaryActivationVehicleTripId: ledger.vehicleTripId,
      });
      await testHooks?.afterStudyRunReserved?.();

      await prisma.$transaction(async (tx) => {
        ledger = await lockCanaryActivationLedgerRow(tx, ledger.id);
        if (!ledger.studyRunId) {
          ledger = await patchCanaryActivationLedger(tx, ledger.id, {
            studyRunId: reserved.run.id,
            state: Exp021CanaryLiveWindowActivationState.STUDY_RUN_RESERVED,
          });
        }
      });
    }
  }

  if (!ledger.studyRunId) {
    throw new Error(`Study run missing for trip ${ledger.vehicleTripId}`);
  }

  // --- Session (preallocate id on ledger before create) ---
  let sessionId = ledger.sessionId;
  if (!sessionId) {
    const plannedId = randomUUID();
    await prisma.$transaction(async (tx) => {
      ledger = await lockCanaryActivationLedgerRow(tx, ledger.id);
      if (ledger.sessionId) {
        sessionId = ledger.sessionId;
        return;
      }
      ledger = await patchCanaryActivationLedger(tx, ledger.id, {
        sessionId: plannedId,
        studyRunId: ledger.studyRunId,
        state: Exp021CanaryLiveWindowActivationState.SESSION_CREATED,
      });
      sessionId = plannedId;
      await testHooks?.afterSessionIdAllocated?.();
    });
  }

  if (!sessionId) {
    throw new Error(`Session id missing for trip ${ledger.vehicleTripId}`);
  }

  const existingSession = await prisma.referenceCaptureSession.findFirst({
    where: { id: sessionId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!existingSession) {
    await input.createSessionWithId(sessionId);
    await testHooks?.afterSessionCreated?.();
  }

  // --- Preflight (state-aware) ---
  const statusBeforePreflight = await input.getSessionStatus(sessionId);
  if (
    statusBeforePreflight === ReferenceCaptureSessionStatus.CREATED ||
    statusBeforePreflight === ReferenceCaptureSessionStatus.PREFLIGHT
  ) {
    await input.runPreflight(sessionId);
    await testHooks?.afterPreflight?.();
  } else if (
    statusBeforePreflight !== ReferenceCaptureSessionStatus.READY &&
    statusBeforePreflight !== ReferenceCaptureSessionStatus.RECORDING &&
    statusBeforePreflight !== ReferenceCaptureSessionStatus.STARTING
  ) {
    throw new Error(`Cannot preflight from status ${statusBeforePreflight}`);
  }

  // --- FAST GO / adopt RECORDING ---
  const statusBeforeFastGo = await input.getSessionStatus(sessionId);
  if (statusBeforeFastGo === ReferenceCaptureSessionStatus.RECORDING) {
    await prisma.$transaction(async (tx) => {
      ledger = await lockCanaryActivationLedgerRow(tx, ledger.id);
      if (ledger.state !== Exp021CanaryLiveWindowActivationState.RECORDING_STARTED) {
        ledger = await patchCanaryActivationLedger(tx, ledger.id, {
          state: Exp021CanaryLiveWindowActivationState.RECORDING_STARTED,
          studyRunId: ledger.studyRunId,
          sessionId,
        });
      }
    });
    return { sessionId, studyRunId: ledger.studyRunId! };
  }

  const fastGo = await input.executeFastGo(sessionId);
  await testHooks?.afterFastGo?.();
  if (!fastGo.ready) {
    await prisma.$transaction(async (tx) => {
      await patchCanaryActivationLedger(tx, ledger.id, {
        state: Exp021CanaryLiveWindowActivationState.FAILED,
        studyRunId: ledger.studyRunId,
        sessionId,
        failureReason: `fast_go_blocked:${fastGo.blockers.join(',')}`,
      });
    });
    throw new Error(`FAST_GO blocked: ${fastGo.blockers.join(',')}`);
  }

  await prisma.$transaction(async (tx) => {
    ledger = await lockCanaryActivationLedgerRow(tx, ledger.id);
    if (ledger.state !== Exp021CanaryLiveWindowActivationState.RECORDING_STARTED) {
      await patchCanaryActivationLedger(tx, ledger.id, {
        state: Exp021CanaryLiveWindowActivationState.RECORDING_STARTED,
        studyRunId: ledger.studyRunId,
        sessionId,
      });
    }
  });

  return { sessionId, studyRunId: ledger.studyRunId! };
}
