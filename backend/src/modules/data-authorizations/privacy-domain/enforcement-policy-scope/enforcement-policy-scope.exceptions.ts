import { BadRequestException } from '@nestjs/common';

export const ENFORCEMENT_POLICY_SCOPE_ERROR = {
  POLICY_NOT_FOUND: 'ENFORCEMENT_POLICY_NOT_FOUND',
  POLICY_NOT_EDITABLE: 'ENFORCEMENT_POLICY_SCOPE_NOT_EDITABLE',
  ACTIVE_REQUIRES_NEW_VERSION: 'ENFORCEMENT_POLICY_ACTIVE_SCOPE_REQUIRES_NEW_VERSION',
  INVALID_SCOPE_RESOURCES: 'ENFORCEMENT_POLICY_INVALID_SCOPE_RESOURCES',
  EMPTY_SCOPE_REQUIRED: 'ENFORCEMENT_POLICY_EMPTY_SCOPE_REQUIRED',
  DUPLICATE_SCOPE_IDS: 'ENFORCEMENT_POLICY_DUPLICATE_SCOPE_IDS',
  CONCURRENT_SCOPE_UPDATE: 'ENFORCEMENT_POLICY_CONCURRENT_SCOPE_UPDATE',
} as const;

export class EnforcementPolicyScopeException extends BadRequestException {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super({ code, message });
  }
}

export function throwScopeError(code: string, message: string): never {
  throw new EnforcementPolicyScopeException(code, message);
}
