import type { DiV0ShadowRunStatus } from './di-v0-shadow-types';

const LEGAL_TRANSITIONS: Record<DiV0ShadowRunStatus, readonly DiV0ShadowRunStatus[]> = {
  PENDING: ['RUNNING'],
  RUNNING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

export function assertLegalRunStatusTransition(
  from: DiV0ShadowRunStatus,
  to: DiV0ShadowRunStatus,
): void {
  if (from === to) {
    return;
  }
  const allowed = LEGAL_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(`DI_V0_SHADOW_ILLEGAL_RUN_STATUS_TRANSITION:${from}->${to}`);
  }
}

export function canTransitionRunStatus(from: string, to: DiV0ShadowRunStatus): boolean {
  if (!isDiV0ShadowRunStatus(from)) {
    return false;
  }
  if (from === to) {
    return true;
  }
  return LEGAL_TRANSITIONS[from].includes(to);
}

export function isDiV0ShadowRunStatus(value: string): value is DiV0ShadowRunStatus {
  return value === 'PENDING' || value === 'RUNNING' || value === 'COMPLETED' || value === 'FAILED';
}
