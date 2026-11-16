import { OrganizationProductVehicleAccessMode, ProductSlug } from '@prisma/client';

/**
 * Default vehicle access mode for **new** OrganizationProduct rows only.
 * Legacy rows are backfilled to ORGANIZATION_WIDE via migration.
 * VYMOD must not silently receive organization-wide vehicle access.
 */
export function defaultVehicleAccessModeForNewAssignment(
  productSlug: ProductSlug,
): OrganizationProductVehicleAccessMode {
  if (productSlug === ProductSlug.VYMOD) {
    return OrganizationProductVehicleAccessMode.SELECTED_VEHICLES;
  }
  return OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE;
}