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
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { PLATFORM_PERMISSION_JWT_VALUES } from '@modules/users/platform-permissions/platform-permission.constants';

const DELEGATE_ID = 'delegate-with-grant';
const TENANT_USER_ID = 'tenant-user';
const MASTER_ID = 'master-admin';

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
  const priorJwtSecret = process.env.JWT_SECRET;
  let accessTokenTenant: string;
  let accessTokenMaster: string;
  let accessTokenDelegate: string;
  let accessTokenStaleDelegate: string;

  const platformPermissions = {
    hasActiveMasterBillingGrant: jest.fn(),
    resolveJwtPermissions: jest.fn(),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    const harness = createRefreshTokenHarness();
    harness.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-http' });

    harness.platformPermissions.resolveJwtPermissions.mockImplementation(async (userId: string) => {
      if (userId === DELEGATE_ID) {
        return [PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING];
      }
      if (userId === 'stale-delegate') {
        return [PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING];
      }
      return [];
    });

    accessTokenTenant = (
      await harness.service.issueTokenPair(
        {
          id: TENANT_USER_ID,
          email: 'tenant@test.example',
          name: 'Tenant',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 0,
        },
        null,
      )
    ).accessToken;

    accessTokenMaster = (
      await harness.service.issueTokenPair(
        {
          id: MASTER_ID,
          email: 'master@test.example',
          name: 'Master Admin',
          platformRole: UserPlatformRole.MASTER_ADMIN,
          sessionVersion: 0,
        },
        null,
      )
    ).accessToken;

    accessTokenDelegate = (
      await harness.service.issueTokenPair(
        {
          id: DELEGATE_ID,
          email: 'delegate@test.example',
          name: 'Delegate',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 0,
        },
        null,
      )
    ).accessToken;

    accessTokenStaleDelegate = (
      await harness.service.issueTokenPair(
        {
          id: 'stale-delegate',
          email: 'stale@test.example',
          name: 'Stale',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 0,
        },
        null,
      )
    ).accessToken;
  });

  afterAll(() => {
    if (priorJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = priorJwtSecret;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    platformPermissions.hasActiveMasterBillingGrant.mockImplementation(async (userId: string) => {
      return userId === DELEGATE_ID;
    });
  });

  async function createApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [RealJwtProbeController],
      providers: [
        Reflector,
        AuthGuard,
        MasterBillingGuard,
        AuthThenBillingGuard,
        { provide: PlatformPermissionService, useValue: platformPermissions },
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

  it('USER without grant is denied', async () => {
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/billing/real-jwt-probe/mutate')
        .set('Authorization', `Bearer ${accessTokenTenant}`)
        .expect(403);
    } finally {
      await app.close();
    }
  });

  it('MASTER_ADMIN is allowed without platformPermissions claim', async () => {
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/billing/real-jwt-probe/mutate')
        .set('Authorization', `Bearer ${accessTokenMaster}`)
        .expect(201);
      expect(platformPermissions.hasActiveMasterBillingGrant).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('delegate with active DB grant and issuer claim is allowed', async () => {
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/billing/real-jwt-probe/mutate')
        .set('Authorization', `Bearer ${accessTokenDelegate}`)
        .expect(201);
      expect(platformPermissions.hasActiveMasterBillingGrant).toHaveBeenCalledWith(DELEGATE_ID);
    } finally {
      await app.close();
    }
  });

  it('inactive delegate denied even with stale JWT claim', async () => {
    platformPermissions.hasActiveMasterBillingGrant.mockImplementation(async (userId: string) => {
      if (userId === 'inactive-delegate') return false;
      return userId === DELEGATE_ID;
    });
    const harness = createRefreshTokenHarness();
    harness.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-inactive' });
    harness.platformPermissions.resolveJwtPermissions.mockResolvedValue([
      PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING,
    ]);
    const token = (
      await harness.service.issueTokenPair(
        {
          id: 'inactive-delegate',
          email: 'inactive@test.example',
          name: 'Inactive',
          platformRole: UserPlatformRole.USER,
          sessionVersion: 0,
        },
        null,
      )
    ).accessToken;
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/billing/real-jwt-probe/mutate')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    } finally {
      await app.close();
    }
  });

  it('stale JWT denied when DB grant revoked', async () => {
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/billing/real-jwt-probe/mutate')
        .set('Authorization', `Bearer ${accessTokenStaleDelegate}`)
        .expect(403);
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