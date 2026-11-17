import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ProductSlug, UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { CORE_APP_M2M_SCOPE_VEHICLE_READ } from '../core-app-m2m.constants';
import { CoreAppServiceClientAdminController } from './core-app-service-client.admin.controller';
import { CoreAppServiceClientAdminService } from './core-app-service-client.admin.service';

const MASTER = 'master-user-1';
const CLIENT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Core app service clients — HTTP security integration', () => {
  const admin = {
    listClients: jest.fn(),
    createClient: jest.fn(),
    getClient: jest.fn(),
    updateClient: jest.fn(),
    rotateCredential: jest.fn(),
    listOrgGrants: jest.fn(),
    attachOrgGrant: jest.fn(),
    updateOrgGrant: jest.fn(),
  };

  const authGuard = {
    canActivate: (ctx: { switchToHttp: () => { getRequest: () => Record<string, unknown> } }) => {
      const req = ctx.switchToHttp().getRequest() as {
        headers?: { authorization?: string };
        user?: { id: string; platformRole: UserPlatformRole };
      };
      const auth = String(req.headers?.authorization ?? '');
      if (auth === 'Bearer master') {
        req.user = { id: MASTER, platformRole: UserPlatformRole.MASTER_ADMIN };
        return true;
      }
      if (auth === 'Bearer member') {
        req.user = { id: 'member', platformRole: UserPlatformRole.USER };
        return true;
      }
      return false;
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    admin.listClients.mockResolvedValue({ contractVersion: 'core.app.service_client.admin.v1', items: [] });
    admin.createClient.mockResolvedValue({
      contractVersion: 'core.app.service_client.admin.v1',
      client: { id: CLIENT_UUID, clientId: 'fleet-1' },
      clientSecret: 'once-only-secret',
    });
  });

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [CoreAppServiceClientAdminController],
      providers: [
        { provide: CoreAppServiceClientAdminService, useValue: admin },
        { provide: APP_GUARD, useValue: authGuard },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => { user?: { platformRole?: string } } } }) =>
          ctx.switchToHttp().getRequest().user?.platformRole === UserPlatformRole.MASTER_ADMIN,
      })
      .overrideGuard(MasterAdminMfaGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    return app;
  }

  it('denies non-master admin', async () => {
    const app = await createApp();
    await request(app.getHttpServer())
      .get('/api/v1/admin/core-app-service-clients')
      .set('Authorization', 'Bearer member')
      .expect(403);
    await app.close();
  });

  it('allows master list and create with no-store on credential response', async () => {
    const app = await createApp();
    await request(app.getHttpServer())
      .get('/api/v1/admin/core-app-service-clients')
      .set('Authorization', 'Bearer master')
      .expect(200);

    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/core-app-service-clients')
      .set('Authorization', 'Bearer master')
      .send({
        clientId: 'fleet-ext-1',
        displayName: 'Fleet external',
        productSlug: ProductSlug.FLEET,
        allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
      })
      .expect(201);

    expect(created.headers['cache-control']).toMatch(/no-store/i);
    expect(created.body.clientSecret).toBe('once-only-secret');
    expect(created.body.client).not.toHaveProperty('credentialHash');
    await app.close();
  });
});