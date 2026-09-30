import { OrgProductStatus, ProductSlug } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

/**
 * Aligns with ProductLicenseGuard: only ACTIVE organization product rows grant access.
 * (TRIAL/SUSPENDED/CANCELLED do not satisfy product license for readiness.)
 */
export const READINESS_PRODUCT_ENTITLEMENT_STATUSES: OrgProductStatus[] = [OrgProductStatus.ACTIVE];

export async function assertOrganizationProductEntitled(
  db: Prisma.TransactionClient | { organizationProduct: Prisma.TransactionClient['organizationProduct'] },
  organizationId: string,
  selectedProduct: ProductSlug,
): Promise<{ status: OrgProductStatus; productId: string }> {
  const row = await db.organizationProduct.findFirst({
    where: {
      organizationId,
      product: { slug: selectedProduct },
      status: { in: READINESS_PRODUCT_ENTITLEMENT_STATUSES },
    },
    include: { product: true },
  });
  if (!row) {
    throw new VehicleOnboardingError(
      'PRODUCT_ENTITLEMENT_NOT_ACTIVE',
      `Organization is not entitled to product ${selectedProduct}`,
      { selectedProduct },
    );
  }
  return { status: row.status, productId: row.productId };
}

export async function isOrganizationProductEntitled(
  db: Prisma.TransactionClient | { organizationProduct: Prisma.TransactionClient['organizationProduct'] },
  organizationId: string,
  selectedProduct: ProductSlug,
): Promise<boolean> {
  try {
    await assertOrganizationProductEntitled(db, organizationId, selectedProduct);
    return true;
  } catch (e) {
    if (e instanceof VehicleOnboardingError && e.code === 'PRODUCT_ENTITLEMENT_NOT_ACTIVE') {
      return false;
    }
    throw e;
  }
}
