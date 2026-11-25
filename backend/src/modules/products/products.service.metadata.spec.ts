import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProductCatalogStatus, ProductSlug } from '@prisma/client';
import { ProductsService } from './products.service';

describe('ProductsService — catalog metadata patch', () => {
  const masterAdminAudit = { record: jest.fn().mockResolvedValue(undefined) };

  const tx = {
    product: { updateMany: jest.fn() },
    activityLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
  };

  const prisma = {
    product: { findUnique: jest.fn() },
    $transaction: jest.fn(async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  let service: ProductsService;
  const ADMIN = 'admin-1';
  const PID = 'prod-1';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductsService(prisma as never, masterAdminAudit as never);
    const catalogRow = {
      id: PID,
      slug: ProductSlug.RENTAL,
      name: 'Rental',
      description: null,
      catalogStatus: ProductCatalogStatus.ACTIVE,
      organizationProducts: [] as { id: string }[],
    };
    prisma.product.findUnique.mockResolvedValue(catalogRow);
    tx.product.updateMany.mockResolvedValue({ count: 1 });
  });

  it('rejects TAXI metadata mutation', async () => {
    await expect(
      service.updateProductMetadataForMasterAdmin({
        productSlug: ProductSlug.TAXI,
        patch: {
          name: 'Taxi',
          description: null,
          ifCurrentName: 'Taxi',
          ifCurrentDescription: null,
        },
        actorUserId: ADMIN,
        audit: { correlationId: 'c-1' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns idempotent result without transaction when unchanged', async () => {
    const row = await service.updateProductMetadataForMasterAdmin({
      productSlug: ProductSlug.RENTAL,
      patch: {
        name: 'Rental',
        description: null,
        ifCurrentName: 'Rental',
        ifCurrentDescription: null,
      },
      actorUserId: ADMIN,
      audit: { correlationId: 'c-2' },
    });
    expect(row.slug).toBe(ProductSlug.RENTAL);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws 409 when ifCurrent snapshot mismatches', async () => {
    await expect(
      service.updateProductMetadataForMasterAdmin({
        productSlug: ProductSlug.RENTAL,
        patch: {
          name: 'New',
          description: null,
          ifCurrentName: 'Stale',
          ifCurrentDescription: null,
        },
        actorUserId: ADMIN,
        audit: { correlationId: 'c-3' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rolls back when mandatory audit insert fails', async () => {
    tx.activityLog.create.mockRejectedValueOnce(new Error('audit write failed'));
    await expect(
      service.updateProductMetadataForMasterAdmin({
        productSlug: ProductSlug.RENTAL,
        patch: {
          name: 'SYNQDRIVE Rental',
          description: 'Desc',
          ifCurrentName: 'Rental',
          ifCurrentDescription: null,
        },
        actorUserId: ADMIN,
        audit: { correlationId: 'c-4' },
      }),
    ).rejects.toThrow('audit write failed');
    expect(tx.product.updateMany).toHaveBeenCalled();
    expect(tx.activityLog.create).toHaveBeenCalled();
  });

  it('throws 404 for unknown slug after lookup', async () => {
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(
      service.updateProductMetadataForMasterAdmin({
        productSlug: ProductSlug.FLEET,
        patch: {
          name: 'Fleet',
          description: null,
          ifCurrentName: 'Fleet',
          ifCurrentDescription: null,
        },
        actorUserId: ADMIN,
        audit: { correlationId: 'c-5' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});