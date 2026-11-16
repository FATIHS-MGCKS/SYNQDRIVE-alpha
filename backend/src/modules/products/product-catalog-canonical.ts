import { PrismaClient, ProductCatalogStatus, ProductSlug } from '@prisma/client';

/** Canonical catalog metadata (platform licensing only — not org entitlements). */
export const VYMOD_CATALOG_PRODUCT = {
  slug: ProductSlug.VYMOD,
  name: 'SynqDrive VYMOD',
  description: 'Vehicle identity and mobility product module',
} as const;

type ProductCatalogClient = Pick<PrismaClient, 'product'>;

/**
 * Idempotent registration of the VYMOD catalog row.
 * Does not assign organizations, vehicles, M2M clients, or privileged users.
 */
export async function ensureVymodCatalogProduct(prisma: ProductCatalogClient): Promise<void> {
  await prisma.product.upsert({
    where: { slug: VYMOD_CATALOG_PRODUCT.slug },
    create: {
      slug: VYMOD_CATALOG_PRODUCT.slug,
      name: VYMOD_CATALOG_PRODUCT.name,
      description: VYMOD_CATALOG_PRODUCT.description,
      catalogStatus: ProductCatalogStatus.ACTIVE,
    },
    update: {
      name: VYMOD_CATALOG_PRODUCT.name,
      description: VYMOD_CATALOG_PRODUCT.description,
    },
  });
}