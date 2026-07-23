import type { AuthorizationActorType } from '@prisma/client';
import type {
  AuthorizationDecisionAction,
  AuthorizationDecisionOutcome,
  AuthorizationDecisionReasonCode,
} from './authorization-decision.constants';
import type {
  PolicyResolverProcessorType,
  PolicyResolverResourceType,
  PolicyResolverSourceSystem,
} from '../policy-resolver/policy-resolver.constants';
import type { PolicyResolverResult } from '../policy-resolver/policy-resolver.types';

/** Mandatory decision request — all protected access must supply these fields. */
export interface AuthorizationDecisionRequest {
  organizationId: string;
  sourceSystem: PolicyResolverSourceSystem;
  dataCategory: string;
  purpose: string;
  action: AuthorizationDecisionAction;
  processorType: PolicyResolverProcessorType;
  /** Processor identity — required unless serviceIdentity is set. */
  processorId?: string | null;
  /** Service identity — alternative to processorId for workers/system actors. */
  serviceIdentity?: string | null;
  resourceType: PolicyResolverResourceType;
  resourceId?: string | null;
  /** Explicit org-wide scope when resourceType is ORGANIZATION. */
  organizationWideScope?: boolean;
  stationId?: string | null;
  customerId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
  dataSubjectReference?: string | null;
  correlationId: string;
  effectiveTimestamp?: Date | string | null;
  actorType?: AuthorizationActorType;
  actorId?: string | null;
  /** Skip append-only audit write (e.g. shadow sampling). */
  skipAudit?: boolean;
  /** Skip version-safe cache lookup/write. */
  skipCache?: boolean;
}

export interface AuthorizationDecisionEvaluatedRequest {
  organizationId: string;
  sourceSystem: PolicyResolverSourceSystem;
  dataCategory: string;
  purpose: string;
  action: AuthorizationDecisionAction;
  processorType: PolicyResolverProcessorType;
  processorIdentity: string;
  resourceType: PolicyResolverResourceType;
  resourceId: string | null;
  organizationWideScope: boolean;
  stationId: string | null;
  customerId: string | null;
  bookingId: string | null;
  vehicleId: string | null;
  dataSubjectReference: string | null;
  correlationId: string;
  effectiveTimestamp: string;
  actorType: AuthorizationActorType;
  actorId: string | null;
}

/** Structured operational decision result. */
export interface AuthorizationDecisionResult {
  decision: AuthorizationDecisionOutcome;
  /** True when access is actually blocked (false for SHADOW_WOULD_DENY). */
  enforced: boolean;
  /** Explicit shadow marker — never conflated with ALLOW. */
  isShadowMode: boolean;
  reasonCode: AuthorizationDecisionReasonCode;
  reasonCodes: AuthorizationDecisionReasonCode[];
  resolverResult: PolicyResolverResult | null;
  matchedPolicyId: string | null;
  policyVersion: number | null;
  correlationId: string;
  evaluatedAt: string;
  engineVersion: string;
  cacheHit: boolean;
  auditEventId: string | null;
  warnings: string[];
}

export interface AuthorizationDecisionEngineInput {
  request: AuthorizationDecisionEvaluatedRequest;
  resolverResult: PolicyResolverResult | null;
  resolverError: boolean;
  globalDenySwitch: boolean;
  devBypassEnabled: boolean;
  isProduction: boolean;
}

export interface AuthorizationDecisionCacheEntry {
  result: AuthorizationDecisionResult;
  policyVersionKey: string;
  expiresAt: number;
}
