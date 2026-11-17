import { BadRequestException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';

/** Platform catalog products retired by owner decision — not assignable or reactivatable via write APIs. */
export const RETIRED_PLATFORM_PRODUCT_SLUGS: ReadonlySet<ProductSlug> = new Set([ProductSlug.TAXI]);

export function assertPlatformProductAssignable(productSlug: ProductSlug | string): void {
  const normalized = String(productSlug).trim().toUpperCase() as ProductSlug;
  if (RETIRED_PLATFORM_PRODUCT_SLUGS.has(normalized)) {
    throw new BadRequestException(
      `Product "${normalized}" is retired and cannot be assigned or reactivated`,
    );
  }
}