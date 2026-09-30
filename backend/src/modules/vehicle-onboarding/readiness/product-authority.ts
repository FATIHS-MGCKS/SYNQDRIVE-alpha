/**
 * READINESS_SELECTED_PRODUCT_AUTHORITY=explicit ProductSlug on evaluate/seal + OrganizationProduct entitlement
 *
 * Organization.businessType is classification context only — not product license.
 */
export function readinessSelectedProductAuthorityLabel(): string {
  return 'Explicit ProductSlug + OrganizationProduct (ProductLicenseGuard-aligned ACTIVE status)';
}

export function organizationBusinessTypeRoleLabel(): string {
  return 'CLASSIFICATION_CONTEXT_ONLY';
}
