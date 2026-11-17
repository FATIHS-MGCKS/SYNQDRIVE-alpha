import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
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
import { CoreAppM2mModule } from './core-app-m2m.module';
import { CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE } from './core-app-m2m-auth.constants';
import { CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ } from './core-app-m2m.constants';
import { CoreAppM2mRateLimitMemoryRedis } from './testing/core-app-m2m-rate-limit.memory-redis';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Core app M2M token — rate limit HTTP integration', () => {
  let app: INestApplication;
  const envBackup = { ...process.env };
  const memoryRedis = new CoreAppM2mRateLimitMemoryRedis();

  const prisma = {
    coreAppServiceClient: { findUnique: jest.fn() },
    organizationProduct: { findFirst: jest.fn() },
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'rate-limit-http-user-jwt';
    process.env.CORE_APP_M2M_ENABLED = 'true';
    process.env.CORE_APP_M2M_JWT_SECRET = 'rate-limit-http-m2m-jwt';
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_IP = '100';
    process.env.CORE_APP_M2M_RATE_LIMIT_MAX_PER_CLIENT = '2';

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

    const moduleRef = await Test.createTestingModule({
      imports: [CoreAppM2mModule],
      providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(memoryRedis)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    process.env = { ...envBackup };
  });

  const tokenBody = {
    clientId: 'integration-client',
    clientSecret: 'integration-secret',
    organizationId: ORG_ID,
    scopes: [CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
  };

  it('returns 429 with Retry-After when client rate limit exceeded', async () => {
    memoryRedis.clear();
    const server = app.getHttpServer();
    await request(server).post('/api/v1/auth/core-app/token').send(tokenBody).expect(200);
    await request(server).post('/api/v1/auth/core-app/token').send(tokenBody).expect(200);

    const limited = await request(server).post('/api/v1/auth/core-app/token').send(tokenBody);
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(Number.parseInt(String(limited.headers['retry-after']), 10)).toBeGreaterThan(0);
  });

  it('fail-closes token exchange when Redis cannot enforce policy', async () => {
    const isolatedPrisma = {
      coreAppServiceClient: { findUnique: jest.fn() },
      organizationProduct: { findFirst: jest.fn() },
    };
    const brokenModule = await Test.createTestingModule({
      imports: [CoreAppM2mModule],
    })
      .overrideProvider(PrismaService)
      .useValue(isolatedPrisma)
      .overrideProvider(RedisService)
      .useValue({
        eval: jest.fn(async () => {
          throw new Error('redis unavailable');
        }),
      })
      .compile();
    const brokenApp = brokenModule.createNestApplication();
    brokenApp.setGlobalPrefix('api/v1');
    await brokenApp.init();
    const res = await request(brokenApp.getHttpServer())
      .post('/api/v1/auth/core-app/token')
      .send(tokenBody);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE);
    expect(isolatedPrisma.coreAppServiceClient.findUnique).not.toHaveBeenCalled();
    await brokenApp.close();
  });
});