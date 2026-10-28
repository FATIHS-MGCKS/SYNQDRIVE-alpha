/**
 * DS4 Assessment L2 scope eligibility — fleet-wide authority (tenant-safe, no vehicle allowlist).
 *
 * Production target: any organization / vehicle / trip with canonical identity once DS4 motion evidence
 * exists. Calibration cohort UUIDs are not an admission gate (see calibration-cohort module).
 *
 * Provider capability vs evidence quality is decided in the assessment engine after motion payload read.
 */

export type Ds4AssessmentScopeV1 = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
};

export type Ds4AssessmentScopeEligibilityContextV1 = {
  /** Vehicle row organization (when loaded). Must match scope.organizationId. */
  vehicleOrganizationId?: string | null;
  /** Motion run organization_id (when loaded). Must match scope.organizationId. */
  motionRunOrganizationId?: string | null;
  /** Trip row organization_id (when loaded). Must match scope.organizationId. */
  tripOrganizationId?: string | null;
};

export type Ds4AssessmentScopeEligibilityReasonV1 =
  | 'SCOPE_IDENTITY_INVALID'
  | 'ORGANIZATION_TENANCY_MISMATCH';

export type Ds4AssessmentScopeEligibilityResultV1 =
  | { eligible: true }
  | { eligible: false; reason: Ds4AssessmentScopeEligibilityReasonV1 };

const UUID_V4_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCanonicalDs4AssessmentUuidV1(value: string): boolean {
  return UUID_V4_LIKE.test(value.trim());
}

export function evaluateDs4AssessmentScopeEligibilityV1(
  scope: Ds4AssessmentScopeV1,
  context: Ds4AssessmentScopeEligibilityContextV1 = {},
): Ds4AssessmentScopeEligibilityResultV1 {
  const organizationId = scope.organizationId.trim();
  const vehicleId = scope.vehicleId.trim();
  const tripId = scope.tripId.trim();

  if (!isCanonicalDs4AssessmentUuidV1(organizationId) || !isCanonicalDs4AssessmentUuidV1(vehicleId)) {
    return { eligible: false, reason: 'SCOPE_IDENTITY_INVALID' };
  }
  if (!isCanonicalDs4AssessmentUuidV1(tripId)) {
    return { eligible: false, reason: 'SCOPE_IDENTITY_INVALID' };
  }

  const tenancyChecks: Array<string | null | undefined> = [
    context.vehicleOrganizationId,
    context.motionRunOrganizationId,
    context.tripOrganizationId,
  ];
  for (const org of tenancyChecks) {
    if (org != null && org !== organizationId) {
      return { eligible: false, reason: 'ORGANIZATION_TENANCY_MISMATCH' };
    }
  }

  return { eligible: true };
}
