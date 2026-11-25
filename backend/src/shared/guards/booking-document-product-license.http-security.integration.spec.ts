import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { OrganizationStatus, OrgProductStatus, ProductSlug } from '@prisma/client';
import * as request from 'supertest';
import { AuthGuard } from '@shared/auth/auth.guard';
import {
  attachHttpSecurityAuthorityPrismaMocks,
  signHttpSecurityAccessToken,
} from '@shared/auth/testing/http-security-jwt.util';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
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
  const enqueueInitialBundle = jest.fn().mockResolvedValue({ enqueued: true, id: 'job-1' });
  const getById = jest.fn().mockResolvedValue({ id: 'doc-1', documentType: 'RENTAL_CONTRACT' });
  const toDto = jest.fn().mockReturnValue({ id: 'doc-1' });
  const voidDocument = jest.fn().mockResolvedValue({ id: 'doc-1' });
  const recordPresentation = jest.fn().mockResolvedValue({ id: 'ev-1' });

  const DOC_ID = '550e8400-e29b-41d4-a716-446655440001';
  const platformPermissions = {
    resolveJwtPermissions: jest.fn().mockResolvedValue([]),
  };

  const presentationBody = {
    customerId: '550e8400-e29b-41d4-a716-446655440010',
    legalDocumentId: '550e8400-e29b-41d4-a716-446655440011',
    generatedDocumentId: '550e8400-e29b-41d4-a716-446655440012',
    deliveryChannel: 'EMAIL',
    recipientSnapshot: { customerId: '550e8400-e29b-41d4-a716-446655440010' },
  };

  const prisma = {
    organization: {
      findUnique: jest.fn(async (args: { where: { id: string } }) =>
        args.where.id === ORG_A || args.where.id === ORG_B
          ? { id: args.where.id, status: OrganizationStatus.ACTIVE }
          : null,
      ),
    },
    organizationMembership: {
      findFirst: jest.fn(
        async (args: {
          where: { userId: string; organizationId: string; status?: string };
        }) => {
          if (args.where.status && args.where.status !== 'ACTIVE') return null;
          if (args.where.organizationId === ORG_A && args.where.userId === 'worker-a') {
            return {
              id: 'mem-1',
              role: 'WORKER',
              permissions: {},
              organization: { status: OrganizationStatus.ACTIVE },
            };
          }
          if (args.where.organizationId === ORG_A && args.where.userId === 'worker-perm-a') {
            return {
              id: 'mem-1p',
              role: 'WORKER',
              permissions: { bookings: { read: true, write: false, manage: false } },
              organization: { status: OrganizationStatus.ACTIVE },
            };
          }
          if (args.where.organizationId === ORG_B && args.where.userId === 'worker-b') {
            return {
              id: 'mem-2',
              role: 'WORKER',
              permissions: { bookings: { read: true } },
              organization: { status: OrganizationStatus.ACTIVE },
            };
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

  attachHttpSecurityAuthorityPrismaMocks(prisma as never);

  function signMasterAdmin(orgId: string): string {
    const id = 'ma-1';
    (prisma as { registerHttpSecurityUser?: (uid: string, row?: object) => void }).registerHttpSecurityUser?.(
      id,
      { platformRole: 'MASTER_ADMIN' },
    );
    return signHttpSecurityAccessToken(jwtSecret, {
      id,
      email: 'ma@test.local',
      name: 'MA',
      platformRole: 'MASTER_ADMIN',
      membershipRole: 'MASTER_ADMIN',
      organizationId: orgId,
    });
  }

  function signWorker(orgId: string, userId: string): string {
    (prisma as { registerHttpSecurityUser?: (uid: string, row?: object) => void }).registerHttpSecurityUser?.(
      userId,
      { platformRole: 'USER' },
    );
    return signHttpSecurityAccessToken(jwtSecret, {
      id: userId,
      email: `${userId}@test.local`,
      name: userId,
      platformRole: 'USER',
      membershipRole: 'WORKER',
      organizationId: orgId,
    });
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
        {
          provide: GeneratedDocumentsService,
          useValue: { getById, toDto, voidDocument },
        },
        { provide: RentalContractService, useValue: {} },
        {
          provide: BookingDocumentGenerationDispatcherService,
          useValue: { enqueueInitialBundle },
        },
        UserAccessAuthorityService,
        { provide: PlatformPermissionService, useValue: platformPermissions },
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
        {
          provide: LegalDocumentDeliveryEvidenceService,
          useValue: { listForBooking: evidenceList, recordPresentation },
        },
        UserAccessAuthorityService,
        { provide: PlatformPermissionService, useValue: platformPermissions },
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
    enqueueInitialBundle.mockClear();
    getById.mockClear();
    voidDocument.mockClear();
    recordPresentation.mockClear();
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

  describe('Mutations — product license and no side effects on deny', () => {
    const generateRoute = `/api/v1/organizations/${ORG_A}/bookings/${BOOKING_ID}/documents/generate-initial-bundle`;
    const metadataRoute = `/api/v1/organizations/${ORG_A}/documents/${DOC_ID}/metadata`;
    const voidRoute = `/api/v1/organizations/${ORG_A}/documents/${DOC_ID}/void`;
    const presentationRoute = `/api/v1/organizations/${ORG_A}/bookings/${BOOKING_ID}/legal-delivery-evidence`;

    it('Documents POST generate-initial-bundle allows ACTIVE RENTAL', async () => {
      orgProducts.push({
        organizationId: ORG_A,
        status: OrgProductStatus.ACTIVE,
        product: { slug: ProductSlug.RENTAL },
      });
      await request(documentsApp.getHttpServer())
        .post(generateRoute)
        .set('Authorization', `Bearer ${signMasterAdmin(ORG_A)}`)
        .expect(201);
      expect(enqueueInitialBundle).toHaveBeenCalled();
    });

    it('Documents POST generate-initial-bundle denies TRIAL without enqueue', async () => {
      orgProducts.push({
        organizationId: ORG_A,
        status: OrgProductStatus.TRIAL,
        product: { slug: ProductSlug.RENTAL },
      });
      await request(documentsApp.getHttpServer())
        .post(generateRoute)
        .set('Authorization', `Bearer ${signMasterAdmin(ORG_A)}`)
        .expect(403);
      expect(enqueueInitialBundle).not.toHaveBeenCalled();
    });

    it('Documents GET metadata denies TRIAL without getById', async () => {
      orgProducts.push({
        organizationId: ORG_A,
        status: OrgProductStatus.TRIAL,
        product: { slug: ProductSlug.RENTAL },
      });
      await request(documentsApp.getHttpServer())
        .get(metadataRoute)
        .set('Authorization', `Bearer ${signMasterAdmin(ORG_A)}`)
        .expect(403);
      expect(getById).not.toHaveBeenCalled();
    });

    it('Documents POST void allows ACTIVE RENTAL', async () => {
      orgProducts.push({
        organizationId: ORG_A,
        status: OrgProductStatus.ACTIVE,
        product: { slug: ProductSlug.RENTAL },
      });
      await request(documentsApp.getHttpServer())
        .post(voidRoute)
        .set('Authorization', `Bearer ${signMasterAdmin(ORG_A)}`)
        .send({})
        .expect(201);
      expect(voidDocument).toHaveBeenCalled();
    });

    it('Documents POST void denies TRIAL without voidDocument', async () => {
      orgProducts.push({
        organizationId: ORG_A,
        status: OrgProductStatus.TRIAL,
        product: { slug: ProductSlug.RENTAL },
      });
      await request(documentsApp.getHttpServer())
        .post(voidRoute)
        .set('Authorization', `Bearer ${signMasterAdmin(ORG_A)}`)
        .send({})
        .expect(403);
      expect(voidDocument).not.toHaveBeenCalled();
    });

    it('Legal delivery POST denies TRIAL without recordPresentation', async () => {
      orgProducts.push({
        organizationId: ORG_A,
        status: OrgProductStatus.TRIAL,
        product: { slug: ProductSlug.RENTAL },
      });
      await request(evidenceApp.getHttpServer())
        .post(presentationRoute)
        .set('Authorization', `Bearer ${signMasterAdmin(ORG_A)}`)
        .send(presentationBody)
        .expect(403);
      expect(recordPresentation).not.toHaveBeenCalled();
    });

    it('Legal delivery POST allows ACTIVE RENTAL', async () => {
      orgProducts.push({
        organizationId: ORG_A,
        status: OrgProductStatus.ACTIVE,
        product: { slug: ProductSlug.RENTAL },
      });
      await request(evidenceApp.getHttpServer())
        .post(presentationRoute)
        .set('Authorization', `Bearer ${signMasterAdmin(ORG_A)}`)
        .send(presentationBody)
        .expect(201);
      expect(recordPresentation).toHaveBeenCalled();
    });
  });
});