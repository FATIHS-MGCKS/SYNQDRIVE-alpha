/**
 * P11 — minimum Core external app contract certification (disposable Postgres).
 *
 * Run:
 *   CORE_EXTERNAL_INTERFACE_POSTGRES_INTEGRATION=1 \
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/synqdrive_product_catalog_p2_pr1 \
 *   npm test -- --runInBand core-external-interface-contract.http.postgres
 *
 * Negative matrix (disabled client, scope escalation, stale JWT, etc.) remains covered by
 * `core-read-vehicles.http-security.integration.spec.ts` and `core-app-m2m-token.http-security.integration.spec.ts` (in-memory Prisma).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import {
  CoreAppServiceClientStatus,
  CoreAppServiceGrantStatus,
  OrgProductPlan,
  OrgProductStatus,
  OrganizationProductVehicleAccessMode,
  PrismaClient,
  ProductSlug,
  VehicleRegistryLifecycle,
  VehicleStatus,
} from '@prisma/client';
import { AuthGuard } from '@shared/auth/auth.guard';
import { authGuardHttpSecurityProviders } from '@shared/auth/testing/http-security-jwt.util';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { CORE_APP_M2M_SCOPE_VEHICLE_READ } from './core-app-m2m.constants';
import { CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE } from './core-app-m2m-auth.constants';
import { assertCoreAppM2mDisposablePostgresPreflight } from './testing/core-app-m2m-disposable-postgres-preflight';
import { createCoreAppM2mIntegrationModule } from './testing/core-app-m2m-module.testing';
import { CoreAppM2mRateLimitMemoryRedis } from './testing/core-app-m2m-rate-limit.memory-redis';

const OPT_IN = 'CORE_EXTERNAL_INTERFACE_POSTGRES_INTEGRATION';
const LIVE = process.env[OPT_IN] === '1';
const CLIENT_SECRET = 'p11-disposable-client-secret-only';
const M2M_SECRET = 'p11-disposable-m2m-jwt-secret';
const USER_JWT_SECRET = 'p11-disposable-user-jwt-secret';

(LIVE ? describe : describe.skip)('P11 Core external interface contract — HTTP postgres', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const envBackup = { ...process.env };
  const platformPermissions = {
    resolveJwtPermissions: jest.fn().mockResolvedValue([]),
  };

  const runId = Date.now();
  let orgId: string;
  let otherOrgId: string;
  let vehicleId: string;
  let clientDbId: string;
  let clientId: string;
  let clientSecretHash: string;

  beforeAll(async () => {
    assertCoreAppM2mDisposablePostgresPreflight(OPT_IN);

    process.env.CORE_APP_M2M_ENABLED = 'true';
    process.env.CORE_APP_M2M_JWT_SECRET = M2M_SECRET;
    process.env.JWT_SECRET = USER_JWT_SECRET;

    clientId = `p11-vymod-${runId}`;
    clientSecretHash = await bcrypt.hash(CLIENT_SECRET, 4);

    const product = await prisma.product.upsert({
      where: { slug: ProductSlug.VYMOD },
      create: { slug: ProductSlug.VYMOD, name: 'VYMOD' },
      update: {},
    });

    const org = await prisma.organization.create({
      data: { companyName: `P11 cert ${runId}`, businessType: 'FLEET' },
    });
    orgId = org.id;

    const otherOrg = await prisma.organization.create({
      data: { companyName: `P11 other ${runId}`, businessType: 'FLEET' },
    });
    otherOrgId = otherOrg.id;

    await prisma.organizationProduct.create({
      data: {
        organizationId: orgId,
        productId: product.id,
        status: OrgProductStatus.ACTIVE,
        plan: OrgProductPlan.STARTER,
        vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      },
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        vin: `P11VIN${runId}`,
        make: 'Test',
        model: 'VYMOD',
        year: 2026,
        fuelType: 'ELECTRIC',
        licensePlate: `P11-${runId}`,
        status: VehicleStatus.AVAILABLE,
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      },
    });
    vehicleId = vehicle.id;

    const client = await prisma.coreAppServiceClient.create({
      data: {
        clientId,
        displayName: 'P11 VYMOD disposable',
        productSlug: ProductSlug.VYMOD,
        credentialHash: clientSecretHash,
        status: CoreAppServiceClientStatus.ACTIVE,
        allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
      },
    });
    clientDbId = client.id;

    await prisma.coreAppServiceOrgGrant.create({
      data: {
        serviceClientId: clientDbId,
        organizationId: orgId,
        status: CoreAppServiceGrantStatus.ACTIVE,
      },
    });

    const moduleRef = await createCoreAppM2mIntegrationModule(
      (builder) =>
        builder
          .overrideProvider(PrismaService)
          .useValue(prisma)
          .overrideProvider(RedisService)
          .useValue(new CoreAppM2mRateLimitMemoryRedis()),
      {
        providers: [
          ...authGuardHttpSecurityProviders(prisma, platformPermissions),
          { provide: APP_GUARD, useClass: AuthGuard },
        ],
      },
    ).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    process.env = { ...envBackup };

    await prisma.vehicleProductGrant.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.vehicle.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.coreAppServiceOrgGrant.deleteMany({
      where: { organizationId: { in: [orgId, otherOrgId] } },
    });
    await prisma.coreAppServiceClient.deleteMany({ where: { id: clientDbId } });
    await prisma.organizationProduct.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
    await prisma.$disconnect();
  });

  async function exchangeToken(organizationId: string = orgId) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/core-app/token')
      .send({
        clientId,
        clientSecret: CLIENT_SECRET,
        organizationId,
        scopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
      });
  }

  it('positive: service client + org grant + ACTIVE org product + ORGANIZATION_WIDE vehicle access → token → vehicle read (real HTTP + Postgres)', async () => {
    const tokenRes = await exchangeToken();
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.accessToken).toBeDefined();

    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/core/read/v1/organizations/${orgId}/vehicles?page=1&pageSize=10`)
      .set('Authorization', `Bearer ${tokenRes.body.accessToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.contractVersion).toBe('core.read.vehicles.v1');
    expect(listRes.body.productSlug).toBe(ProductSlug.VYMOD);
    expect(listRes.body.total).toBeGreaterThanOrEqual(1);
    expect(listRes.body.items.some((v: { vehicleId: string }) => v.vehicleId === vehicleId)).toBe(
      true,
    );

    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/core/read/v1/organizations/${orgId}/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${tokenRes.body.accessToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.vehicle.vehicleId).toBe(vehicleId);
  });

  it('negative postgres: revoked org grant fails token exchange (real persistence)', async () => {
    await prisma.coreAppServiceOrgGrant.updateMany({
      where: { serviceClientId: clientDbId, organizationId: orgId },
      data: { status: CoreAppServiceGrantStatus.REVOKED },
    });

    const tokenRes = await exchangeToken();
    expect(tokenRes.status).toBe(401);
    expect(tokenRes.body.message).toBe(CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE);

    await prisma.coreAppServiceOrgGrant.updateMany({
      where: { serviceClientId: clientDbId, organizationId: orgId },
      data: { status: CoreAppServiceGrantStatus.ACTIVE },
    });
  });

  it('negative postgres: foreign organization denied at token exchange', async () => {
    const tokenRes = await exchangeToken(otherOrgId);
    expect(tokenRes.status).toBe(401);
    expect(tokenRes.body.message).toBe(CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE);
  });
});