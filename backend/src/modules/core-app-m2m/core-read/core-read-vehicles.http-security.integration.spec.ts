import { INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import {
  CoreAppServiceClientStatus,
  CoreAppServiceGrantStatus,
  OrgProductPlan,
  OrgProductStatus,
  OrganizationProductVehicleAccessMode,
  ProductSlug,
  VehicleRegistryLifecycle,
  VehicleStatus,
} from '@prisma/client';
import { AuthGuard } from '@shared/auth/auth.guard';
import { RedisService } from '@shared/redis/redis.service';
import { CoreEntitlementsReadController } from '@modules/products/entitlements/core-entitlements-read.controller';
import { EntitlementsQueryService } from '@modules/products/entitlements/entitlements-query.service';
import { PrismaService } from '@shared/database/prisma.service';
import { createCoreAppM2mIntegrationModule } from '../testing/core-app-m2m-module.testing';
import {
  CORE_APP_M2M_JWT_AUDIENCE_DEFAULT,
  CORE_APP_M2M_JWT_ISSUER_DEFAULT,
  CORE_APP_M2M_TOKEN_TYPE,
} from '../core-app-m2m-jwt.config';
import { CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE } from '../core-app-m2m-auth.constants';
import { CORE_APP_M2M_SCOPE_VEHICLE_READ } from '../core-app-m2m.constants';
import { CoreAppM2mRateLimitMemoryRedis } from '../testing/core-app-m2m-rate-limit.memory-redis';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLIENT_ID = 'fleet-read-client';
const CLIENT_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VEHICLE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const M2M_SECRET = 'core-read-http-m2m-secret';
const USER_JWT_SECRET = 'core-read-http-user-jwt-secret';

describe('Core read vehicles — HTTP security integration', () => {
  let app: INestApplication;
  const envBackup = { ...process.env };

  const store: {
    clientStatus: CoreAppServiceClientStatus;
    grantStatus: CoreAppServiceGrantStatus;
    orgProductStatus: OrgProductStatus;
    vehicleAccessMode: OrganizationProductVehicleAccessMode;
    credentialVersion: number;
    grantVersion: number;
    vehicleOrgId: string;
    grantedVehicleIds: Set<string>;
    allowedScopes: string[];
  } = {
    clientStatus: CoreAppServiceClientStatus.ACTIVE,
    grantStatus: CoreAppServiceGrantStatus.ACTIVE,
    orgProductStatus: OrgProductStatus.ACTIVE,
    vehicleAccessMode: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    credentialVersion: 1,
    grantVersion: 1,
    vehicleOrgId: ORG_ID,
    grantedVehicleIds: new Set<string>([VEHICLE_ID]),
    allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
  };

  const ORG_PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

  const prisma = {
    coreAppServiceClient: { findUnique: jest.fn() },
    coreAppServiceOrgGrant: { findFirst: jest.fn() },
    organizationProduct: { findFirst: jest.fn(), findMany: jest.fn() },
    vehicle: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    organization: { findUnique: jest.fn(async () => ({ id: ORG_ID })) },
    organizationMembership: { findFirst: jest.fn() },
  };

  function activeOrgProductRow() {
    return {
      id: ORG_PRODUCT_ID,
      organizationId: ORG_ID,
      productId: 'product-fleet',
      status: store.orgProductStatus,
      plan: OrgProductPlan.BUSINESS,
      activatedAt: new Date('2024-01-01T00:00:00.000Z'),
      expiresAt: null,
      vehicleAccessMode: store.vehicleAccessMode,
      product: {
        id: 'product-fleet',
        slug: ProductSlug.FLEET,
        name: 'Fleet',
      },
    };
  }

  function mintServiceJwt(overrides: Record<string, unknown> = {}) {
    return jwt.sign(
      {
        sub: CLIENT_ID,
        token_type: CORE_APP_M2M_TOKEN_TYPE,
        organizationId: ORG_ID,
        productSlug: ProductSlug.FLEET,
        scopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
        credentialVersion: store.credentialVersion,
        grantVersion: store.grantVersion,
        ...overrides,
      },
      M2M_SECRET,
      {
        issuer: CORE_APP_M2M_JWT_ISSUER_DEFAULT,
        audience: CORE_APP_M2M_JWT_AUDIENCE_DEFAULT,
        expiresIn: 300,
      },
    );
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = USER_JWT_SECRET;
    process.env.CORE_APP_M2M_ENABLED = 'true';
    process.env.CORE_APP_M2M_JWT_SECRET = M2M_SECRET;
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_CLIENT = '1000';
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_IP = '1000';

    prisma.coreAppServiceClient.findUnique.mockImplementation(async () => ({
      id: CLIENT_UUID,
      clientId: CLIENT_ID,
      credentialVersion: store.credentialVersion,
      productSlug: ProductSlug.FLEET,
      status: store.clientStatus,
      allowedScopes: store.allowedScopes,
      orgGrants: [
        {
          organizationId: ORG_ID,
          status: store.grantStatus,
          grantVersion: store.grantVersion,
        },
      ],
    }));

    prisma.coreAppServiceOrgGrant.findFirst.mockImplementation(async () =>
      store.grantStatus === CoreAppServiceGrantStatus.ACTIVE
        ? { grantVersion: store.grantVersion }
        : null,
    );

    prisma.organizationProduct.findFirst.mockImplementation(async () => activeOrgProductRow());

    prisma.organizationProduct.findMany.mockImplementation(async () => [activeOrgProductRow()]);

    prisma.vehicle.count.mockImplementation(async ({ where }: { where: { organizationId?: string } }) =>
      where.organizationId === ORG_ID ? 1 : 0,
    );

    prisma.vehicle.findMany.mockImplementation(async () => [
      {
        id: VEHICLE_ID,
        organizationId: ORG_ID,
        make: 'VW',
        model: 'ID.4',
        year: 2024,
        vehicleName: 'Fleet 1',
        licensePlate: 'M-FL 1',
        status: VehicleStatus.AVAILABLE,
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      },
    ]);

    prisma.vehicle.findFirst.mockImplementation(
      async ({ where }: { where: { id?: string; organizationId?: string; vehicleProductGrants?: unknown } }) => {
        if (where.organizationId !== ORG_ID) return null;
        const vehicleId = where.id;
        if (store.vehicleAccessMode === OrganizationProductVehicleAccessMode.SELECTED_VEHICLES) {
          if (!vehicleId || !store.grantedVehicleIds.has(vehicleId)) {
            return null;
          }
        } else if (vehicleId && vehicleId !== VEHICLE_ID) {
          return null;
        }
        const resolvedId = vehicleId ?? VEHICLE_ID;
        return {
          id: resolvedId,
          organizationId: store.vehicleOrgId,
          make: 'VW',
          model: 'ID.4',
          year: 2024,
          vehicleName: 'Fleet 1',
          licensePlate: 'M-FL 1',
          status: VehicleStatus.AVAILABLE,
          registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
          fuelType: 'ELECTRIC',
          mileageKm: 100,
          vin: 'WVWZZZ1JZXW000099',
        };
      },
    );

    const moduleRef = await createCoreAppM2mIntegrationModule(
      (builder) =>
        builder
          .overrideProvider(PrismaService)
          .useValue(prisma)
          .overrideProvider(RedisService)
          .useValue(new CoreAppM2mRateLimitMemoryRedis()),
      {
        controllers: [CoreEntitlementsReadController],
        providers: [
          EntitlementsQueryService,
          Reflector,
          { provide: APP_GUARD, useClass: AuthGuard },
        ],
      },
    ).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    process.env = { ...envBackup };
  });

  const listRoute = `/api/v1/core/read/v1/organizations/${ORG_ID}/vehicles`;
  const detailRoute = `/api/v1/core/read/v1/organizations/${ORG_ID}/vehicles/${VEHICLE_ID}`;
  const entitlementsRoute = `/api/v1/core/entitlements/v1/organizations/${ORG_ID}`;

  it('allows authorized service JWT to list vehicles', async () => {
    const res = await request(app.getHttpServer())
      .get(`${listRoute}?page=1&pageSize=10`)
      .set('Authorization', `Bearer ${mintServiceJwt()}`);
    expect(res.status).toBe(200);
    expect(res.body.contractVersion).toBe('core.read.vehicles.v1');
    expect(res.body.items).toHaveLength(1);
  });

  it('rejects anonymous and invalid service JWT', async () => {
    await request(app.getHttpServer()).get(listRoute).expect(401);
    const expired = jwt.sign(
      {
        sub: CLIENT_ID,
        token_type: CORE_APP_M2M_TOKEN_TYPE,
        organizationId: ORG_ID,
        productSlug: ProductSlug.FLEET,
        scopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
        credentialVersion: 1,
        grantVersion: 1,
      },
      M2M_SECRET,
      { expiresIn: -10, issuer: CORE_APP_M2M_JWT_ISSUER_DEFAULT, audience: CORE_APP_M2M_JWT_AUDIENCE_DEFAULT },
    );
    const bad = await request(app.getHttpServer())
      .get(listRoute)
      .set('Authorization', `Bearer ${expired}`);
    expect(bad.status).toBe(401);
    expect(bad.body.message).toBe(CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE);
  });

  it('rejects foreign organization in token vs route', async () => {
    const token = mintServiceJwt({ organizationId: OTHER_ORG });
    const res = await request(app.getHttpServer())
      .get(listRoute)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects service JWT on user entitlements route', async () => {
    await request(app.getHttpServer())
      .get(entitlementsRoute)
      .set('Authorization', `Bearer ${mintServiceJwt()}`)
      .expect(401);
  });

  it('rejects inactive client, revoked grant, and stale grant version', async () => {
    store.clientStatus = CoreAppServiceClientStatus.DISABLED;
    await request(app.getHttpServer())
      .get(listRoute)
      .set('Authorization', `Bearer ${mintServiceJwt()}`)
      .expect(401);
    store.clientStatus = CoreAppServiceClientStatus.ACTIVE;

    store.grantStatus = CoreAppServiceGrantStatus.REVOKED;
    await request(app.getHttpServer())
      .get(listRoute)
      .set('Authorization', `Bearer ${mintServiceJwt()}`)
      .expect(401);
    store.grantStatus = CoreAppServiceGrantStatus.ACTIVE;

    store.grantVersion = 9;
    await request(app.getHttpServer())
      .get(listRoute)
      .set('Authorization', `Bearer ${mintServiceJwt({ grantVersion: 1 })}`)
      .expect(401);
    store.grantVersion = 1;
  });

  it('enforces SELECTED_VEHICLES isolation for unknown vehicle', async () => {
    store.vehicleAccessMode = OrganizationProductVehicleAccessMode.SELECTED_VEHICLES;
    store.grantedVehicleIds = new Set([VEHICLE_ID]);
    const otherVehicle = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await request(app.getHttpServer())
      .get(`/api/v1/core/read/v1/organizations/${ORG_ID}/vehicles/${otherVehicle}`)
      .set('Authorization', `Bearer ${mintServiceJwt()}`)
      .expect(404);
    store.vehicleAccessMode = OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE;
  });

  it('accepts valid user JWT on entitlements while blocking service JWT', async () => {
    const userJwt = jwt.sign(
      {
        sub: 'admin',
        platformRole: 'MASTER_ADMIN',
        organizationId: ORG_ID,
      },
      USER_JWT_SECRET,
      { expiresIn: 300 },
    );
    await request(app.getHttpServer())
      .get(entitlementsRoute)
      .set('Authorization', `Bearer ${userJwt}`)
      .expect(200);
  });

  it('rejects wrong token type and missing vehicle read scope', async () => {
    const wrongType = jwt.sign(
      {
        sub: CLIENT_ID,
        token_type: 'user',
        organizationId: ORG_ID,
        productSlug: ProductSlug.FLEET,
        scopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
        credentialVersion: 1,
        grantVersion: 1,
      },
      M2M_SECRET,
      {
        issuer: CORE_APP_M2M_JWT_ISSUER_DEFAULT,
        audience: CORE_APP_M2M_JWT_AUDIENCE_DEFAULT,
        expiresIn: 300,
      },
    );
    await request(app.getHttpServer())
      .get(listRoute)
      .set('Authorization', `Bearer ${wrongType}`)
      .expect(401);

    const missingScope = mintServiceJwt({ scopes: [] });
    await request(app.getHttpServer())
      .get(listRoute)
      .set('Authorization', `Bearer ${missingScope}`)
      .expect(401);
  });

  it('rejects inactive product entitlement at resource authorization', async () => {
    store.orgProductStatus = OrgProductStatus.TRIAL;
    await request(app.getHttpServer())
      .get(listRoute)
      .set('Authorization', `Bearer ${mintServiceJwt()}`)
      .expect(401);
    store.orgProductStatus = OrgProductStatus.ACTIVE;
  });

  it('accepts pageSize at maximum 100', async () => {
    const res = await request(app.getHttpServer())
      .get(`${listRoute}?page=1&pageSize=100`)
      .set('Authorization', `Bearer ${mintServiceJwt()}`);
    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(100);
  });

  it('denies cross-tenant vehicle id even when route org matches token', async () => {
    store.vehicleOrgId = OTHER_ORG;
    await request(app.getHttpServer())
      .get(detailRoute)
      .set('Authorization', `Bearer ${mintServiceJwt()}`)
      .expect(404);
    store.vehicleOrgId = ORG_ID;
  });

  it('rejects pagination query values with HTTP 400', async () => {
    await request(app.getHttpServer())
      .get(`${listRoute}?page=-1&pageSize=10`)
      .set('Authorization', `Bearer ${mintServiceJwt()}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${listRoute}?page=1&pageSize=500`)
      .set('Authorization', `Bearer ${mintServiceJwt()}`)
      .expect(400);
  });

  it('rejects vehicle read when stored allowedScopes no longer include JWT scope', async () => {
    const token = mintServiceJwt();
    store.allowedScopes = [];
    await request(app.getHttpServer())
      .get(listRoute)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    store.allowedScopes = [CORE_APP_M2M_SCOPE_VEHICLE_READ];
  });
});