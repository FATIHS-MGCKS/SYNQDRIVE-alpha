import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { PrivacyPolicyLifecycleStatus } from '@prisma/client';
import { POLICY_LIFECYCLE_ERROR_CODES } from './policy-lifecycle.constants';

export class PolicyLifecycleDomainError extends HttpException {
  constructor(
    message: string,
    public readonly code: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>,
  ) {
    super({ message, code, ...(details ? { details } : {}) }, status);
    this.name = 'PolicyLifecycleDomainError';
  }
}

export class PolicyLifecycleTransitionException extends PolicyLifecycleDomainError {
  constructor(fromStatus: PrivacyPolicyLifecycleStatus, toStatus: PrivacyPolicyLifecycleStatus) {
    super(
      `Policy lifecycle transition not allowed: ${fromStatus} → ${toStatus}`,
      POLICY_LIFECYCLE_ERROR_CODES.INVALID_STATUS_TRANSITION,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { fromStatus, toStatus },
    );
    this.name = 'PolicyLifecycleTransitionException';
  }
}

export class PolicyNotActivatableException extends PolicyLifecycleDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(
      message,
      POLICY_LIFECYCLE_ERROR_CODES.NOT_ACTIVATABLE,
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    );
    this.name = 'PolicyNotActivatableException';
  }
}

export class PolicyActiveConflictException extends PolicyLifecycleDomainError {
  constructor(
    entityType: string,
    organizationId: string,
    policyFamilyId: string,
  ) {
    super(
      'Another policy version is already active for this policy family',
      POLICY_LIFECYCLE_ERROR_CODES.ACTIVE_CONFLICT,
      HttpStatus.CONFLICT,
      { entityType, organizationId, policyFamilyId },
    );
    this.name = 'PolicyActiveConflictException';
  }
}

export class PolicyImmutableException extends PolicyLifecycleDomainError {
  constructor(message = 'Active or historical policy versions cannot be modified. Create a new version.') {
    super(message, POLICY_LIFECYCLE_ERROR_CODES.IMMUTABLE, HttpStatus.UNPROCESSABLE_ENTITY);
    this.name = 'PolicyImmutableException';
  }
}

export class PolicyNotFoundException extends NotFoundException {
  constructor(entityType: string) {
    super({ message: `${entityType} not found`, code: POLICY_LIFECYCLE_ERROR_CODES.NOT_FOUND });
    this.name = 'PolicyNotFoundException';
  }
}

export function throwPolicyLifecycleError(
  code: string,
  message: string,
  status: HttpStatus = HttpStatus.BAD_REQUEST,
): never {
  throw new PolicyLifecycleDomainError(message, code, status);
}
