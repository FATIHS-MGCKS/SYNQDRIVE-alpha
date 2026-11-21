import {
  Controller,
  INestApplication,
  Post,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { AuthGuard } from '@shared/auth/auth.guard';
import { MasterBillingGuard } from '@shared/auth/master-billing.guard';
import { RequireMasterBilling } from '@shared/decorators/require-master-billing.decorator';
import { createRefreshTokenHarness } from '@modules/users/iam-security-regression.harness';

@Controller('api/v1/admin/billing/real-jwt-probe')
@RequireMasterBilling()
class RealJwtProbeController {
  @Post('mutate')
  mutate() {
    return { ok: true };
  }
}

/** Runs AuthGuard after JWT is parsed so MasterBillingGuard sees request.user. */
@Injectable()
class AuthThenBillingGuard implements CanActivate {
  constructor(
    private readonly auth: AuthGuard,
    private readonly billing: MasterBillingGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.auth.canActivate(context);
    return this.billing.canActivate(context);
  }
}

describe('Master billing — real RefreshTokenService JWT (HTTP)', () => {
  let accessTokenUser: string;
  let accessTokenMaster: string;
  const priorJwtSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    const { service, prisma } = createRefreshTokenHarness();
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-http' });
    accessTokenUser = (
      await service.issueTokenPair({
        id: 'tenant-user',
        email: 'tenant@test.example',
        name: 'Tenant',
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
      }, null)
    ).accessToken;
    accessTokenMaster = (
      await service.issueTokenPair({
        id: 'master-admin',
        email: 'master@test.example',
        name: 'Master Admin',
        platformRole: UserPlatformRole.MASTER_ADMIN,
        sessionVersion: 0,
      }, null)
    ).accessToken;
  });

  afterAll(() => {
    if (priorJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = priorJwtSecret;
    }
  });

  async function createApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [RealJwtProbeController],
      providers: [
        Reflector,
        AuthGuard,
        MasterBillingGuard,
        AuthThenBillingGuard,
        {
          provide: APP_GUARD,
          useExisting: AuthThenBillingGuard,
        },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  it('USER access JWT from issuer is denied (no platformPermissions claim)', async () => {
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/billing/real-jwt-probe/mutate')
        .set('Authorization', `Bearer ${accessTokenUser}`)
        .expect(403);
    } finally {
      await app.close();
    }
  });

  it('MASTER_ADMIN access JWT from issuer is allowed without platformPermissions', async () => {
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/billing/real-jwt-probe/mutate')
        .set('Authorization', `Bearer ${accessTokenMaster}`)
        .expect(201);
    } finally {
      await app.close();
    }
  });

  it('rejects missing bearer', async () => {
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/billing/real-jwt-probe/mutate')
        .expect(401);
    } finally {
      await app.close();
    }
  });
});