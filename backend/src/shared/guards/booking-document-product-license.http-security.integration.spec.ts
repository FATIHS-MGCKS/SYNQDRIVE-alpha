import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { OrgProductStatus, ProductSlug } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AuthGuard } from '@shared/auth/auth.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { ProductLicenseGuard } from './product-license.guard';
import { DocumentsController } from '@modules/documents/documents.controller';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { RentalContractService } from '@modules/documents/rental-contract.service';
import { BookingDocumentGenerationDispatcherService } from '@modules/documents/booking-document-generation/booking-document-generation.dispatcher.service';
import { LegalDocumentDeliveryEvidenceController } from '@modules/documents/legal-document-delivery-evidence.controller';
import { LegalDocumentDeliveryEvidenceService } from '@modules/documents/legal-document-delivery-evidence.service';
import { ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES } from '@modules/products/entitlements/entitlements-policy';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const BOOKING_ID = 'bk-1';

type ProductRow = {
  organizationId: string;
  status: OrgProductStatus;
  product: { slug: ProductSlug };
};

describe('Booking document routes — RENTAL product license HTTP enforcement', () => {
  let documentsApp: INestApplication;
  let evidenceApp: INestApplication;
  const jwtSecret = 'p6-pr4a-booking-doc-license-http-test';
  const originalSecret = process.env.JWT_SECRET;

  let orgProducts: ProductRow[] = [];
  const bundleGetBundleView = jest.fn().mockResolvedValue({ items: [] });
  const evidenceList = jest.fn().mockResolvedValue([]);
  const bundleGenerate = jest.fn();

  const prisma = {
    organization: {
      findUnique: jest.fn(async (args: { where: { id: string } }) =>
        args.where.id === ORG_A || args.where.id === ORG_B ? { id: args.where.id } : null,
      ),
    },
    organizationMembership: {
      findFirst: jest.fn(
        async (args: {
          where: { userId: string; organizationId: string; status?: string };
        }) => {
          if (args.where.status && args.where.status !== 'ACTIVE') return null;
          if (args.where.organizationId === ORG_A && args.where.userId === 'worker-a') {
            return { id: 'mem-1', role: 'WORKER', permissions: {} };
          }
          if (args.where.organizationId === ORG_A && args.where.userId === 'worker-perm-a') {
            return {
              id: 'mem-1p',
              role: 'WORKER',
              permissions: { bookings: { read: true, write: false, manage: false } },
            };
          }
          if (args.where.organizationId === ORG_B && args.where.userId === 'worker-b') {
            return { id: 'mem-2', role: 'WORKER', permissions: { bookings: { read: true } } };
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

  const documentsRoute = `/api/v1/organizations/${ORG_A}/bookings/${BOOKING_ID}/documents`;
  const evidenceRoute = `/api/v1/organizations/${ORG_A}/bookings/${BOOKING_ID}/legal-delivery-evidence`;

  beforeAll(async () => {
    process.env.JWT_SECRET = jwtSecret;

    const documentsModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        OrgScopingGuard,
        PermissionsGuard,
        RolesGuard,
        ProductLicenseGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: BookingDocumentBundleService, useValue: { getBundleView: bundleGetBundleView } },
        { provide: GeneratedDocumentsService, useValue: {} },
        { provide: RentalContractService, useValue: {} },
        { provide: BookingDocumentGenerationDispatcherService, useValue: {} },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    documentsApp = documentsModule.createNestApplication();
    documentsApp.setGlobalPrefix('api/v1');
    await documentsApp.init();

    const evidenceModule = await Test.createTestingModule({
      controllers: [LegalDocumentDeliveryEvidenceController],
      providers: [
        OrgScopingGuard,
        PermissionsGuard,
        RolesGuard,
        ProductLicenseGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: LegalDocumentDeliveryEvidenceService, useValue: { listForBooking: evidenceList } },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    evidenceApp = evidenceModule.createNestApplication();
    evidenceApp.setGlobalPrefix('api/v1');
    await evidenceApp.init();
  });

  afterAll(async () => {
    await documentsApp?.close();
    await evidenceApp?.close();
    process.env.JWT_SECRET = originalSecret;
  });

  beforeEach(() => {
    orgProducts = [];
    jest.clearAllMocks();
    bundleGetBundleView.mockClear();
    evidenceList.mockClear();
    bundleGenerate.mockClear();
  });

  describe.each([
    ['DocumentsController GET bundle', 'documents', documentsRoute, () => documentsApp],
    ['LegalDocumentDeliveryEvidenceController GET list', 'evidence', evidenceRoute, () => evidenceApp],
  ])('%s', (_label, kind, route, appFn) => {
    it('allows ACTIVE RENTAL when otherwise authorized (MASTER_ADMIN)', async () => {
      orgProducts.push({
        organizationId: ORG_A,
        status: OrgProductStatus.ACTIVE,
        product: { slug: ProductSlug.RENTAL },
      });
      await request(appFn().getHttpServer())
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
    ])('denies non-operational product: %s', async (_label, products) => {
      orgProducts = products as ProductRow[];
      const res = await request(appFn().getHttpServer())
        .get(route)
        .set('Authorization', `Bearer ${signMasterAdmin(ORG_A)}`)
        .expect(403);
      expect(res.body.message).toMatch(/not active/i);
      if (kind === 'documents') expect(bundleGetBundleView).not.toHaveBeenCalled();
      if (kind === 'evidence') expect(evidenceList).not.toHaveBeenCalled();
    });

    it('denies cross-organization token', async () => {
      orgProducts.push({
        organizationId: ORG_A,
        status: OrgProductStatus.ACTIVE,
        product: { slug: ProductSlug.RENTAL },
      });
      await request(appFn().getHttpServer())
        .get(route)
        .set('Authorization', `Bearer ${signWorker(ORG_B, 'worker-b')}`)
        .expect(403);
    });

    it('denies worker without bookings.read even with ACTIVE product', async () => {
      orgProducts.push({
        organizationId: ORG_A,
        status: OrgProductStatus.ACTIVE,
        product: { slug: ProductSlug.RENTAL },
      });
      await request(appFn().getHttpServer())
        .get(route)
        .set('Authorization', `Bearer ${signWorker(ORG_A, 'worker-a')}`)
        .expect(403);
    });
  });
});