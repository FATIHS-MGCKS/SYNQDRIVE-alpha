import { BadRequestException } from '@nestjs/common';
import { OrganizationProductVehicleAccessMode, ProductSlug } from '@prisma/client';

/** Platform catalog products retired by owner decision — not assignable or reactivatable via write APIs. */
export const RETIRED_PLATFORM_PRODUCT_SLUGS: ReadonlySet<ProductSlug> = new Set([ProductSlug.TAXI]);

function normalizeProductSlug(productSlug: ProductSlug | string): ProductSlug {
  return String(productSlug).trim().toUpperCase() as ProductSlug;
}

function assertNotRetiredPlatformProduct(
  productSlug: ProductSlug | string,
  action: 'assigned or reactivated' | 'granted or reactivated',
): void {
  const normalized = normalizeProductSlug(productSlug);
  if (RETIRED_PLATFORM_PRODUCT_SLUGS.has(normalized)) {
    throw new BadRequestException(
      `Product "${normalized}" is retired and cannot be ${action}`,
    );
  }
}

export function assertPlatformProductAssignable(productSlug: ProductSlug | string): void {
  assertNotRetiredPlatformProduct(productSlug, 'assigned or reactivated');
}

export function assertPlatformProductGrantWritable(productSlug: ProductSlug | string): void {
  assertNotRetiredPlatformProduct(productSlug, 'granted or reactivated');
}

export function assertPlatformProductMetadataEditable(productSlug: ProductSlug | string): void {
  const normalized = normalizeProductSlug(productSlug);
  if (RETIRED_PLATFORM_PRODUCT_SLUGS.has(normalized)) {
    throw new BadRequestException(
      `Product "${normalized}" is retired and cannot have catalog metadata edited`,
    );
  }
}

/**
 * Legacy TAXI org assignments may remain at SELECTED_VEHICLES or ORGANIZATION_WIDE.
 * Narrowing ORGANIZATION_WIDE → SELECTED_VEHICLES is allowed; broadening is not.
 */
export function assertRetiredPlatformVehicleAccessModeMutation(input: {
  productSlug: ProductSlug;
  from: OrganizationProductVehicleAccessMode;
  to: OrganizationProductVehicleAccessMode;
}): void {
  if (!RETIRED_PLATFORM_PRODUCT_SLUGS.has(input.productSlug)) {
    return;
  }
  if (input.from === input.to) {
    return;
  }
  if (
    input.from === OrganizationProductVehicleAccessMode.SELECTED_VEHICLES &&
    input.to === OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE
  ) {
    throw new BadRequestException(
      `Product "${input.productSlug}" is retired; vehicle access cannot be broadened from SELECTED_VEHICLES to ORGANIZATION_WIDE`,
    );
  }
}