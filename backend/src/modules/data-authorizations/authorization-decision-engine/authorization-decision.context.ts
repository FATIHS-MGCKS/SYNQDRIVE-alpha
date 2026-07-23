import { AuthorizationActorType } from '@prisma/client';
import {
  DATA_AUTHORIZATION_DATA_CATEGORIES,
  DATA_AUTHORIZATION_PURPOSES,
} from '../data-authorization.constants';
import {
  POLICY_RESOLVER_PROCESSOR_TYPE,
  POLICY_RESOLVER_PROCESSOR_TYPE_VALUES,
  POLICY_RESOLVER_RESOURCE_TYPE,
  POLICY_RESOLVER_RESOURCE_TYPE_VALUES,
  POLICY_RESOLVER_SOURCE_VALUES,
} from '../policy-resolver/policy-resolver.constants';
import {
  AUTHORIZATION_DECISION_ACTION_VALUES,
  AUTHORIZATION_DECISION_REASON,
  AUTHORIZATION_KNOWN_PROVIDER_IDENTITIES,
  AUTHORIZATION_KNOWN_SERVICE_IDENTITIES,
  type AuthorizationDecisionReasonCode,
} from './authorization-decision.constants';
import type {
  AuthorizationDecisionEvaluatedRequest,
  AuthorizationDecisionRequest,
} from './authorization-decision.types';

export interface AuthorizationDecisionContextValidation {
  request: AuthorizationDecisionEvaluatedRequest | null;
  reasonCodes: AuthorizationDecisionReasonCode[];
}

const CATEGORY_SET = new Set<string>(DATA_AUTHORIZATION_DATA_CATEGORIES);
const PURPOSE_SET = new Set<string>(DATA_AUTHORIZATION_PURPOSES);

export function buildAuthorizationDecisionContext(
  input: AuthorizationDecisionRequest,
): AuthorizationDecisionContextValidation {
  const reasonCodes: AuthorizationDecisionReasonCode[] = [];

  if (!(input.organizationId ?? '').trim()) {
    reasonCodes.push(AUTHORIZATION_DECISION_REASON.REQUEST_INVALID);
  }
  if (!(input.correlationId ?? '').trim()) {
    reasonCodes.push(AUTHORIZATION_DECISION_REASON.MISSING_CORRELATION_ID);
  }
  if (!POLICY_RESOLVER_SOURCE_VALUES.includes(input.sourceSystem)) {
    reasonCodes.push(AUTHORIZATION_DECISION_REASON.REQUEST_INVALID);
  }
  if (!input.dataCategory) {
    reasonCodes.push(AUTHORIZATION_DECISION_REASON.REQUEST_INVALID);
  } else if (!CATEGORY_SET.has(input.dataCategory)) {
    reasonCodes.push(AUTHORIZATION_DECISION_REASON.UNKNOWN_DATA_CATEGORY);
  }
  if (!input.purpose) {
    reasonCodes.push(AUTHORIZATION_DECISION_REASON.REQUEST_INVALID);
  } else if (!PURPOSE_SET.has(input.purpose)) {
    reasonCodes.push(AUTHORIZATION_DECISION_REASON.REQUEST_INVALID);
  }
  if (!AUTHORIZATION_DECISION_ACTION_VALUES.includes(input.action)) {
    reasonCodes.push(AUTHORIZATION_DECISION_REASON.UNKNOWN_ACTION);
  }
  if (!POLICY_RESOLVER_PROCESSOR_TYPE_VALUES.includes(input.processorType)) {
    reasonCodes.push(AUTHORIZATION_DECISION_REASON.UNKNOWN_PROCESSOR);
  }
  if (!POLICY_RESOLVER_RESOURCE_TYPE_VALUES.includes(input.resourceType)) {
    reasonCodes.push(AUTHORIZATION_DECISION_REASON.REQUEST_INVALID);
  }

  const processorIdentity = resolveProcessorIdentity(input);
  if (!processorIdentity) {
    reasonCodes.push(AUTHORIZATION_DECISION_REASON.MISSING_PROCESSOR_IDENTITY);
  } else if (!isKnownProcessor(input.processorType, processorIdentity)) {
    reasonCodes.push(AUTHORIZATION_DECISION_REASON.UNKNOWN_PROCESSOR);
  }

  const scopeError = validateResourceScope(input);
  if (scopeError) {
    reasonCodes.push(scopeError);
  }

  if (reasonCodes.length > 0) {
    return { request: null, reasonCodes };
  }

  const effective =
    input.effectiveTimestamp != null ? new Date(input.effectiveTimestamp) : new Date();
  if (Number.isNaN(effective.getTime())) {
    return {
      request: null,
      reasonCodes: [AUTHORIZATION_DECISION_REASON.REQUEST_INVALID],
    };
  }

  return {
    request: {
      organizationId: input.organizationId.trim(),
      sourceSystem: input.sourceSystem,
      dataCategory: input.dataCategory,
      purpose: input.purpose,
      action: input.action,
      processorType: input.processorType,
      processorIdentity: processorIdentity!,
      resourceType: input.resourceType,
      resourceId: input.resourceId?.trim() || null,
      organizationWideScope: Boolean(input.organizationWideScope),
      stationId: input.stationId?.trim() || null,
      customerId: input.customerId?.trim() || null,
      bookingId: input.bookingId?.trim() || null,
      vehicleId: input.vehicleId?.trim() || null,
      dataSubjectReference: input.dataSubjectReference?.trim() || null,
      correlationId: input.correlationId.trim(),
      effectiveTimestamp: effective.toISOString(),
      actorType: input.actorType ?? AuthorizationActorType.SYSTEM,
      actorId: input.actorId?.trim() || null,
    },
    reasonCodes: [],
  };
}

