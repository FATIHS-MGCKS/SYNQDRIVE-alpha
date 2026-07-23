import {
  POLICY_RESOLVER_ACTION_VALUES,
  POLICY_RESOLVER_PROCESSOR_TYPE_VALUES,
  POLICY_RESOLVER_REASON,
  POLICY_RESOLVER_RESOURCE_TYPE,
  POLICY_RESOLVER_RESOURCE_TYPE_VALUES,
  POLICY_RESOLVER_SOURCE_VALUES,
  type PolicyResolverReasonCode,
} from './policy-resolver.constants';
import type {
  PolicyResolverEvaluatedContext,
  PolicyResolverInput,
} from './policy-resolver.types';

export interface PolicyResolverContextValidation {
  context: PolicyResolverEvaluatedContext | null;
  blockingReasons: PolicyResolverReasonCode[];
}

export function buildPolicyResolverContext(
  input: PolicyResolverInput,
): PolicyResolverContextValidation {
  const blockingReasons: PolicyResolverReasonCode[] = [];

  if (!(input.organizationId ?? '').trim()) {
    blockingReasons.push(POLICY_RESOLVER_REASON.INPUT_INVALID);
  }
  if (!POLICY_RESOLVER_SOURCE_VALUES.includes(input.sourceSystem)) {
    blockingReasons.push(POLICY_RESOLVER_REASON.INPUT_INVALID);
  }
  if (!input.dataCategory) {
    blockingReasons.push(POLICY_RESOLVER_REASON.INPUT_INVALID);
  }
  if (!input.purpose) {
    blockingReasons.push(POLICY_RESOLVER_REASON.INPUT_INVALID);
  }
  if (!POLICY_RESOLVER_ACTION_VALUES.includes(input.action)) {
    blockingReasons.push(POLICY_RESOLVER_REASON.INPUT_INVALID);
  }
  if (!POLICY_RESOLVER_PROCESSOR_TYPE_VALUES.includes(input.processorType)) {
    blockingReasons.push(POLICY_RESOLVER_REASON.INPUT_INVALID);
  }
  if (!(input.processorId ?? '').trim()) {
    blockingReasons.push(POLICY_RESOLVER_REASON.INPUT_INVALID);
  }
  if (!POLICY_RESOLVER_RESOURCE_TYPE_VALUES.includes(input.resourceType)) {
    blockingReasons.push(POLICY_RESOLVER_REASON.INPUT_INVALID);
  }

  if (input.resourceType === POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE && !input.vehicleId) {
    blockingReasons.push(POLICY_RESOLVER_REASON.INPUT_INVALID);
  }
  if (input.resourceType === POLICY_RESOLVER_RESOURCE_TYPE.CUSTOMER && !input.customerId) {
    blockingReasons.push(POLICY_RESOLVER_REASON.INPUT_INVALID);
  }
  if (input.resourceType === POLICY_RESOLVER_RESOURCE_TYPE.BOOKING && !input.bookingId) {
    blockingReasons.push(POLICY_RESOLVER_REASON.INPUT_INVALID);
  }
  if (input.resourceType === POLICY_RESOLVER_RESOURCE_TYPE.STATION && !input.stationId) {
    blockingReasons.push(POLICY_RESOLVER_REASON.INPUT_INVALID);
  }

  if (blockingReasons.length > 0) {
    return { context: null, blockingReasons };
  }

  const effective =
    input.effectiveTimestamp != null ? new Date(input.effectiveTimestamp) : new Date();
  if (Number.isNaN(effective.getTime())) {
    return {
      context: null,
      blockingReasons: [POLICY_RESOLVER_REASON.INPUT_INVALID],
    };
  }

  return {
    context: {
      organizationId: input.organizationId.trim(),
      sourceSystem: input.sourceSystem,
      dataCategory: input.dataCategory,
      purpose: input.purpose,
      action: input.action,
      processorType: input.processorType,
      processorId: input.processorId.trim(),
      resourceType: input.resourceType,
      resourceId: input.resourceId?.trim() || null,
      stationId: input.stationId?.trim() || null,
      customerId: input.customerId?.trim() || null,
      bookingId: input.bookingId?.trim() || null,
      vehicleId: input.vehicleId?.trim() || null,
      dataSubjectReference: input.dataSubjectReference?.trim() || null,
      effectiveTimestamp: effective.toISOString(),
    },
    blockingReasons: [],
  };
}
