import { Exp021CanaryLiveWindowActivationState } from '@prisma/client';

export type CanaryArmLedgerRow = {
  id: string;
  vehicleTripId: string;
  state: Exp021CanaryLiveWindowActivationState;
  studyRunId: string | null;
  sessionId: string | null;
};

export const CANARY_ARM_TERMINAL_STATES: ReadonlySet<Exp021CanaryLiveWindowActivationState> = new Set([
  Exp021CanaryLiveWindowActivationState.FINALIZED,
  Exp021CanaryLiveWindowActivationState.FAILED,
  Exp021CanaryLiveWindowActivationState.TRIP_COMPLETED_SEEN,
]);

export function isCanaryArmTerminal(state: Exp021CanaryLiveWindowActivationState): boolean {
  return CANARY_ARM_TERMINAL_STATES.has(state);
}

export function canResumeCanaryArm(state: Exp021CanaryLiveWindowActivationState): boolean {
  return !isCanaryArmTerminal(state);
}

export type CanaryArmSideEffectPorts = {
  reserveStudyRun: (enrollmentId: string) => Promise<{ studyRunId: string }>;
  createSession: () => Promise<{ sessionId: string }>;
  runPreflight: (sessionId: string) => Promise<void>;
  executeFastGo: (sessionId: string) => Promise<{ ready: boolean; blockers: string[] }>;
};

export type CanaryArmPersistencePorts = {
  updateLedger: (
    ledgerId: string,
    patch: {
      state: Exp021CanaryLiveWindowActivationState;
      studyRunId?: string | null;
      sessionId?: string | null;
      failureReason?: string | null;
    },
  ) => Promise<void>;
};

/**
 * Advance a claimed ledger without duplicating side effects when state already records progress.
 */
export async function resumeCanaryArmFromLedger(
  ledger: CanaryArmLedgerRow,
  enrollmentId: string,
  sideEffects: CanaryArmSideEffectPorts,
  persistence: CanaryArmPersistencePorts,
): Promise<{ sessionId: string; studyRunId: string }> {
  if (ledger.state === Exp021CanaryLiveWindowActivationState.FAILED) {
    throw new Error(`Ledger ${ledger.vehicleTripId} is FAILED`);
  }
  if (
    ledger.state === Exp021CanaryLiveWindowActivationState.FINALIZED ||
    ledger.state === Exp021CanaryLiveWindowActivationState.TRIP_COMPLETED_SEEN
  ) {
    if (!ledger.sessionId || !ledger.studyRunId) {
      throw new Error(`Terminal ledger ${ledger.vehicleTripId} missing session/run linkage`);
    }
    return { sessionId: ledger.sessionId, studyRunId: ledger.studyRunId };
  }

  if (ledger.state === Exp021CanaryLiveWindowActivationState.RECORDING_STARTED) {
    if (!ledger.sessionId || !ledger.studyRunId) {
      throw new Error(`RECORDING_STARTED ledger ${ledger.vehicleTripId} missing session/run linkage`);
    }
    return { sessionId: ledger.sessionId, studyRunId: ledger.studyRunId };
  }

  let studyRunId = ledger.studyRunId;
  let sessionId = ledger.sessionId;
  let state: Exp021CanaryLiveWindowActivationState = ledger.state;

  if (
    state === Exp021CanaryLiveWindowActivationState.CLAIMED ||
    (state === Exp021CanaryLiveWindowActivationState.STUDY_RUN_RESERVED && !studyRunId)
  ) {
    if (!studyRunId) {
      const reserved = await sideEffects.reserveStudyRun(enrollmentId);
      studyRunId = reserved.studyRunId;
      await persistence.updateLedger(ledger.id, {
        state: Exp021CanaryLiveWindowActivationState.STUDY_RUN_RESERVED,
        studyRunId,
      });
      state = Exp021CanaryLiveWindowActivationState.STUDY_RUN_RESERVED;
    }
  }

  if (
    state === Exp021CanaryLiveWindowActivationState.CLAIMED ||
    state === Exp021CanaryLiveWindowActivationState.STUDY_RUN_RESERVED ||
    state === Exp021CanaryLiveWindowActivationState.SESSION_CREATED
  ) {
    if (!sessionId) {
      const session = await sideEffects.createSession();
      sessionId = session.sessionId;
      await persistence.updateLedger(ledger.id, {
        state: Exp021CanaryLiveWindowActivationState.SESSION_CREATED,
        studyRunId,
        sessionId,
      });
      state = Exp021CanaryLiveWindowActivationState.SESSION_CREATED;
    }
  }

  const needsPreflight =
    state === Exp021CanaryLiveWindowActivationState.CLAIMED ||
    state === Exp021CanaryLiveWindowActivationState.STUDY_RUN_RESERVED ||
    state === Exp021CanaryLiveWindowActivationState.SESSION_CREATED;
  if (needsPreflight) {
    await sideEffects.runPreflight(sessionId!);
  }

  {
    const fastGo = await sideEffects.executeFastGo(sessionId!);
    if (!fastGo.ready) {
      await persistence.updateLedger(ledger.id, {
        state: Exp021CanaryLiveWindowActivationState.FAILED,
        studyRunId,
        sessionId,
        failureReason: `fast_go_blocked:${fastGo.blockers.join(',')}`,
      });
      throw new Error(`FAST_GO blocked: ${fastGo.blockers.join(',')}`);
    }
    await persistence.updateLedger(ledger.id, {
      state: Exp021CanaryLiveWindowActivationState.RECORDING_STARTED,
      studyRunId,
      sessionId,
    });
  }

  if (!sessionId || !studyRunId) {
    throw new Error(`Arm resume incomplete for trip ${ledger.vehicleTripId}`);
  }
  return { sessionId, studyRunId };
}