function resolveProcessorIdentity(input: AuthorizationDecisionRequest): string | null {
  const processorId = input.processorId?.trim();
  if (processorId) return processorId;
  const serviceIdentity = input.serviceIdentity?.trim();
  if (serviceIdentity) return serviceIdentity;
  return null;
}

function isKnownProcessor(processorType: string, identity: string): boolean {
  const normalized = identity.trim();
  if (!normalized) return false;

  if (processorType === POLICY_RESOLVER_PROCESSOR_TYPE.PROVIDER_PLATFORM) {
    return (
      AUTHORIZATION_KNOWN_PROVIDER_IDENTITIES.has(normalized.toUpperCase()) ||
      AUTHORIZATION_KNOWN_SERVICE_IDENTITIES.has(normalized.toLowerCase())
    );
  }

  if (processorType === POLICY_RESOLVER_PROCESSOR_TYPE.EXTERNAL_PARTNER) {
    return normalized.length >= 2;
  }

  return (
    AUTHORIZATION_KNOWN_SERVICE_IDENTITIES.has(normalized.toLowerCase()) ||
    normalized.length >= 2
  );
}

function validateResourceScope(
  input: AuthorizationDecisionRequest,
): AuthorizationDecisionReasonCode | null {
  if (input.resourceType === POLICY_RESOLVER_RESOURCE_TYPE.ORGANIZATION) {
    if (!input.organizationWideScope && !input.resourceId?.trim()) {
      return AUTHORIZATION_DECISION_REASON.MISSING_RESOURCE_SCOPE;
    }
    return null;
  }

  if (input.resourceType === POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE && !input.vehicleId?.trim()) {
    return AUTHORIZATION_DECISION_REASON.MISSING_RESOURCE_SCOPE;
  }
  if (input.resourceType === POLICY_RESOLVER_RESOURCE_TYPE.CUSTOMER && !input.customerId?.trim()) {
    return AUTHORIZATION_DECISION_REASON.MISSING_RESOURCE_SCOPE;
  }
  if (input.resourceType === POLICY_RESOLVER_RESOURCE_TYPE.BOOKING && !input.bookingId?.trim()) {
    return AUTHORIZATION_DECISION_REASON.MISSING_RESOURCE_SCOPE;
  }
  if (input.resourceType === POLICY_RESOLVER_RESOURCE_TYPE.STATION && !input.stationId?.trim()) {
    return AUTHORIZATION_DECISION_REASON.MISSING_RESOURCE_SCOPE;
  }
  if (
    input.resourceType !== POLICY_RESOLVER_RESOURCE_TYPE.NONE &&
    input.resourceType !== POLICY_RESOLVER_RESOURCE_TYPE.CONNECTED_VEHICLES &&
    !input.resourceId?.trim()
  ) {
    return AUTHORIZATION_DECISION_REASON.MISSING_RESOURCE_SCOPE;
  }

  return null;
}
