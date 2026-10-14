import { ProductSlug, type PrismaClient } from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { READINESS_PRODUCT_ENTITLEMENT_STATUSES } from '../readiness/product-entitlement.authority';

const MASTER_DIMO_READINESS_PRODUCT_PRIORITY: ProductSlug[] = [
  ProductSlug.RENTAL,
  ProductSlug.FLEET,
];

/**
 * Resolves the readiness product for Master DIMO registration from active org entitlements.
 * Does not grant access — caller must still seal readiness against the returned slug.
 */
export async function resolveMasterDimoReadinessProduct(
  prisma: PrismaClient,
  organizationId: string,
): Promise<ProductSlug> {
  const rows = await prisma.organizationProduct.findMany({
    where: {
      organizationId,
      status: { in: READINESS_PRODUCT_ENTITLEMENT_STATUSES },
      product: { slug: { in: MASTER_DIMO_READINESS_PRODUCT_PRIORITY } },
    },
    include: { product: true },
  });
  const entitled = new Set(rows.map((r) => r.product.slug));
  for (const slug of MASTER_DIMO_READINESS_PRODUCT_PRIORITY) {
    if (entitled.has(slug)) {
      return slug;
    }
  }
  throw new VehicleOnboardingError(
    'PRODUCT_ENTITLEMENT_NOT_ACTIVE',
    'Organization has no ACTIVE RENTAL or FLEET entitlement for Master DIMO registration',
    { organizationId },
  );
}
