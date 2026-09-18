import {
  Exp021CanaryLiveWindowActivationState,
  ReferenceCaptureSessionStatus,
} from '@prisma/client';
export type CanaryFinalizeSessionSnapshot = {
  id: string;
  status: ReferenceCaptureSessionStatus;
};

export type CanaryFinalizeResult =
  | { outcome: 'already_finalized' }
  | { outcome: 'stopped' }
  | { outcome: 'adopted_completed' }
  | { outcome: 'failed'; reason: string };

/**
 * Idempotent canary finalization — safe when stop already ran but ledger lags.
 */
export async function finalizeCanaryLiveWindowRecording(args: {
  organizationId: string;
  sessionId: string;
  session: CanaryFinalizeSessionSnapshot;
  stopRecording: (organizationId: string, sessionId: string) => Promise<unknown>;
  resumeRecordingStop: (organizationId: string, sessionId: string) => Promise<unknown>;
}): Promise<CanaryFinalizeResult> {
  const { status } = args.session;

  if (status === ReferenceCaptureSessionStatus.COMPLETED) {
    return { outcome: 'adopted_completed' };
  }

  if (
    status === ReferenceCaptureSessionStatus.FAILED ||
    status === ReferenceCaptureSessionStatus.ABORTED
  ) {
    return { outcome: 'failed', reason: `terminal_session_${status}` };
  }

  if (status === ReferenceCaptureSessionStatus.STOPPING) {
    await args.resumeRecordingStop(args.organizationId, args.sessionId);
    return { outcome: 'stopped' };
  }

  if (status === ReferenceCaptureSessionStatus.RECORDING) {
    await args.stopRecording(args.organizationId, args.sessionId);
    return { outcome: 'stopped' };
  }

  return { outcome: 'failed', reason: `cannot_finalize_from_status_${status}` };
}

export function ledgerStateAfterCanaryFinalize(
  current: Exp021CanaryLiveWindowActivationState,
): Exp021CanaryLiveWindowActivationState {
  if (
    current === Exp021CanaryLiveWindowActivationState.TRIP_COMPLETED_SEEN ||
    current === Exp021CanaryLiveWindowActivationState.FINALIZED
  ) {
    return current;
  }
  return Exp021CanaryLiveWindowActivationState.TRIP_COMPLETED_SEEN;
}
