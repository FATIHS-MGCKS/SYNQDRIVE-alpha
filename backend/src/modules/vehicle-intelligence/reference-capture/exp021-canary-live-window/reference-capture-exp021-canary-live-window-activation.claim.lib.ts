import { Exp021CanaryLiveWindowActivationState } from '@prisma/client';

export type CanaryLiveWindowLedgerState =
  | 'CLAIMED'
  | 'STUDY_RUN_RESERVED'
  | 'SESSION_CREATED'
  | 'RECORDING_STARTED'
  | 'TRIP_COMPLETED_SEEN'
  | 'FINALIZED'
  | 'FAILED';

export function isCanaryLedgerArmComplete(state: CanaryLiveWindowLedgerState): boolean {
  return (
    state === 'RECORDING_STARTED' ||
    state === 'TRIP_COMPLETED_SEEN' ||
    state === 'FINALIZED'
  );
}

export function isCanaryLedgerArmInProgress(state: CanaryLiveWindowLedgerState): boolean {
  return state === 'CLAIMED' || state === 'STUDY_RUN_RESERVED' || state === 'SESSION_CREATED';
}

export function isCanaryLedgerFinalizeEligible(state: CanaryLiveWindowLedgerState): boolean {
  return state === 'RECORDING_STARTED';
}

export function isForeignBlockingReferenceCaptureSession(args: {
  activeBlockingSessionId: string | null;
  ledgerForTrip: { sessionId: string | null } | undefined;
}): boolean {
  if (!args.activeBlockingSessionId) return false;
  if (args.ledgerForTrip?.sessionId === args.activeBlockingSessionId) return false;
  return true;
}

export function mapPrismaLedgerState(
  state: Exp021CanaryLiveWindowActivationState,
): CanaryLiveWindowLedgerState {
  return state as CanaryLiveWindowLedgerState;
}
