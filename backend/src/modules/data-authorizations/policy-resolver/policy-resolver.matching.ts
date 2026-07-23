import { PrivacyPolicyLifecycleStatus } from '@prisma/client';
import {
  POLICY_RESOLVER_REASON,
  POLICY_RESOLVER_SCOPE_PRIORITY,
  type PolicyResolverReasonCode,
} from './policy-resolver.constants';
import type {
  PolicyResolverCandidate,
  PolicyResolverEvaluatedContext,
  PolicyResolverScopeMatch,
} from './policy-resolver.types';
import { isPolicyCurrentlyUsable } from '../privacy-domain/policy-lifecycle/policy-lifecycle.transitions';

export interface PolicyMatchResult {
  candidate: PolicyResolverCandidate;
  priorityScore: number;
  scopeMatch: PolicyResolverScopeMatch;
  blockingReasons: PolicyResolverReasonCode[];
}

export function policyMatchesContext(
  candidate: PolicyResolverCandidate,
  context: PolicyResolverEvaluatedContext,
  at: Date,
): PolicyMatchResult {
  const blockingReasons: PolicyResolverReasonCode[] = [];

  if (candidate.enforcementPolicy.organizationId !== context.organizationId) {
    blockingReasons.push(POLICY_RESOLVER_REASON.TENANT_MISMATCH);
    return {
      candidate,
      priorityScore: 0,
      scopeMatch: { matched: false, scopeType: candidate.enforcementPolicy.scopeType },
      blockingReasons,
    };
  }

  if (candidate.enforcementPolicy.dataCategory !== context.dataCategory) {
    blockingReasons.push(POLICY_RESOLVER_REASON.CATEGORY_MISMATCH);
  }
  if (candidate.enforcementPolicy.processingPurpose !== context.purpose) {
    blockingReasons.push(POLICY_RESOLVER_REASON.PURPOSE_MISMATCH);
  }

  const scopeMatch = evaluateScopeMatch(candidate, context);
  if (!scopeMatch.matched) {
    blockingReasons.push(POLICY_RESOLVER_REASON.SCOPE_MISMATCH);
  }

  const status = candidate.enforcementPolicy.status;
  if (status === PrivacyPolicyLifecycleStatus.SUSPENDED) {
    blockingReasons.push(POLICY_RESOLVER_REASON.POLICY_SUSPENDED);
  } else if (status === PrivacyPolicyLifecycleStatus.REVOKED) {
    blockingReasons.push(POLICY_RESOLVER_REASON.POLICY_REVOKED);
  } else if (status === PrivacyPolicyLifecycleStatus.EXPIRED) {
    blockingReasons.push(POLICY_RESOLVER_REASON.POLICY_EXPIRED);
  } else if (status === PrivacyPolicyLifecycleStatus.SUPERSEDED) {
    blockingReasons.push(POLICY_RESOLVER_REASON.POLICY_SUPERSEDED);
  } else if (status !== PrivacyPolicyLifecycleStatus.ACTIVE) {
    blockingReasons.push(POLICY_RESOLVER_REASON.POLICY_NOT_YET_VALID);
  }

  if (
    status === PrivacyPolicyLifecycleStatus.ACTIVE &&
    !isPolicyCurrentlyUsable({
      status,
      validFrom: candidate.enforcementPolicy.validFrom,
      validUntil: candidate.enforcementPolicy.validUntil,
      now: at,
    })
  ) {
    if (candidate.enforcementPolicy.validFrom && candidate.enforcementPolicy.validFrom > at) {
      blockingReasons.push(POLICY_RESOLVER_REASON.POLICY_NOT_YET_VALID);
    } else {
      blockingReasons.push(POLICY_RESOLVER_REASON.POLICY_EXPIRED);
    }
  }

  const priorityScore =
    (POLICY_RESOLVER_SCOPE_PRIORITY[candidate.enforcementPolicy.scopeType] ?? 0) * 1000 +
    candidate.enforcementPolicy.versionNumber;

  return { candidate, priorityScore, scopeMatch, blockingReasons };
}

export function evaluateScopeMatch(
  candidate: PolicyResolverCandidate,
  context: PolicyResolverEvaluatedContext,
): PolicyResolverScopeMatch {
  const scopeType = candidate.enforcementPolicy.scopeType;

  switch (scopeType) {
    case 'ORGANIZATION':
      return { matched: true, scopeType };
    case 'VEHICLE': {
      const vehicleId = context.vehicleId ?? context.resourceId;
      if (!vehicleId) {
        return { matched: false, scopeType, detail: 'vehicleId required' };
      }
      const matched = candidate.scopeVehicleIds.includes(vehicleId);
      return { matched, scopeType, detail: matched ? undefined : 'vehicle not in policy scope' };
    }
    case 'CONNECTED_VEHICLES': {
      const vehicleId = context.vehicleId ?? context.resourceId;
      if (!vehicleId) {
        return { matched: false, scopeType, detail: 'vehicleId required' };
      }
      if (candidate.scopeVehicleIds.length === 0) {
        return { matched: false, scopeType, detail: 'no vehicles in connected scope' };
      }
      return {
        matched: candidate.scopeVehicleIds.includes(vehicleId),
        scopeType,
      };
    }
    case 'CUSTOMER': {
      if (!context.customerId) {
        return { matched: false, scopeType, detail: 'customerId required' };
      }
      return {
        matched: candidate.scopeCustomerIds.includes(context.customerId),
        scopeType,
      };
    }
    case 'BOOKING': {
      if (!context.bookingId) {
        return { matched: false, scopeType, detail: 'bookingId required' };
      }
      return {
        matched: candidate.scopeBookingIds.includes(context.bookingId),
        scopeType,
      };
    }
    case 'STATION': {
      const stationId = context.stationId ?? context.resourceId;
      if (!stationId) {
        return { matched: false, scopeType, detail: 'stationId required' };
      }
      return {
        matched: candidate.scopeStationIds.includes(stationId),
        scopeType,
      };
    }
    default:
      return { matched: false, scopeType, detail: 'unknown scope type' };
  }
}

export function selectBestPolicyMatches(
  matches: PolicyMatchResult[],
): { winners: PolicyMatchResult[]; conflict: boolean } {
  const viable = matches.filter((m) => m.blockingReasons.length === 0);
  if (viable.length === 0) {
    return { winners: [], conflict: false };
  }

  const maxScore = Math.max(...viable.map((m) => m.priorityScore));
  const top = viable.filter((m) => m.priorityScore === maxScore);

  if (top.length > 1) {
    const ids = new Set(top.map((t) => t.candidate.enforcementPolicy.id));
    if (ids.size > 1) {
      return { winners: top, conflict: true };
    }
  }

  return { winners: [top[0]], conflict: false };
}

export function sortMatchesDeterministic(matches: PolicyMatchResult[]): PolicyMatchResult[] {
  return [...matches].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    const aPath = a.candidate.enforcementPolicy.pathId ?? '';
    const bPath = b.candidate.enforcementPolicy.pathId ?? '';
    if (aPath !== bPath) return aPath.localeCompare(bPath);
    return a.candidate.enforcementPolicy.id.localeCompare(b.candidate.enforcementPolicy.id);
  });
}
