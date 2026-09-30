import type { Organization } from '@prisma/client';

/**
 * READINESS_PRODUCT_AUTHORITY=Organization.businessType
 *
 * No stronger subscription/plan override exists in repository for onboarding readiness
 * as of VO-4 (billing product SKUs are not consulted here).
 */
export function readinessProductAuthorityLabel(): string {
  return 'Organization.businessType';
}

export function mapBusinessTypeToProductLabel(businessType: Organization['businessType']): string {
  return businessType;
}
