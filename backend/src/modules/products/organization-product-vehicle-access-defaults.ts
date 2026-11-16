import { OrganizationProductVehicleAccessMode, ProductSlug } from '@prisma/client';

/** Legacy platform products that default to organization-wide vehicle access on new assignment. */
const LEGACY_ORGANIZATION_WIDE_PRODUCT_SLUGS: ReadonlySet<ProductSlug> = new Set([
  ProductSlug.RENTAL,
  ProductSlug.FLEET,
  ProductSlug.TAXI,
]);

/**
 * Default vehicle access mode for **new** OrganizationProduct rows only.
 * Legacy org-product rows: RENTAL/FLEET/TAXI backfill ORGANIZATION_WIDE; VYMOD SELECTED_VEHICLES (migration).
 */
export function defaultVehicleAccessModeForNewAssignment(
  productSlug: ProductSlug,
): OrganizationProductVehicleAccessMode {
  if (productSlug === ProductSlug.VYMOD) {
    return OrganizationProductVehicleAccessMode.SELECTED_VEHICLES;
  }
  if (LEGACY_ORGANIZATION_WIDE_PRODUCT_SLUGS.has(productSlug)) {
    return OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE;
  }
  throw new Error(
    `No default vehicleAccessMode for product slug "${productSlug}"; set explicitly via reviewed Owner policy`,
  );
}