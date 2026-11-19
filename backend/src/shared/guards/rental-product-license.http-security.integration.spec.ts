import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { OrgProductStatus, ProductSlug } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AuthGuard } from '@shared/auth/auth.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { ProductLicenseGuard } from './product-license.guard';
import { CustomersController } from '@modules/customers/customers.controller';
import { CustomersService } from '@modules/customers/customers.service';
import { CustomerDocumentsService } from '@modules/customers/customer-documents.service';
import { CustomerTimelineService } from '@modules/customers/customer-timeline.service';
import { StorageService } from '@shared/storage/storage.service';
import { ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES } from '@modules/products/entitlements/entitlements-policy';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

type ProductRow = {
  organizationId: string;
  status: OrgProductStatus;
  product: { slug: ProductSlug };
};

describe('Rental product license — HTTP enforcement (CustomersController sample)', () => {
  let app: INestApplication;
  const jwtSecret = 'p6-pr3-rental-license-http-test-secret';
  const originalSecret = process.env.JWT_SECRET;

  let orgProducts: ProductRow[] = [];

  const prisma = {
    organization: {
      findUnique: jest.fn(async (args: { where: { id: string } }) =>
        args.where.id === ORG_A || args.where.id === ORG_B ? { id: args.where.id } : null,
      ),
    },
    organizationMembership: {
      findFirst: jest.fn(
        async (args: { where: { userId: string; organizationId: string; status?: string } }) => {
          if (args.where.status && args.where.status !== 'ACTIVE') return null;
          if (args.where.organizationId === ORG_A && args.where.userId === 'worker-a') {
            return { id: 'mem-1', role: 'WORKER' };
          }
          if (args.where.organizationId === ORG_B && args.where.userId === 'worker-b') {
            return { id: 'mem-2', role: 'WORKER' };
          }
          return null;
        },
      ),
    },
    organizationProduct: {
      findFirst: jest.fn(
        async (args: {
          where: {
            organizationId: string;
            product: { slug: string };
            status?: { in: OrgProductStatus[] };
          };
        }) => {
          const row = orgProducts.find(
            (p) =>
              p.organizationId === args.where.organizationId &&
              p.product.slug === args.where.product.slug,
          );
          if (!row) return null;
          const allowed = args.where.status?.in ?? ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES;
          if (!(allowed as OrgProductStatus[]).includes(row.status)) return null;
          return row;
        },
      ),
    },
  };

  function signMasterAdmin(orgId: string): string {
    return jwt.sign(
      {
        sub: 'ma-1',
        email: 'ma@test.local',
        name: 'MA',
        platformRole: 'MASTER_ADMIN',
        membershipRole: 'MASTER_ADMIN',
        organizationId: orgId,
      },
      jwtSecret,
      { expiresIn: '1h' },
    );
  }

  function signWorker(orgId: string, userId: string): string {
    return jwt.sign(
      {
        sub: userId,
        email: `${userId}@test.local`,
        name: userId,
        platformRole: 'USER',
        membershipRole: 'WORKER',
        organizationId: orgId,
      },
      jwtSecret,
      { expiresIn: '1h' },
    );
  }

  const route = `/api/v1/organizations/${ORG_A}/customers`;

  beforeAll(async () => {
    process.env.JWT_SECRET = jwtSecret;

    const moduleRef = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        OrgScopingGuard,
        RolesGuard,
        ProductLicenseGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: CustomersService, useValue: { findAll: jest.fn().mockResolvedValue([]) } },
        { provide: CustomerDocumentsService, useValue: {} },
        { provide: CustomerTimelineService, useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    process.env.JWT_SECRET = originalSecret;
  });

  beforeEach(() => {
    orgProducts = [];
    jest.clearAllMocks();
  });

  it('allows ACTIVE RENTAL product (MASTER_ADMIN)', async () => {
    orgProducts.push({
      organizationId: ORG_A,
      status: OrgProductStatus.ACTIVE,
      product: { slug: ProductSlug.RENTAL },
    });
    await request(app.getHttpServer())
      .get(route)
      .set('Authorization', `Bearer ${signMasterAdmin(ORG_A)}`)
      .expect(200);
  });

  it.each([
    ['missing product', []],
    ['TRIAL', [{ organizationId: ORG_A, status: OrgProductStatus.TRIAL, product: { slug: ProductSlug.RENTAL } }]],
    [
      'SUSPENDED',
      [{ organizationId: ORG_A, status: OrgProductStatus.SUSPENDED, product: { slug: ProductSlug.RENTAL } }],
    ],
    [
      'CANCELLED',
      [{ organizationId: ORG_A, status: OrgProductStatus.CANCELLED, product: { slug: ProductSlug.RENTAL } }],
    ],
  ])('denies when %s', async (_label, products) => {
    orgProducts = products as ProductRow[];
    const res = await request(app.getHttpServer())
      .get(route)
      .set('Authorization', `Bearer ${signMasterAdmin(ORG_A)}`)
      .expect(403);
    expect(res.body.message).toMatch(/not active/i);
  });

  it('denies cross-organization token against org route', async () => {
    orgProducts.push({
      organizationId: ORG_A,
      status: OrgProductStatus.ACTIVE,
      product: { slug: ProductSlug.RENTAL },
    });
    await request(app.getHttpServer())
      .get(route)
      .set('Authorization', `Bearer ${signWorker(ORG_B, 'worker-b')}`)
      .expect(403);
  });

  it('denies worker in org A without ACTIVE product even with membership', async () => {
    await request(app.getHttpServer())
      .get(route)
      .set('Authorization', `Bearer ${signWorker(ORG_A, 'worker-a')}`)
      .expect(403);
  });
});