import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { VoiceAssistantAdminController } from './voice-assistant.controller';
import { VoiceAssistantService } from './voice-assistant.service';

const ORG = '11111111-1111-1111-1111-111111111111';
const MASTER = 'master-admin-1';

describe('VoiceAssistantAdminController — MFA HTTP security', () => {
  const service = { adminSyncOrganization: jest.fn().mockResolvedValue({ synced: true }) };

  const authGuard = {
    canActivate: (ctx: { switchToHttp: () => { getRequest: () => Record<string, unknown> } }) => {
      const req = ctx.switchToHttp().getRequest() as {
        headers?: { authorization?: string };
        user?: { id: string; platformRole: UserPlatformRole };
      };
      const auth = String(req.headers?.authorization ?? '');
      if (auth.startsWith('Bearer master-')) {
        req.user = { id: MASTER, platformRole: UserPlatformRole.MASTER_ADMIN };
        return true;
      }
      if (auth.startsWith('Bearer org-')) {
        req.user = {
          id: 'org-user',
          platformRole: UserPlatformRole.USER,
        } as never;
        return true;
      }
      return false;
    },
  };

  beforeEach(() => jest.clearAllMocks());

  it('sync route requires MASTER_INTEGRATIONS step-up metadata', () => {
    const sync = VoiceAssistantAdminController.prototype.syncOrganization;
    expect(Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, sync)).toBe(
      STEP_UP_ACTION.MASTER_INTEGRATIONS,
    );
  });

  it('allows sync when MFA flags are off (default)', async () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv };
    delete process.env.IAM_MFA_MASTER_ADMIN_ENABLED;

    const moduleRef = await Test.createTestingModule({
      controllers: [VoiceAssistantAdminController],
      providers: [
        { provide: VoiceAssistantService, useValue: service },
        { provide: APP_GUARD, useValue: authGuard },
        MasterAdminMfaGuard,
        { provide: PrismaService, useValue: { userMfaFactor: { findFirst: jest.fn() } } },
        { provide: IamMfaStepUpService, useValue: { validateGrant: jest.fn() } },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => { user?: { platformRole?: string } } };
        }) => ctx.switchToHttp().getRequest().user?.platformRole === UserPlatformRole.MASTER_ADMIN,
      })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .post(`/admin/voice-assistant/organizations/${ORG}/sync`)
      .set('Authorization', 'Bearer master-token')
      .expect(201);

    expect(service.adminSyncOrganization).toHaveBeenCalledWith(ORG);
    process.env = originalEnv;
    await app.close();
  });

  it('rejects non–MASTER_ADMIN on sync', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VoiceAssistantAdminController],
      providers: [
        { provide: VoiceAssistantService, useValue: service },
        { provide: APP_GUARD, useValue: authGuard },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => false })
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .post(`/admin/voice-assistant/organizations/${ORG}/sync`)
      .set('Authorization', 'Bearer org-token')
      .expect(403);

    await app.close();
  });

  it('real MasterAdminMfaGuard denies sync POST without step-up when enforced', async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      IAM_MFA_MASTER_ADMIN_ENABLED: 'true',
      IAM_MFA_STEP_UP_ENFORCED: 'true',
    };

    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(STEP_UP_ACTION.MASTER_INTEGRATIONS),
    };
    const prisma = {
      userMfaFactor: { findFirst: jest.fn().mockResolvedValue({ id: 'mfa-1' }) },
    };
    const stepUp = { validateGrant: jest.fn().mockResolvedValue(false) };
    const guard = new MasterAdminMfaGuard(
      reflector as never,
      prisma as unknown as PrismaService,
      stepUp as unknown as IamMfaStepUpService,
    );

    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          user: { id: MASTER, platformRole: UserPlatformRole.MASTER_ADMIN },
          headers: {},
        }),
      }),
    };

    await expect(guard.canActivate(ctx as never)).rejects.toMatchObject({
      response: { code: 'STEP_UP_REQUIRED' },
    });

    process.env = originalEnv;
  });
});