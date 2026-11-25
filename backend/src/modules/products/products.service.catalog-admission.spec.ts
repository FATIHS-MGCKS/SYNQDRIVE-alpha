import { ForbiddenException } from '@nestjs/common';
import {
  OrganizationProductVehicleAccessMode,
  OrgProductPlan,
  OrgProductStatus,
  ProductCatalogStatus,
  ProductSlug,
} from '@prisma/client';
import { ProductsService } from './products.service';
import { ProductCatalogAdmissionDeniedError } from './product-catalog-admission.authority';

describe('ProductsService — catalog admission (P2A)', () => {
  const masterAdminAudit = { record: jest.fn().mockResolvedValue(undefined) };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    product: { findUnique: jest.fn(), findMany: jest.fn() },
    organizationProduct: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      upsert: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

  let service: ProductsService;
  const ORG = 'org-1';
  const PID = 'prod-fleet';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductsService(prisma as never, masterAdminAudit as never);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: PID,
        slug: ProductSlug.FLEET,
        catalogStatus: ProductCatalogStatus.DISABLED,
      },
    ]);
  });

  function mockCatalog(status: ProductCatalogStatus, slug: ProductSlug = ProductSlug.FLEET) {
    prisma.$queryRaw.mockResolvedValue([{ id: PID, slug, catalogStatus: status }]);
  }

  it('denies new Master Admin assignment when catalog DISABLED', async () => {
    mockCatalog(ProductCatalogStatus.DISABLED);
    prisma.organizationProduct.findUnique.mockResolvedValue(null);

    await expect(
      service.assignProductForMasterAdmin({
        orgId: ORG,
        productSlug: ProductSlug.FLEET,
        actorUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(ProductCatalogAdmissionDeniedError);
    expect(prisma.organizationProduct.create).not.toHaveBeenCalled();
  });

  it('denies legacy assignProduct reactivation when catalog DISABLED', async () => {
    mockCatalog(ProductCatalogStatus.DISABLED);
    prisma.organizationProduct.findUnique.mockResolvedValue({
      id: 'op-1',
      status: OrgProductStatus.SUSPENDED,
    });

    await expect(service.assignProduct(ORG, ProductSlug.FLEET)).rejects.toBeInstanceOf(
      ProductCatalogAdmissionDeniedError,
    );
    expect(prisma.organizationProduct.upsert).not.toHaveBeenCalled();
  });

  it('allows plan change on already-ACTIVE assignment when catalog DISABLED', async () => {
    mockCatalog(ProductCatalogStatus.DISABLED);
    prisma.organizationProduct.findUnique.mockResolvedValue({
      id: 'op-1',
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      plan: OrgProductPlan.STARTER,
      status: OrgProductStatus.ACTIVE,
    });
    prisma.organizationProduct.update.mockResolvedValue({
      id: 'op-1',
      plan: OrgProductPlan.BUSINESS,
      status: OrgProductStatus.ACTIVE,
      vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    });

    const row = await service.assignProductForMasterAdmin({
      orgId: ORG,
      productSlug: ProductSlug.FLEET,
      plan: OrgProductPlan.BUSINESS,
      actorUserId: 'admin-1',
    });

    expect(row.plan).toBe(OrgProductPlan.BUSINESS);
    expect(prisma.organizationProduct.update).toHaveBeenCalled();
  });

  it('passes new assignment when catalog ACTIVE', async () => {
    mockCatalog(ProductCatalogStatus.ACTIVE);
    prisma.organizationProduct.findUnique.mockResolvedValue(null);
    prisma.organizationProduct.create.mockResolvedValue({
      id: 'op-new',
      status: OrgProductStatus.ACTIVE,
    });

    await service.assignProductForMasterAdmin({
      orgId: ORG,
      productSlug: ProductSlug.FLEET,
      actorUserId: 'admin-1',
    });

    expect(prisma.organizationProduct.create).toHaveBeenCalled();
  });

  it('denies vehicle access broaden when catalog DISABLED', async () => {
    mockCatalog(ProductCatalogStatus.DISABLED);
    prisma.organizationProduct.findUnique.mockResolvedValue({
      id: 'op-1',
      vehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
    });

    await expect(
      service.updateVehicleAccessMode({
        orgId: ORG,
        productSlug: ProductSlug.FLEET,
        vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
        ifCurrentVehicleAccessMode: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
        actorUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.organizationProduct.updateMany).not.toHaveBeenCalled();
  });
});