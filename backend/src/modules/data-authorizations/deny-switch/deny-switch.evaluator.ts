import type { AuthorizationDecisionAction } from '../authorization-decision-engine/authorization-decision.constants';
import {
  DENY_SWITCH_REASON,
  DENY_SWITCH_SCOPE,
  actionBlockedByDeny,
  buildDenySwitchScopeKey,
} from './deny-switch.constants';
import type {
  DenySwitchEvaluationContext,
  DenySwitchEvaluationResult,
  DenySwitchLocalEntry,
} from './deny-switch.types';

function reasonForScope(scopeType: string): string {
  switch (scopeType) {
    case DENY_SWITCH_SCOPE.ORGANIZATION:
      return DENY_SWITCH_REASON.DENY_SWITCH_ORG;
    case DENY_SWITCH_SCOPE.PROCESSING_ACTIVITY:
      return DENY_SWITCH_REASON.DENY_SWITCH_ACTIVITY;
    case DENY_SWITCH_SCOPE.ENFORCEMENT_POLICY:
      return DENY_SWITCH_REASON.DENY_SWITCH_POLICY;
    case DENY_SWITCH_SCOPE.CONSENT:
      return DENY_SWITCH_REASON.DENY_SWITCH_CONSENT;
    case DENY_SWITCH_SCOPE.PROVIDER_GRANT:
      return DENY_SWITCH_REASON.DENY_SWITCH_PROVIDER;
    case DENY_SWITCH_SCOPE.RESOURCE:
      return DENY_SWITCH_REASON.DENY_SWITCH_RESOURCE;
    default:
      return DENY_SWITCH_REASON.DENY_SWITCH_ACTIVE;
  }
}

function resourceCandidates(ctx: DenySwitchEvaluationContext): Array<{
  resourceType: string;
  resourceId: string;
}> {
  const out: Array<{ resourceType: string; resourceId: string }> = [];
  if (ctx.resourceType && ctx.resourceId) {
    out.push({ resourceType: ctx.resourceType, resourceId: ctx.resourceId });
  }
  if (ctx.vehicleId) out.push({ resourceType: 'VEHICLE', resourceId: ctx.vehicleId });
  if (ctx.customerId) out.push({ resourceType: 'CUSTOMER', resourceId: ctx.customerId });
  if (ctx.bookingId) out.push({ resourceType: 'BOOKING', resourceId: ctx.bookingId });
  if (ctx.stationId) out.push({ resourceType: 'STATION', resourceId: ctx.stationId });
  return out;
}

export function evaluateDenySwitchLocal(
  ctx: DenySwitchEvaluationContext,
  entries: Iterable<DenySwitchLocalEntry>,
  ready: boolean,
  startupGraceExpired: boolean,
): DenySwitchEvaluationResult | null {
  if (!ready && startupGraceExpired) {
    return {
      denied: true,
      reasonCode: DENY_SWITCH_REASON.DENY_SWITCH_NOT_READY,
      reasonCodes: [DENY_SWITCH_REASON.DENY_SWITCH_NOT_READY, DENY_SWITCH_REASON.DENY_SWITCH_ACTIVE],
    };
  }
  if (!ready) {
    return null;
  }

  const candidates: Array<{ entry: DenySwitchLocalEntry; priority: number }> = [];

  for (const entry of entries) {
    if (!entry.active || entry.organizationId !== ctx.organizationId) continue;
    if (!matchesContext(ctx, entry)) continue;
    if (!actionBlockedByDeny(ctx.action, entry)) continue;
    candidates.push({ entry, priority: scopePriority(entry.scopeType) });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.priority - b.priority);
  const match = candidates[0]!.entry;
  const reasonCode = reasonForScope(match.scopeType);
  return {
    denied: true,
    reasonCode,
    reasonCodes: [DENY_SWITCH_REASON.DENY_SWITCH_ACTIVE, reasonCode],
    matchedScopeType: match.scopeType,
    sequence: match.sequence,
  };
}

