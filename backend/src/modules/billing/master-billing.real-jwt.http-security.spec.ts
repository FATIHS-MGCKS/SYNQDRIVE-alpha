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
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
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
  let sharedHarness: ReturnType<typeof createRefreshTokenHarness>;

  const platformPermissions = {
    hasActiveMasterBillingGrant: jest.fn(),
    resolveJwtPermissions: jest.fn(),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    const harness = createRefreshTokenHarness();
    sharedHarness = harness;

    harness.platformPermissions.resolveJwtPermissions.mockImplementation(async (userId: string) => {
      if (userId === DELEGATE_ID) {
        return [PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING];
      }
      if (userId === 'stale-delegate') {
        return [PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING];
      }
      return [];
    });

    const tenantUser = {
      id: TENANT_USER_ID,
      email: 'tenant@test.example',
      name: 'Tenant',
      platformRole: UserPlatformRole.USER,
      sessionVersion: 0,
    };
    harness.registerRefreshHarnessUser(tenantUser);
    accessTokenTenant = (await harness.service.issueTokenPair(tenantUser, null)).accessToken;

    const masterUser = {
      id: MASTER_ID,
      email: 'master@test.example',
      name: 'Master Admin',
      platformRole: UserPlatformRole.MASTER_ADMIN,
      sessionVersion: 0,
    };
    harness.registerRefreshHarnessUser(masterUser);
    accessTokenMaster = (await harness.service.issueTokenPair(masterUser, null)).accessToken;

    const delegateUser = {
      id: DELEGATE_ID,
      email: 'delegate@test.example',
      name: 'Delegate',
      platformRole: UserPlatformRole.USER,
      sessionVersion: 0,
    };
    harness.registerRefreshHarnessUser(delegateUser);
    accessTokenDelegate = (await harness.service.issueTokenPair(delegateUser, null)).accessToken;

    const staleUser = {
      id: 'stale-delegate',
      email: 'stale@test.example',
      name: 'Stale',
      platformRole: UserPlatformRole.USER,
      sessionVersion: 0,
    };
    harness.registerRefreshHarnessUser(staleUser);
    accessTokenStaleDelegate = (await harness.service.issueTokenPair(staleUser, null)).accessToken;
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
        { provide: UserAccessAuthorityService, useValue: sharedHarness.accessAuthority },
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
    const inactiveUser = {
      id: 'inactive-delegate',
      email: 'inactive@test.example',
      name: 'Inactive',
      platformRole: UserPlatformRole.USER,
      sessionVersion: 0,
    };
    sharedHarness.registerRefreshHarnessUser(inactiveUser);
    sharedHarness.platformPermissions.resolveJwtPermissions.mockImplementation(
      async (userId: string) => {
        if (userId === 'inactive-delegate') {
          return [PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING];
        }
        return [];
      },
    );
    const token = (await sharedHarness.service.issueTokenPair(inactiveUser, null)).accessToken;
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