import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import {
  CoreAppServiceClientStatus,
  CoreAppServiceGrantStatus,
  OrgProductStatus,
  ProductSlug,
} from '@prisma/client';
import { AuthGuard } from '@shared/auth/auth.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { CoreAppM2mRateLimitMemoryRedis } from './testing/core-app-m2m-rate-limit.memory-redis';
import { CoreEntitlementsReadController } from '@modules/products/entitlements/core-entitlements-read.controller';
import { EntitlementsQueryService } from '@modules/products/entitlements/entitlements-query.service';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { CoreAppM2mModule } from './core-app-m2m.module';
import {
  CORE_APP_M2M_JWT_AUDIENCE_DEFAULT,
  CORE_APP_M2M_JWT_ISSUER_DEFAULT,
  CORE_APP_M2M_TOKEN_TYPE,
} from './core-app-m2m-jwt.config';
import { CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE } from './core-app-m2m-auth.constants';
import { CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ } from './core-app-m2m.constants';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const M2M_SECRET = 'http-security-m2m-jwt-secret';
const USER_JWT_SECRET = 'http-security-user-jwt-secret';

async function createHttpSecurityApp(userJwtSecret: string): Promise<{
  app: INestApplication;
  prisma: {
    coreAppServiceClient: { findUnique: jest.Mock };
    organizationProduct: { findFirst: jest.Mock; findMany: jest.Mock };
    organization: { findUnique: jest.Mock };
    organizationMembership: { findFirst: jest.Mock };
  };
}> {
  const prisma = {
    coreAppServiceClient: {
      findUnique: jest.fn(),
    },
    organizationProduct: {
      findFirst: jest.fn(),
      findMany: jest.fn(async () => []),
    },
    organization: {
      findUnique: jest.fn(async () => ({ id: ORG_ID })),
    },
    organizationMembership: {
      findFirst: jest.fn(),
    },
  };

  const hash = await bcrypt.hash('integration-secret', 4);
  prisma.coreAppServiceClient.findUnique.mockResolvedValue({
    clientId: 'integration-client',
    credentialHash: hash,
    credentialVersion: 1,
    productSlug: ProductSlug.VYMOD,
    status: CoreAppServiceClientStatus.ACTIVE,
    allowedScopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
    orgGrants: [
      {
        organizationId: ORG_ID,
        status: CoreAppServiceGrantStatus.ACTIVE,
        grantVersion: 1,
      },
    ],
  });
  prisma.organizationProduct.findFirst.mockResolvedValue({
    status: OrgProductStatus.ACTIVE,
  });

  process.env.JWT_SECRET = userJwtSecret;

    const moduleRef = await Test.createTestingModule({
      imports: [CoreAppM2mModule],
      controllers: [CoreEntitlementsReadController],
      providers: [
        EntitlementsQueryService,
        OrgScopingGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(new CoreAppM2mRateLimitMemoryRedis())
      .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  app.setGlobalPrefix('api/v1');
  await app.init();

  return { app, prisma };
}

describe('Core app M2M token — HTTP security integration', () => {
  let app: INestApplication;
  const envBackup = { ...process.env };

  beforeAll(async () => {
    process.env.CORE_APP_M2M_ENABLED = 'true';
    process.env.CORE_APP_M2M_JWT_SECRET = M2M_SECRET;
    ({ app } = await createHttpSecurityApp(USER_JWT_SECRET));
  });

  afterAll(async () => {
    await app?.close();
    process.env = { ...envBackup };
  });

  const entitlementsRoute = `/api/v1/core/entitlements/v1/organizations/${ORG_ID}`;

  it('token endpoint is reachable without user JWT when runtime configured', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/core-app/token')
      .send({
        clientId: 'integration-client',
        clientSecret: 'integration-secret',
        organizationId: ORG_ID,
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      });

    expect(res.status).toBe(200);
    expect(res.body.contractVersion).toBe('core.app.token.v1');
    expect(res.body.accessToken).toBeDefined();
  });

  it('fail-closes token endpoint when runtime disabled', async () => {
    process.env.CORE_APP_M2M_ENABLED = 'false';
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/core-app/token')
      .send({
        clientId: 'integration-client',
        clientSecret: 'integration-secret',
        organizationId: ORG_ID,
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      });
    process.env.CORE_APP_M2M_ENABLED = 'true';
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE);
  });

  it('user JWT-protected rental/core route rejects service JWT when secrets differ', async () => {
    const serviceJwt = jwt.sign(
      {
        sub: 'integration-client',
        token_type: CORE_APP_M2M_TOKEN_TYPE,
        organizationId: ORG_ID,
        productSlug: ProductSlug.VYMOD,
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
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
      .get(entitlementsRoute)
      .set('Authorization', `Bearer ${serviceJwt}`)
      .expect(401);
  });

  it('token exchange fail-closes when M2M signing secret equals JWT_SECRET', async () => {
    const sharedSecret = 'shared-secret-denied-for-issuance';
    process.env.JWT_SECRET = sharedSecret;
    process.env.CORE_APP_M2M_JWT_SECRET = sharedSecret;

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/core-app/token')
      .send({
        clientId: 'integration-client',
        clientSecret: 'integration-secret',
        organizationId: ORG_ID,
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe(CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE);

    process.env.JWT_SECRET = USER_JWT_SECRET;
    process.env.CORE_APP_M2M_JWT_SECRET = M2M_SECRET;
  });

  it('token exchange fail-closes when M2M signing secret missing', async () => {
    delete process.env.CORE_APP_M2M_JWT_SECRET;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/core-app/token')
      .send({
        clientId: 'integration-client',
        clientSecret: 'integration-secret',
        organizationId: ORG_ID,
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      });
    process.env.CORE_APP_M2M_JWT_SECRET = M2M_SECRET;
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE);
  });

  it('accepts valid user JWT on entitlements route', async () => {
    const userJwt = jwt.sign(
      {
        sub: 'user-integration-1',
        email: 'admin@test.local',
        platformRole: 'MASTER_ADMIN',
        organizationId: ORG_ID,
      },
      USER_JWT_SECRET,
      { expiresIn: 300 },
    );

    const res = await request(app.getHttpServer())
      .get(entitlementsRoute)
      .set('Authorization', `Bearer ${userJwt}`);

    expect(res.status).toBe(200);
  });
});

describe('AuthGuard — identical signing secret (constructor-captured)', () => {
  const SHARED_JWT_SECRET = 'identical-secret-captured-at-guard-construct';
  const entitlementsRoute = `/api/v1/core/entitlements/v1/organizations/${ORG_ID}`;
  let identicalSecretApp: INestApplication;
  const envBackup = { ...process.env };

  beforeAll(async () => {
    process.env.CORE_APP_M2M_ENABLED = 'true';
    process.env.CORE_APP_M2M_JWT_SECRET = SHARED_JWT_SECRET;
    ({ app: identicalSecretApp } = await createHttpSecurityApp(SHARED_JWT_SECRET));
  });

  afterAll(async () => {
    await identicalSecretApp?.close();
    process.env = { ...envBackup };
  });

  it('service JWT verifies with the same secret AuthGuard captured at construction', () => {
    const serviceJwt = jwt.sign(
      {
        sub: 'integration-client',
        token_type: CORE_APP_M2M_TOKEN_TYPE,
        organizationId: ORG_ID,
        productSlug: ProductSlug.VYMOD,
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
        credentialVersion: 1,
        grantVersion: 1,
      },
      SHARED_JWT_SECRET,
      {
        issuer: CORE_APP_M2M_JWT_ISSUER_DEFAULT,
        audience: CORE_APP_M2M_JWT_AUDIENCE_DEFAULT,
        expiresIn: 300,
      },
    );

    const verified = jwt.verify(serviceJwt, SHARED_JWT_SECRET) as jwt.JwtPayload;
    expect(verified.token_type).toBe(CORE_APP_M2M_TOKEN_TYPE);
    expect(verified.sub).toBe('integration-client');
  });

  it('returns HTTP 401 on user route because token_type=core_app_service', async () => {
    const serviceJwt = jwt.sign(
      {
        sub: 'integration-client',
        token_type: CORE_APP_M2M_TOKEN_TYPE,
        organizationId: ORG_ID,
        productSlug: ProductSlug.VYMOD,
        scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
        credentialVersion: 1,
        grantVersion: 1,
      },
      SHARED_JWT_SECRET,
      { expiresIn: 300 },
    );

    await request(identicalSecretApp.getHttpServer())
      .get(entitlementsRoute)
      .set('Authorization', `Bearer ${serviceJwt}`)
      .expect(401);
  });

  it('accepts valid user JWT signed with the same constructor-captured secret', async () => {
    const userJwt = jwt.sign(
      {
        sub: 'user-identical-secret-1',
        email: 'admin@test.local',
        platformRole: 'MASTER_ADMIN',
        organizationId: ORG_ID,
      },
      SHARED_JWT_SECRET,
      { expiresIn: 300 },
    );

    const res = await request(identicalSecretApp.getHttpServer())
      .get(entitlementsRoute)
      .set('Authorization', `Bearer ${userJwt}`);

    expect(res.status).toBe(200);
  });
});