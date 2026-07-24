import { PrivacyPolicyLifecycleStatus } from '@prisma/client';
import {
  POLICY_NEW_VERSION_ALLOWED_SOURCE_STATUSES,
  POLICY_ROLLBACK_FORBIDDEN_SOURCE_STATUSES,
} from './policy-lifecycle-semantics.constants';
import { POLICY_LIFECYCLE_ERROR_CODES } from './policy-lifecycle.constants';
import { throwPolicyLifecycleError } from './policy-lifecycle.exceptions';
import { HttpStatus } from '@nestjs/common';

/**
 * Rollback guard — prevents reactivating compromised or never-valid policies
 * by creating a new version from forbidden source statuses.
 */
export function assertNewVersionSourceAllowed(status: PrivacyPolicyLifecycleStatus): void {
  if (POLICY_ROLLBACK_FORBIDDEN_SOURCE_STATUSES.has(status)) {
    throwPolicyLifecycleError(
      POLICY_LIFECYCLE_ERROR_CODES.ROLLBACK_SOURCE_FORBIDDEN,
      `Cannot create a new version from ${status}. ` +
        'Rejected, revoked, superseded, or expired policies cannot be rolled back or reactivated.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  if (!POLICY_NEW_VERSION_ALLOWED_SOURCE_STATUSES.has(status)) {
    throwPolicyLifecycleError(
      POLICY_LIFECYCLE_ERROR_CODES.NEW_VERSION_SOURCE_INVALID,
      `New versions may only be created from ACTIVE or SUSPENDED policies (current: ${status}).`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export function assertExtensionSourceAllowed(status: PrivacyPolicyLifecycleStatus): void {
  if (status !== PrivacyPolicyLifecycleStatus.ACTIVE) {
    throwPolicyLifecycleError(
      POLICY_LIFECYCLE_ERROR_CODES.EXTENSION_REQUIRES_ACTIVE,
      'Policy extension requires an ACTIVE policy — create a new version through review instead.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
