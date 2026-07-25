import type { HandoverSessionStatus } from '@prisma/client';
import {
  HANDOVER_SESSION_NOT_STARTED,
  type HandoverSessionLifecycleStatus,
  type HandoverSessionTransitionAction,
} from './handover-session.types';

const TERMINAL: ReadonlySet<HandoverSessionStatus> = new Set([
  'COMPLETED',
  'CANCELLED',
  'SUPERSEDED',
]);

/** Allowed status edges independent of booking/gate context. */
const ALLOWED_EDGES: ReadonlyMap<
  HandoverSessionLifecycleStatus,
  ReadonlySet<HandoverSessionStatus>
> = new Map([
  [
    HANDOVER_SESSION_NOT_STARTED,
    new Set(['DRAFT', 'AWAITING_REQUIREMENTS']),
  ],
  [
    'DRAFT',
    new Set(['IN_PROGRESS', 'AWAITING_REQUIREMENTS', 'AWAITING_SIGNATURE', 'CANCELLED']),
  ],
  [
    'IN_PROGRESS',
    new Set([
      'AWAITING_REQUIREMENTS',
      'AWAITING_SIGNATURE',
      'SUBMITTED',
      'CANCELLED',
      'DRAFT',
    ]),
  ],
  [
    'AWAITING_REQUIREMENTS',
    new Set(['IN_PROGRESS', 'DRAFT', 'AWAITING_SIGNATURE', 'CANCELLED']),
  ],
  [
    'AWAITING_SIGNATURE',
    new Set(['IN_PROGRESS', 'SUBMITTED', 'CANCELLED']),
  ],
  [
    'SUBMITTED',
    new Set(['IN_PROGRESS', 'COMPLETED']),
  ],
  [
    'COMPLETED',
    new Set(['SUPERSEDED']),
  ],
  ['CANCELLED', new Set()],
  ['SUPERSEDED', new Set()],
]);

/** Maps transition actions to target statuses when explicit `toStatus` omitted. */
export const ACTION_TARGET_STATUS: Readonly<
  Partial<Record<HandoverSessionTransitionAction, HandoverSessionStatus>>
> = {
  START: 'DRAFT',
  ACQUIRE: 'IN_PROGRESS',
  RELEASE: 'DRAFT',
  SYNC_REQUIREMENTS: 'AWAITING_REQUIREMENTS',
  SYNC_SIGNATURES: 'AWAITING_SIGNATURE',
  SUBMIT: 'SUBMITTED',
  CANCEL: 'CANCELLED',
  COMPLETE: 'COMPLETED',
  SUPERSEDE: 'SUPERSEDED',
};

export function isHandoverSessionTerminalStatus(status: HandoverSessionStatus): boolean {
  return TERMINAL.has(status);
}

export function isTransitionAllowedInMatrix(
  from: HandoverSessionLifecycleStatus,
  to: HandoverSessionStatus,
): boolean {
  if (from === to) return true;
  const targets = ALLOWED_EDGES.get(from);
  return targets?.has(to) ?? false;
}

export function resolveTargetStatusForAction(
  action: HandoverSessionTransitionAction,
  explicitTo: HandoverSessionStatus | undefined,
): HandoverSessionStatus | null {
  if (explicitTo) return explicitTo;
  return ACTION_TARGET_STATUS[action] ?? null;
}
