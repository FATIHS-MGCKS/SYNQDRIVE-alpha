import type {
  DataAuthorizationDenySwitchScopeType,
  DataAuthorizationDenySwitchTrigger,
} from '@prisma/client';
import type { AuthorizationDecisionAction } from '../authorization-decision-engine/authorization-decision.constants';

export interface DenySwitchActivateInput {
  organizationId: string;
  scopeType: DataAuthorizationDenySwitchScopeType;
  scopeEntityId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  trigger: DataAuthorizationDenySwitchTrigger;
  reason?: string | null;
  correlationId: string;
  actorUserId?: string | null;
  idempotencyKey?: string;
  blocksIngest?: boolean;
  blocksRead?: boolean;
  blocksQueueEnqueue?: boolean;
}

export interface DenySwitchActivateResult {
  id: string;
  sequence: bigint;
  scopeKey: string;
  idempotentReplay: boolean;
  localAppliedAt: string;
}

export interface DenySwitchEvaluationContext {
  organizationId: string;
  action: AuthorizationDecisionAction;
  processingActivityId?: string | null;
  enforcementPolicyId?: string | null;
  consentId?: string | null;
  providerGrantId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  vehicleId?: string | null;
  customerId?: string | null;
  bookingId?: string | null;
  stationId?: string | null;
}

export interface DenySwitchEvaluationResult {
  denied: boolean;
  reasonCode: string;
  reasonCodes: string[];
  matchedScopeType?: DataAuthorizationDenySwitchScopeType;
  sequence?: bigint;
}

export interface DenySwitchPropagationMessage {
  organizationId: string;
  scopeType: DataAuthorizationDenySwitchScopeType;
  scopeEntityId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  sequence: string;
  active: boolean;
  blocksIngest: boolean;
  blocksRead: boolean;
  blocksQueueEnqueue: boolean;
  trigger: DataAuthorizationDenySwitchTrigger;
  activatedAt: string;
  publishedAt: string;
  instanceId: string;
}

export interface DenySwitchLocalEntry {
  organizationId: string;
  scopeType: DataAuthorizationDenySwitchScopeType;
  scopeEntityId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  sequence: bigint;
  active: boolean;
  blocksIngest: boolean;
  blocksRead: boolean;
  blocksQueueEnqueue: boolean;
  trigger: DataAuthorizationDenySwitchTrigger;
  activatedAt: string;
}
