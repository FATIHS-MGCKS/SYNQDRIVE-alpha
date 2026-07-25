import 'reflect-metadata';
import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { buildValidationFailedResponse } from '@shared/validation/validation-error.util';
import { DataAuthorizationsController } from './data-authorizations.controller';
import { DataAuthorizationsService } from './data-authorizations.service';
import { DataProcessingHubMetricsController } from './data-processing-hub-metrics.controller';
import { DataProcessingHubMetricsService } from './data-processing-hub-metrics.service';
import { DataProcessingPermissionService } from './privacy-domain/review-workflow/data-processing-permission.service';
import { DenySwitchController } from './deny-switch/deny-switch.controller';
import { DenySwitchService } from './deny-switch/deny-switch.service';
import { EnforcementCoverageRegistryController } from './enforcement-coverage-registry/enforcement-coverage-registry.controller';
import { EnforcementCoverageRegistryService } from './enforcement-coverage-registry/enforcement-coverage-registry.service';
import { ProcessingActivityRegisterController } from './processing-activity-register/processing-activity-register.controller';
import { ProcessingActivityRegisterExportService } from './processing-activity-register/processing-activity-register-export.service';
import { ProcessingActivityRegisterService } from './processing-activity-register/processing-activity-register.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const AUTH_ID = '22222222-2222-4222-8222-222222222222';
const BASE = `/organizations/${ORG}/data-authorizations`;

/**
 * These controllers all share the `data-authorizations` prefix, so this spec
 * exercises real Express route resolution plus the same global ValidationPipe
 * configuration as `main.ts`. It reproduces two production defects:
 * the hub's default `sort=updatedAt` being rejected with HTTP 400, and the
 * catch-all `GET :id` swallowing sibling literal paths with a 404.
 */
describe('data-authorizations HTTP routing', () => {
  let app: INestApplication;
  const findByOrg = jest.fn();
  const findById = jest.fn();
  const hubMetrics = jest.fn();
  const registerList = jest.fn();

  beforeAll(async () => {
    findByOrg.mockResolvedValue({ data: [], meta: { limit: 25, nextCursor: null } });
    findById.mockResolvedValue({ id: AUTH_ID });
    hubMetrics.mockResolvedValue({ activeProcessingActivities: 0, legacy: { active: 1 } });
    registerList.mockResolvedValue({ data: [], meta: { nextCursor: null } });

    const allowAll = { canActivate: () => true };

    const moduleRef = await Test.createTestingModule({
      controllers: [
        DataProcessingHubMetricsController,
        EnforcementCoverageRegistryController,
        DenySwitchController,
        ProcessingActivityRegisterController,
        DataAuthorizationsController,
      ],
      providers: [
        { provide: DataAuthorizationsService, useValue: { findByOrg, findById } },
        { provide: DataProcessingHubMetricsService, useValue: { getMetrics: hubMetrics } },
        {
          provide: EnforcementCoverageRegistryService,
          useValue: {
            evaluate: () => ({ flows: [], enforcedCount: 0, totalFlows: 0 }),
          },
        },
        {
          provide: DenySwitchService,
          useValue: { listForOrganization: async () => [] },
        },
        { provide: ProcessingActivityRegisterService, useValue: { list: registerList } },
        { provide: ProcessingActivityRegisterExportService, useValue: {} },
        {
          provide: DataProcessingPermissionService,
          useValue: { assert: async () => undefined },
        },
      ],
    })
      .overrideGuard(OrgScopingGuard)
      .useValue(allowAll)
      .overrideGuard(RolesGuard)
      .useValue(allowAll)
      .overrideGuard(PermissionsGuard)
      .useValue(allowAll)
      .compile();

    app = moduleRef.createNestApplication();
    // Mirrors backend/src/main.ts so DTO rejections surface identically.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
        exceptionFactory: (errors) =>
          new BadRequestException(buildValidationFailedResponse(errors)),
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('list sort contract', () => {
    it('accepts the data-processing hub default filter set', async () => {
      await request(app.getHttpServer())
        .get(BASE)
        .query({ sort: 'updatedAt', dir: 'desc', limit: 25 })
        .expect(200);

      expect(findByOrg).toHaveBeenCalledWith(
        ORG,
        expect.objectContaining({ sort: 'updatedAt', dir: 'desc', limit: 25 }),
      );
    });

    it.each(['createdAt', 'updatedAt', 'title', 'expiresAt', 'status'])(
      'accepts sort=%s',
      async (sort) => {
        await request(app.getHttpServer()).get(BASE).query({ sort }).expect(200);
      },
    );

    it('still rejects an unsupported sort field', async () => {
      const res = await request(app.getHttpServer())
        .get(BASE)
        .query({ sort: 'nextReviewDate' })
        .expect(400);

      expect(res.body).toMatchObject({
        message: 'Validation failed',
        code: 'VALIDATION_FAILED',
        fieldErrors: [{ field: 'sort' }],
      });
    });
  });

  describe('sibling literal paths are not swallowed by the :id catch-all', () => {
    it('resolves hub-metrics to the hub metrics controller', async () => {
      const res = await request(app.getHttpServer()).get(`${BASE}/hub-metrics`).expect(200);

      expect(hubMetrics).toHaveBeenCalledWith(ORG);
      expect(res.body).toMatchObject({ legacy: { active: 1 } });
      expect(findById).not.toHaveBeenCalled();
    });

    it('resolves coverage to the coverage registry controller', async () => {
      await request(app.getHttpServer()).get(`${BASE}/coverage`).expect(200);
      expect(findById).not.toHaveBeenCalled();
    });

    it('resolves the processing activity register list', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/processing-activity-register`)
        .query({ sort: 'updatedAt', dir: 'desc', limit: 25 })
        .expect(200);

      expect(registerList).toHaveBeenCalled();
      expect(findById).not.toHaveBeenCalled();
    });

    it('resolves deny-switch', async () => {
      await request(app.getHttpServer()).get(`${BASE}/deny-switch`).expect(200);
      expect(findById).not.toHaveBeenCalled();
    });

    it('still routes a real authorization id to the detail handler', async () => {
      await request(app.getHttpServer()).get(`${BASE}/${AUTH_ID}`).expect(200);
      expect(findById).toHaveBeenCalledWith(ORG, AUTH_ID);
    });
  });
});
