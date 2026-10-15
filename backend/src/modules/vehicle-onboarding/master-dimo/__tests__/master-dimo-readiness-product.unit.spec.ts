import { ProductSlug } from '@prisma/client';
import { resolveMasterDimoReadinessProduct } from '../master-dimo-readiness-product';
import { VehicleOnboardingError } from '../../errors/vehicle-onboarding.errors';

describe('resolveMasterDimoReadinessProduct', () => {
  it('prefers RENTAL when both RENTAL and FLEET are entitled', async () => {
    const prisma = {
      organizationProduct: {
        findMany: async () => [
          { product: { slug: ProductSlug.FLEET } },
          { product: { slug: ProductSlug.RENTAL } },
        ],
      },
    } as never;
    await expect(resolveMasterDimoReadinessProduct(prisma, 'org-1')).resolves.toBe(
      ProductSlug.RENTAL,
    );
  });

  it('uses FLEET when only FLEET is entitled', async () => {
    const prisma = {
      organizationProduct: {
        findMany: async () => [{ product: { slug: ProductSlug.FLEET } }],
      },
    } as never;
    await expect(resolveMasterDimoReadinessProduct(prisma, 'org-1')).resolves.toBe(
      ProductSlug.FLEET,
    );
  });

  it('fails closed when no RENTAL or FLEET entitlement', async () => {
    const prisma = {
      organizationProduct: { findMany: async () => [] },
    } as never;
    await expect(resolveMasterDimoReadinessProduct(prisma, 'org-1')).rejects.toBeInstanceOf(
      VehicleOnboardingError,
    );
  });
});
