import {
  OrganizationProductVehicleAccessMode,
  OrgProductStatus,
  ProductCatalogStatus,
  ProductSlug,
} from '@prisma/client';
import { ProductsService } from './products.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('ProductsService — catalog foundation', () => {
  const prisma = {
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    organizationProduct: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  let service: ProductsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductsService(prisma as unknown as PrismaService);
  });

  it('findAll exposes catalogStatus with ACTIVE default semantics', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'p1',
        slug: ProductSlug.RENTAL,
        name: 'Rental',
        description: null,
        catalogStatus: ProductCatalogStatus.ACTIVE,
        organizationProducts: [{ id: 'op1' }],
      },
      {
        id: 'p2',
        slug: ProductSlug.VYMOD,
        name: 'VYMOD',
        description: 'desc',
        catalogStatus: ProductCatalogStatus.ACTIVE,
        organizationProducts: [],
      },
    ]);

    const rows = await service.findAll();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      slug: ProductSlug.RENTAL,
      catalogStatus: ProductCatalogStatus.ACTIVE,
      organizationsCount: 1,
    });
    expect(rows[1]).toMatchObject({
      slug: ProductSlug.VYMOD,
      catalogStatus: ProductCatalogStatus.ACTIVE,
      organizationsCount: 0,
    });
  });

  it('getProductStats includes catalogStatus without changing org counts', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'p1',
        slug: ProductSlug.FLEET,
        name: 'Fleet',
        catalogStatus: ProductCatalogStatus.DISABLED,
        organizationProducts: [{ status: 'ACTIVE' }, { status: 'TRIAL' }],
      },
    ]);

    const stats = await service.getProductStats();
    expect(stats[0]).toEqual({
      id: 'p1',
      slug: ProductSlug.FLEET,
      name: 'Fleet',
      catalogStatus: ProductCatalogStatus.DISABLED,
      totalOrgs: 2,
      active: 1,
      trial: 1,
    });
  });

  describe('assignProduct vehicleAccessMode', () => {
    it('creates RENTAL with ORGANIZATION_WIDE without changing mode on update', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p-rental',
        slug: ProductSlug.RENTAL,
      });
      prisma.organizationProduct.upsert.mockImplementation(async (args) => args);

      await service.assignProduct('org-1', 'RENTAL');
      expect(prisma.organizationProduct.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
          }),
          update: expect.not.objectContaining({
            vehicleAccessMode: expect.anything(),
          }),
        }),
      );
    });

    it('creates VYMOD with SELECTED_VEHICLES', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p-vymod',
        slug: ProductSlug.VYMOD,
      });
      prisma.organizationProduct.upsert.mockResolvedValue({
        id: 'op',
        status: OrgProductStatus.ACTIVE,
        vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      });

      await service.assignProduct('org-1', 'VYMOD');
      expect(prisma.organizationProduct.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
          }),
        }),
      );
    });
  });
});