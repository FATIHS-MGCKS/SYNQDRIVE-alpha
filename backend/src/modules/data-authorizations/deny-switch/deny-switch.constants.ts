import type {
  DataAuthorizationDenySwitchScopeType,
  DataAuthorizationDenySwitchTrigger,
} from '@prisma/client';
import type { AuthorizationDecisionAction } from '../authorization-decision-engine/authorization-decision.constants';

export const DENY_SWITCH = {
  redisChannel: 'synqdrive:data-auth:deny-switch',
  /** Target max propagation latency across instances (ms) — measured via metrics. */
  targetPropagationLatencyMs: 2_000,
  reconciliationIntervalMs: 60_000,
  startupFailClosedGraceMs: 5_000,
} as const;

export const DENY_SWITCH_SCOPE = {
  ORGANIZATION: 'ORGANIZATION',
  PROCESSING_ACTIVITY: 'PROCESSING_ACTIVITY',
  ENFORCEMENT_POLICY: 'ENFORCEMENT_POLICY',
  CONSENT: 'CONSENT',
  PROVIDER_GRANT: 'PROVIDER_GRANT',
  RESOURCE: 'RESOURCE',
} as const satisfies Record<string, DataAuthorizationDenySwitchScopeType>;

export const DENY_SWITCH_TRIGGER = {
  REVOKED: 'REVOKED',
  SUSPENDED: 'SUSPENDED',
  MANUAL: 'MANUAL',
} as const satisfies Record<string, DataAuthorizationDenySwitchTrigger>;

export const DENY_SWITCH_REASON = {
  DENY_SWITCH_ACTIVE: 'DENY_SWITCH_ACTIVE',
  DENY_SWITCH_NOT_READY: 'DENY_SWITCH_NOT_READY',
  DENY_SWITCH_ORG: 'DENY_SWITCH_ORG',
  DENY_SWITCH_POLICY: 'DENY_SWITCH_POLICY',
  DENY_SWITCH_ACTIVITY: 'DENY_SWITCH_ACTIVITY',
  DENY_SWITCH_CONSENT: 'DENY_SWITCH_CONSENT',
  DENY_SWITCH_PROVIDER: 'DENY_SWITCH_PROVIDER',
  DENY_SWITCH_RESOURCE: 'DENY_SWITCH_RESOURCE',
  DENY_SWITCH_QUEUE: 'DENY_SWITCH_QUEUE',
} as const;

export type DenySwitchReasonCode =
  (typeof DENY_SWITCH_REASON)[keyof typeof DENY_SWITCH_REASON];

export function buildDenySwitchScopeKey(parts: {
  organizationId: string;
  scopeType: DataAuthorizationDenySwitchScopeType;
  scopeEntityId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
}): string {
  return [
    parts.organizationId,
    parts.scopeType,
    parts.scopeEntityId ?? '',
    parts.resourceType ?? '',
    parts.resourceId ?? '',
  ].join(':');
}

export function buildDenySwitchIdempotencyKey(parts: {
  organizationId: string;
  scopeType: DataAuthorizationDenySwitchScopeType;
  scopeEntityId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  correlationId: string;
}): string {
  const scopeKey = buildDenySwitchScopeKey(parts);
  return `data-auth-deny:${scopeKey}:${parts.correlationId}`;
}

export function actionBlockedByDeny(
  action: AuthorizationDecisionAction,
  blocks: { blocksIngest: boolean; blocksRead: boolean },
): boolean {
  if (
    action === 'INGEST' ||
    action === 'WRITE' ||
    action === 'DERIVE' ||
    action === 'PROFILE' ||
    action === 'DELETE'
  ) {
    return blocks.blocksIngest;
  }
  if (
    action === 'READ' ||
    action === 'EXPORT' ||
    action === 'SHARE' ||
    action === 'USE_FOR_AI' ||
    action === 'NOTIFY'
  ) {
    return blocks.blocksRead;
  }
  return true;
}
