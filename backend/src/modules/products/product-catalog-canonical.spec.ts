import { ProductCatalogStatus, ProductSlug } from '@prisma/client';
import { ensureVymodCatalogProduct, VYMOD_CATALOG_PRODUCT } from './product-catalog-canonical';

describe('product-catalog-canonical', () => {
  it('defines VYMOD slug without altering legacy slugs', () => {
    expect(VYMOD_CATALOG_PRODUCT.slug).toBe(ProductSlug.VYMOD);
    expect(Object.values(ProductSlug)).toEqual(
      expect.arrayContaining([
        ProductSlug.RENTAL,
        ProductSlug.FLEET,
        ProductSlug.TAXI,
        ProductSlug.VYMOD,
      ]),
    );
  });

  it('ensureVymodCatalogProduct is idempotent via upsert', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    await ensureVymodCatalogProduct({ product: { upsert } } as never);
    await ensureVymodCatalogProduct({ product: { upsert } } as never);

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith({
      where: { slug: ProductSlug.VYMOD },
      create: {
        slug: ProductSlug.VYMOD,
        name: VYMOD_CATALOG_PRODUCT.name,
        description: VYMOD_CATALOG_PRODUCT.description,
        catalogStatus: ProductCatalogStatus.ACTIVE,
      },
      update: {
        name: VYMOD_CATALOG_PRODUCT.name,
        description: VYMOD_CATALOG_PRODUCT.description,
      },
    });
  });
});