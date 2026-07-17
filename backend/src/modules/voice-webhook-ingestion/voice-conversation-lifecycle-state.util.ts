import { VoiceConversationLifecycleState } from '@prisma/client';

const LIFECYCLE_RANK: Record<VoiceConversationLifecycleState, number> = {
  CREATED: 0,
  QUEUED: 1,
  INITIATED: 2,
  RINGING: 3,
  CONNECTED: 4,
  AI_ACTIVE: 5,
  TRANSFERRING: 6,
  COMPLETED: 7,
  PROCESSING: 8,
  FINALIZED: 9,
  FAILED: 100,
  CANCELLED: 101,
};

const TERMINAL_STATES = new Set<VoiceConversationLifecycleState>([
  VoiceConversationLifecycleState.FINALIZED,
  VoiceConversationLifecycleState.FAILED,
  VoiceConversationLifecycleState.CANCELLED,
]);

export function isTerminalLifecycleState(state: VoiceConversationLifecycleState): boolean {
  return TERMINAL_STATES.has(state);
}

export function canAdvanceLifecycleState(
  current: VoiceConversationLifecycleState,
  next: VoiceConversationLifecycleState,
): boolean {
  if (current === next) {
    return false;
  }
  if (isTerminalLifecycleState(current)) {
    return false;
  }
  if (isTerminalLifecycleState(next)) {
    return true;
  }
  return LIFECYCLE_RANK[next] > LIFECYCLE_RANK[current];
}

export function mapTwilioCallStatusToLifecycle(callStatus: string): VoiceConversationLifecycleState | null {
  const status = callStatus.toLowerCase();
  switch (status) {
    case 'queued':
      return VoiceConversationLifecycleState.QUEUED;
    case 'initiated':
    case 'initiating':
      return VoiceConversationLifecycleState.INITIATED;
    case 'ringing':
      return VoiceConversationLifecycleState.RINGING;
    case 'in-progress':
    case 'answered':
      return VoiceConversationLifecycleState.CONNECTED;
    case 'completed':
      return VoiceConversationLifecycleState.COMPLETED;
    case 'busy':
    case 'no-answer':
      return VoiceConversationLifecycleState.CANCELLED;
    case 'failed':
      return VoiceConversationLifecycleState.FAILED;
    case 'canceled':
    case 'cancelled':
      return VoiceConversationLifecycleState.CANCELLED;
    default:
      return null;
  }
}

export function mapElevenLabsConversationStatus(status: string): VoiceConversationLifecycleState | null {
  const normalized = status.toLowerCase();
  if (normalized === 'in_progress' || normalized === 'active') {
    return VoiceConversationLifecycleState.AI_ACTIVE;
  }
  if (normalized === 'done' || normalized === 'completed') {
    return VoiceConversationLifecycleState.COMPLETED;
  }
  if (normalized === 'failed') {
    return VoiceConversationLifecycleState.FAILED;
  }
  return null;
}

export function mapElevenLabsPostCallLifecycle(): VoiceConversationLifecycleState {
  return VoiceConversationLifecycleState.PROCESSING;
}

export function mapPostCallFinalizedLifecycle(): VoiceConversationLifecycleState {
  return VoiceConversationLifecycleState.FINALIZED;
}
