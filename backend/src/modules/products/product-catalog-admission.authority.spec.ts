import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  OrgProductStatus,
  OrganizationProductVehicleAccessMode,
  ProductCatalogStatus,
  ProductSlug,
} from '@prisma/client';
import {
  PRODUCT_CATALOG_ADMISSION_OPERATION,
  ProductCatalogAdmissionDeniedError,
  assertProductCatalogAdmissionAllowed,
  assertProductCatalogRowAdmissionAllowed,
  isOrganizationProductAdmissionReactivation,
  isVehicleAccessScopeBroadening,
  lockProductCatalogRowBySlug,
} from './product-catalog-admission.authority';

describe('product-catalog-admission.authority', () => {
  it('allows ACTIVE catalog for all admission operations', () => {
    expect(() =>
      assertProductCatalogAdmissionAllowed(
        ProductCatalogStatus.ACTIVE,
        PRODUCT_CATALOG_ADMISSION_OPERATION.ORGANIZATION_PRODUCT_NEW,
        ProductSlug.RENTAL,
      ),
    ).not.toThrow();
  });

  it('denies DISABLED catalog with typed 403', () => {
    try {
      assertProductCatalogAdmissionAllowed(
        ProductCatalogStatus.DISABLED,
        PRODUCT_CATALOG_ADMISSION_OPERATION.ORGANIZATION_PRODUCT_REACTIVATION,
        ProductSlug.FLEET,
      );
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ProductCatalogAdmissionDeniedError);
      expect(e).toBeInstanceOf(ForbiddenException);
      const body = (e as ProductCatalogAdmissionDeniedError).getResponse() as Record<string, unknown>;
      expect(body.error).toBe('PRODUCT_CATALOG_ADMISSION_DENIED');
      expect(body.reason).toBe('CATALOG_DISABLED');
    }
  });

  it('classifies org product reactivation admission', () => {
    expect(
      isOrganizationProductAdmissionReactivation(OrgProductStatus.SUSPENDED, OrgProductStatus.ACTIVE),
    ).toBe(true);
    expect(
      isOrganizationProductAdmissionReactivation(OrgProductStatus.ACTIVE, OrgProductStatus.ACTIVE),
    ).toBe(false);
  });

  it('classifies vehicle access broaden admission', () => {
    expect(
      isVehicleAccessScopeBroadening(
        OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
        OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      ),
    ).toBe(true);
    expect(
      isVehicleAccessScopeBroadening(
        OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
        OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      ),
    ).toBe(false);
  });

  it('assertProductCatalogRowAdmissionAllowed throws NotFound when row missing', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    await expect(
      assertProductCatalogRowAdmissionAllowed(
        tx,
        ProductSlug.VYMOD,
        PRODUCT_CATALOG_ADMISSION_OPERATION.VEHICLE_PRODUCT_GRANT,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lockProductCatalogRowBySlug returns locked row', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: 'prod-1',
          slug: ProductSlug.RENTAL,
          catalogStatus: ProductCatalogStatus.ACTIVE,
        },
      ]),
    };
  const row = await lockProductCatalogRowBySlug(tx, ProductSlug.RENTAL);
    expect(row?.id).toBe('prod-1');
  });
});