import { ConflictException } from '@nestjs/common';

/** Fail-closed gate until retention-aware organization offboarding is implemented (P1). */
export const ORGANIZATION_HARD_DELETE_DISABLED_CODE = 'ORGANIZATION_HARD_DELETE_DISABLED';

export const ORGANIZATION_OFFBOARDING_ACTION = 'USE_RETENTION_AWARE_OFFBOARDING';

export const ORGANIZATION_DELETE_SAFETY_DOC =
  'docs/remediation/organization-hard-delete-safety-p1.md';

export function organizationHardDeleteDisabledException(): ConflictException {
  return new ConflictException({
    code: ORGANIZATION_HARD_DELETE_DISABLED_CODE,
    message:
      'Direct organization deletion is disabled until a retention-aware offboarding workflow is approved and implemented.',
    action: ORGANIZATION_OFFBOARDING_ACTION,
    documentation: ORGANIZATION_DELETE_SAFETY_DOC,
    requiredFutureCapabilities: [
      'legal_hold_evaluation',
      'data_export_before_erasure',
      'subscription_and_billing_closure',
      'external_integration_revocation',
      'verified_erasure_audit_trail',
    ],
  });
}