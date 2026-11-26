import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  OrgProductStatus,
  ProductCatalogStatus,
  ProductSlug,
  VehicleProductGrantStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { VehicleProductGrantService } from './vehicle-product-grant.service';

const ORG = 'org-a';
const VEH = 'veh-x';
const ADMIN = 'admin-1';

describe('VehicleProductGrantService', () => {
  const masterAdminAudit = { record: jest.fn().mockResolvedValue(undefined) };

  type Row = {
    id: string;
    organizationId: string;
    vehicleId: string;
    productSlug: ProductSlug;
    status: VehicleProductGrantStatus;
    grantVersion: number;
    grantedAt: Date;
    revokedAt: Date | null;
    grantedByUserId: string;
    revokedByUserId: string | null;
  };

  type PrismaLockMocks = {
    organizationProduct?: { id: string; status: OrgProductStatus } | null;
    vehicle?: {
      id: string;
      organizationId: string;
      registryLifecycle: VehicleRegistryLifecycle;
    } | null;
  };

  function makeQueryRaw(store: Map<string, Row>, mocks: PrismaLockMocks = {}) {
    return jest.fn(async (query: { strings: readonly string[]; values: readonly unknown[] }) => {
      const sql = query.strings.join('?').toLowerCase();
      if (sql.includes('from products')) {
        return [
          {
            id: 'prod-catalog',
            slug: ProductSlug.RENTAL,
            catalogStatus: ProductCatalogStatus.ACTIVE,
          },
        ];
      }
      if (sql.includes('organization_products')) {
        if (mocks.organizationProduct === null) {
          return [];
        }
        return [
          mocks.organizationProduct ?? { id: 'op-1', status: OrgProductStatus.ACTIVE },
        ];
      }
      if (sql.includes('from vehicles')) {
        if (mocks.vehicle === null) {
          return [];
        }
        return [
          mocks.vehicle ?? {
            id: VEH,
            organizationId: ORG,
            registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
          },
        ];
      }
      if (sql.includes('vehicle_product_grants')) {
        const slug =
          (query.values.find(
            (v) => typeof v === 'string' && Object.values(ProductSlug).includes(v as ProductSlug),
          ) as ProductSlug | undefined) ?? ProductSlug.RENTAL;
        const vehicleId =
          (query.values.find((v) => typeof v === 'string' && v.length > 0 && v !== slug) as
            | string
            | undefined) ?? VEH;
        const row = store.get(`${vehicleId}:${slug}`);
        if (!row) {
          return [];
        }
        return [
          {
            id: row.id,
            organizationId: row.organizationId,
            vehicleId: row.vehicleId,
            productSlug: row.productSlug,
            status: row.status,
            grantVersion: row.grantVersion,
            grantedAt: row.grantedAt,
            grantedByUserId: row.grantedByUserId,
            revokedAt: row.revokedAt,
            revokedByUserId: row.revokedByUserId,
          },
        ];
      }
      return [];
    });
  }

  function makePrisma(store: Map<string, Row>, mocks: PrismaLockMocks = {}) {
    const key = (vehicleId: string, productSlug: ProductSlug) => `${vehicleId}:${productSlug}`;
    const tx = {
      $queryRaw: makeQueryRaw(store, mocks),
      vehicleProductGrant: {
        findUnique: async ({
          where,
        }: {
          where:
            | { vehicleId_productSlug: { vehicleId: string; productSlug: ProductSlug } }
            | { id: string };
        }) => {
          if ('id' in where) {
            return [...store.values()].find((r) => r.id === where.id) ?? null;
          }
          return (
            store.get(
              key(where.vehicleId_productSlug.vehicleId, where.vehicleId_productSlug.productSlug),
            ) ?? null
          );
        },
        findUniqueOrThrow: async (args: { where: { id: string } }) => {
          const row = await tx.vehicleProductGrant.findUnique(args);
          if (!row) throw new Error('missing');
          return row;
        },
        findFirst: async ({
          where,
        }: {
          where: { organizationId: string; vehicleId: string; productSlug: ProductSlug; status: VehicleProductGrantStatus };
        }) =>
          [...store.values()].find(
            (r) =>
              r.organizationId === where.organizationId &&
              r.vehicleId === where.vehicleId &&
              r.productSlug === where.productSlug &&
              r.status === where.status,
          ) ?? null,
        findMany: jest.fn(),
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; status?: VehicleProductGrantStatus; organizationId?: string };
          data: Record<string, unknown> & { grantVersion?: { increment: number } };
        }) => {
          const row = [...store.values()].find((r) => r.id === where.id);
          if (!row) return { count: 0 };
          if (where.status && row.status !== where.status) return { count: 0 };
          if (where.organizationId && row.organizationId !== where.organizationId) return { count: 0 };
          const { grantVersion: versionBump, ...rest } = data;
          if (versionBump && typeof versionBump === 'object' && 'increment' in versionBump) {
            row.grantVersion += versionBump.increment;
          }
          Object.assign(row, rest);
          return { count: 1 };
        },
        create: async ({ data }: { data: Omit<Row, 'id' | 'revokedAt' | 'revokedByUserId'> }) => {
          if (store.has(key(data.vehicleId, data.productSlug))) {
            const err = new Error('unique') as Error & { code: string };
            err.code = 'P2002';
            throw err;
          }
          const row: Row = {
            id: `g-${store.size + 1}`,
            ...data,
            revokedAt: null,
            revokedByUserId: null,
          };
          store.set(key(data.vehicleId, data.productSlug), row);
          return row;
        },
      },
    };

    return {
      organizationProduct: {
        findFirst: jest.fn().mockResolvedValue({ id: 'op-1' }),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: VEH,
          organizationId: ORG,
          registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
        }),
      },
      vehicleProductGrant: tx.vehicleProductGrant,
      $transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx),
    };
  }

  let store: Map<string, Row>;
  let service: VehicleProductGrantService;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new Map();
    service = new VehicleProductGrantService(makePrisma(store) as never, masterAdminAudit as never);
  });

  it('grants Product A to Vehicle X with grantVersion 1', async () => {
    const row = await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    expect(row.productSlug).toBe(ProductSlug.RENTAL);
    expect(row.grantVersion).toBe(1);
  });

  it('Product B has no active grant unless created', async () => {
    await expect(service.hasActiveGrant(ORG, VEH, ProductSlug.FLEET)).resolves.toBe(false);
  });

  it('Vehicle X can hold multiple product grants', async () => {
    await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.FLEET,
      grantedByUserId: ADMIN,
    });
    await expect(service.hasActiveGrant(ORG, VEH, ProductSlug.RENTAL)).resolves.toBe(true);
    await expect(service.hasActiveGrant(ORG, VEH, ProductSlug.FLEET)).resolves.toBe(true);
  });

  it('increments grantVersion on revoke and re-grant', async () => {
    await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    const revoked = await service.revokeGrant({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      revokedByUserId: ADMIN,
    });
    expect(revoked.grantVersion).toBe(2);
    const regranted = await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    expect(regranted.grantVersion).toBe(3);
  });

  it('idempotent active grant does not bump version', async () => {
    await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    const again = await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    expect(again.grantVersion).toBe(1);
  });

  it('rejects foreign-org vehicle binding as not found', async () => {
    const prisma = makePrisma(store, {
      vehicle: {
        id: VEH,
        organizationId: 'other-org',
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      },
    });
    service = new VehicleProductGrantService(prisma as never, masterAdminAudit as never);
    await expect(
      service.grantExplicit({
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: ADMIN,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects grant when organization product is inactive', async () => {
    const prisma = makePrisma(store, { organizationProduct: null });
    service = new VehicleProductGrantService(prisma as never, masterAdminAudit as never);
    await expect(
      service.grantExplicit({
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects grant when organization product is TRIAL (operational fail-closed)', async () => {
    const prisma = makePrisma(store, {
      organizationProduct: { id: 'op-1', status: OrgProductStatus.TRIAL },
    });
    service = new VehicleProductGrantService(prisma as never, masterAdminAudit as never);
    await expect(
      service.grantExplicit({
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.size).toBe(0);
  });

  it('rejects offboarded vehicle', async () => {
    const prisma = makePrisma(store, {
      vehicle: {
        id: VEH,
        organizationId: ORG,
        registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED,
      },
    });
    service = new VehicleProductGrantService(prisma as never, masterAdminAudit as never);
    await expect(
      service.grantExplicit({
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: ADMIN,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('idempotent revoke when already revoked', async () => {
    await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    await service.revokeGrant({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      revokedByUserId: ADMIN,
    });
    const row = await service.revokeGrant({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      revokedByUserId: ADMIN,
    });
    expect(row.grantVersion).toBe(2);
  });

  describe('retired TAXI platform product grants', () => {
    it('rejects new TAXI grant before organization product lookup and transaction', async () => {
      const prisma = makePrisma(store);
      const txSpy = jest.spyOn(prisma, '$transaction');
      service = new VehicleProductGrantService(prisma as never, masterAdminAudit as never);
      await expect(
        service.grantExplicit({
          organizationId: ORG,
          vehicleId: VEH,
          productSlug: ProductSlug.TAXI,
          grantedByUserId: ADMIN,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.organizationProduct.findFirst).not.toHaveBeenCalled();
      expect(txSpy).not.toHaveBeenCalled();
      expect(store.size).toBe(0);
    });

    it('rejects reactivating a revoked TAXI grant', async () => {
      store.set(`${VEH}:TAXI`, {
        id: 'g-taxi',
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.TAXI,
        status: VehicleProductGrantStatus.REVOKED,
        grantVersion: 2,
        grantedAt: new Date(),
        revokedAt: new Date(),
        grantedByUserId: ADMIN,
        revokedByUserId: ADMIN,
      });
      await expect(
        service.grantExplicit({
          organizationId: ORG,
          vehicleId: VEH,
          productSlug: ProductSlug.TAXI,
          grantedByUserId: ADMIN,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(store.get(`${VEH}:TAXI`)?.status).toBe(VehicleProductGrantStatus.REVOKED);
      expect(store.get(`${VEH}:TAXI`)?.grantVersion).toBe(2);
    });

    it('allows revoking an active historical TAXI grant', async () => {
      store.set(`${VEH}:TAXI`, {
        id: 'g-taxi',
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.TAXI,
        status: VehicleProductGrantStatus.ACTIVE,
        grantVersion: 1,
        grantedAt: new Date(),
        revokedAt: null,
        grantedByUserId: ADMIN,
        revokedByUserId: null,
      });
      const revoked = await service.revokeGrant({
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.TAXI,
        revokedByUserId: ADMIN,
      });
      expect(revoked.status).toBe(VehicleProductGrantStatus.REVOKED);
    });

    it('lists historical TAXI grants without mutation', async () => {
      store.set(`${VEH}:TAXI`, {
        id: 'g-taxi',
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.TAXI,
        status: VehicleProductGrantStatus.ACTIVE,
        grantVersion: 1,
        grantedAt: new Date(),
        revokedAt: null,
        grantedByUserId: ADMIN,
        revokedByUserId: null,
      });
      const prisma = makePrisma(store);
      (prisma.vehicleProductGrant.findMany as jest.Mock) = jest
        .fn()
        .mockResolvedValue([
          {
            vehicleId: VEH,
            productSlug: ProductSlug.TAXI,
            status: VehicleProductGrantStatus.ACTIVE,
            grantVersion: 1,
            grantedAt: new Date(),
            revokedAt: null,
          },
        ]);
      service = new VehicleProductGrantService(prisma as never, masterAdminAudit as never);
      const rows = await service.listGrantedVehicles(ORG, ProductSlug.TAXI);
      expect(rows).toHaveLength(1);
      expect(rows[0].productSlug).toBe(ProductSlug.TAXI);
    });
  });

  it('audit is not called on idempotent grant', async () => {
    await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
      audit: { correlationId: 'c1' },
    });
    await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
      audit: { correlationId: 'c2' },
    });
    expect(masterAdminAudit.record).toHaveBeenCalledTimes(1);
  });
});