export function isQueueEnqueueDeniedLocal(
  organizationId: string,
  entries: Iterable<DenySwitchLocalEntry>,
  ready: boolean,
  startupGraceExpired: boolean,
  scope?: {
    processingActivityId?: string | null;
    vehicleId?: string | null;
  },
): boolean {
  if (!ready && startupGraceExpired) return true;
  if (!ready) return false;

  for (const entry of entries) {
    if (!entry.active || entry.organizationId !== organizationId) continue;
    if (!entry.blocksQueueEnqueue) continue;
    if (entry.scopeType === DENY_SWITCH_SCOPE.ORGANIZATION) return true;
    if (
      scope?.processingActivityId &&
      entry.scopeType === DENY_SWITCH_SCOPE.PROCESSING_ACTIVITY &&
      entry.scopeEntityId === scope.processingActivityId
    ) {
      return true;
    }
    if (
      scope?.vehicleId &&
      entry.scopeType === DENY_SWITCH_SCOPE.RESOURCE &&
      entry.resourceType === 'VEHICLE' &&
      entry.resourceId === scope.vehicleId
    ) {
      return true;
    }
  }
  return false;
}

function matchesContext(ctx: DenySwitchEvaluationContext, entry: DenySwitchLocalEntry): boolean {
  switch (entry.scopeType) {
    case DENY_SWITCH_SCOPE.ORGANIZATION:
      return true;
    case DENY_SWITCH_SCOPE.PROCESSING_ACTIVITY:
      return !!ctx.processingActivityId && entry.scopeEntityId === ctx.processingActivityId;
    case DENY_SWITCH_SCOPE.ENFORCEMENT_POLICY:
      return !!ctx.enforcementPolicyId && entry.scopeEntityId === ctx.enforcementPolicyId;
    case DENY_SWITCH_SCOPE.CONSENT:
      return !!ctx.consentId && entry.scopeEntityId === ctx.consentId;
    case DENY_SWITCH_SCOPE.PROVIDER_GRANT:
      return !!ctx.providerGrantId && entry.scopeEntityId === ctx.providerGrantId;
    case DENY_SWITCH_SCOPE.RESOURCE: {
      const resources = resourceCandidates(ctx);
      return resources.some(
        (r) => entry.resourceType === r.resourceType && entry.resourceId === r.resourceId,
      );
    }
    default:
      return false;
  }
}

function scopePriority(scopeType: string): number {
  switch (scopeType) {
    case DENY_SWITCH_SCOPE.RESOURCE:
      return 1;
    case DENY_SWITCH_SCOPE.CONSENT:
    case DENY_SWITCH_SCOPE.PROVIDER_GRANT:
      return 2;
    case DENY_SWITCH_SCOPE.ENFORCEMENT_POLICY:
      return 3;
    case DENY_SWITCH_SCOPE.PROCESSING_ACTIVITY:
      return 4;
    case DENY_SWITCH_SCOPE.ORGANIZATION:
      return 5;
    default:
      return 10;
  }
}

export function rowToLocalEntry(row: {
  organizationId: string;
  scopeType: DenySwitchLocalEntry['scopeType'];
  scopeEntityId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  sequence: bigint;
  active: boolean;
  blocksIngest: boolean;
  blocksRead: boolean;
  blocksQueueEnqueue: boolean;
  trigger: DenySwitchLocalEntry['trigger'];
  activatedAt: Date;
}): DenySwitchLocalEntry {
  return {
    organizationId: row.organizationId,
    scopeType: row.scopeType,
    scopeEntityId: row.scopeEntityId,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    sequence: row.sequence,
    active: row.active,
    blocksIngest: row.blocksIngest,
    blocksRead: row.blocksRead,
    blocksQueueEnqueue: row.blocksQueueEnqueue,
    trigger: row.trigger,
    activatedAt: row.activatedAt.toISOString(),
  };
}

export function buildScopeKeyFromEntry(entry: DenySwitchLocalEntry): string {
  return buildDenySwitchScopeKey(entry);
}
