import type { HandoverKind, HandoverSessionStatus } from '@prisma/client';
import type { HandoverSessionTransitionAction } from '../handover-session.types';

export interface HandoverSessionTransitionBodyDto {
  action: HandoverSessionTransitionAction;
  toStatus?: HandoverSessionStatus;
  expectedVersion?: number;
  payload?: Record<string, unknown>;
  scopeOverrideReason?: string | null;
  pickupGateOverrideReason?: string | null;
  eligibilityApprovalId?: string | null;
  cancelReason?: string | null;
  supersedeReason?: string | null;
  actualStationId?: string | null;
}

export interface HandoverSessionViewDto {
  lifecycleStatus: HandoverSessionStatus | 'NOT_STARTED';
  session: import('../handover-session.types').HandoverSessionDto | null;
}

export type HandoverSessionKindParam = HandoverKind;
