import { PrivacyPolicyLifecycleStatus } from '@prisma/client';
import { POLICY_STATUS_SEMANTICS } from './policy-lifecycle-semantics.constants';

export interface PolicyStatusSemanticsDto {
  status: PrivacyPolicyLifecycleStatus;
  label: string;
  description: string;
  wasEverOperational: boolean;
  isTerminal: boolean;
  isReversible: boolean;
  displayCategory: 'pre_operational' | 'operational' | 'paused' | 'terminal_never_active' | 'terminal_was_active';
}

export function resolvePolicyStatusDisplayCategory(
  status: PrivacyPolicyLifecycleStatus,
): PolicyStatusSemanticsDto['displayCategory'] {
  const semantics = POLICY_STATUS_SEMANTICS[status];
  if (status === PrivacyPolicyLifecycleStatus.REJECTED) {
    return 'terminal_never_active';
  }
  if (semantics.isTerminal && semantics.wasEverOperational) {
    return 'terminal_was_active';
  }
  if (status === PrivacyPolicyLifecycleStatus.SUSPENDED) {
    return 'paused';
  }
  if (status === PrivacyPolicyLifecycleStatus.ACTIVE) {
    return 'operational';
  }
  if (semantics.isTerminal) {
    return 'terminal_never_active';
  }
  return 'pre_operational';
}

export function buildPolicyStatusSemantics(
  status: PrivacyPolicyLifecycleStatus,
): PolicyStatusSemanticsDto {
  const semantics = POLICY_STATUS_SEMANTICS[status];
  return {
    status,
    label: semantics.label,
    description: semantics.description,
    wasEverOperational: semantics.wasEverOperational,
    isTerminal: semantics.isTerminal,
    isReversible: semantics.isReversible,
    displayCategory: resolvePolicyStatusDisplayCategory(status),
  };
}

export function enrichPolicyWithStatusSemantics<T extends { status: PrivacyPolicyLifecycleStatus }>(
  record: T,
): T & { statusSemantics: PolicyStatusSemanticsDto } {
  return {
    ...record,
    statusSemantics: buildPolicyStatusSemantics(record.status),
  };
}
