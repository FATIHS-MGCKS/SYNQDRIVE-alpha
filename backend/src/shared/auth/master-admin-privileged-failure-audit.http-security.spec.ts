import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Type,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { IsBoolean } from 'class-validator';
import { Test } from '@nestjs/testing';
import { UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminPrivilegedAuditInterceptor } from '@shared/interceptors/master-admin-privileged-audit.interceptor';
import { GlobalExceptionFilter } from '@shared/filters/global-exception.filter';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { createMasterAdminAuthGuard } from '@shared/auth/testing/master-admin-mfa-http.integration.harness';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { ProspectsController } from '@modules/prospects/prospects.controller';
import { ProspectsService } from '@modules/prospects/prospects.service';
import { Roles } from '@shared/decorators/roles.decorator';
import { MFA_ERROR } from '@modules/iam-mfa/iam-mfa.policy';
import { installMfaEnforcedEnvForSuite } from '@shared/auth/testing/master-admin-mfa-http.integration.harness';

class ValidationBodyDto {
  @IsBoolean()
  confirm!: boolean;
}

@Controller('admin/test-privileged-audit')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
class PrivilegedAuditProbeController {
  @Post('success')
  success() {
    return { ok: true };
  }

  @Post('validation')
  validation(@Body() _body: ValidationBodyDto) {
    return { ok: true };
  }

  @Post('forbidden')
  forbidden() {
    throw new ForbiddenException({ code: 'BUSINESS_FORBIDDEN' });
  }

  @Post('server-error')
  serverError() {
    throw new Error('probe failure');
  }
}

describe('Master admin privileged failure audit — HTTP security', () => {
  const masterAdminAudit = {
    record: jest.fn().mockResolvedValue(undefined),
    recordMfaStepUp: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => jest.clearAllMocks());

  async function createApp(controllers: Type<any>[]) {
    const moduleRef = await Test.createTestingModule({
      controllers,
      providers: [
        { provide: MasterAdminAuditService, useValue: masterAdminAudit },
        MasterAdminPrivilegedAuditInterceptor,
        GlobalExceptionFilter,
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: MasterAdminPrivilegedAuditInterceptor },
        { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
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
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    return app;
  }

  it('records successful privileged mutation', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PrivilegedAuditProbeController],
      providers: [
        { provide: MasterAdminAuditService, useValue: masterAdminAudit },
        MasterAdminPrivilegedAuditInterceptor,
        GlobalExceptionFilter,
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: MasterAdminPrivilegedAuditInterceptor },
        { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
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
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/test-privileged-audit/success')
        .set('Authorization', 'Bearer master-token')
        .expect(201);
      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          httpStatus: 201,
          permissionGranted: true,
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('records validation failure once via interceptor', async () => {
    const app = await createApp([PrivilegedAuditProbeController]);
    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/test-privileged-audit/validation')
        .set('Authorization', 'Bearer master-token')
        .send({})
        .expect(400);

      const denied = (masterAdminAudit.record as jest.Mock).mock.calls.filter(
        (c) => c[0].auditAction === MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED,
      );
      expect(denied).toHaveLength(1);
      expect(denied[0][0]).toEqual(
        expect.objectContaining({
          metadata: expect.objectContaining({ failureCategory: 'VALIDATION' }),
          after: null,
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('records forbidden business mutation failure', async () => {
    const app = await createApp([PrivilegedAuditProbeController]);
    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/test-privileged-audit/forbidden')
        .set('Authorization', 'Bearer master-token')
        .expect(403);

      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED,
          permissionGranted: true,
          metadata: expect.objectContaining({ responseCode: 'BUSINESS_FORBIDDEN' }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('records guard-level authorization denial for non–MASTER_ADMIN', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PrivilegedAuditProbeController],
      providers: [
        { provide: MasterAdminAuditService, useValue: masterAdminAudit },
        GlobalExceptionFilter,
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: MasterAdminPrivilegedAuditInterceptor },
        { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
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
    app.setGlobalPrefix('api/v1');
    await app.init();
    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/test-privileged-audit/success')
        .set('Authorization', 'Bearer member-token')
        .expect(403);

      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED,
          permissionGranted: false,
        }),
      );
      expect((masterAdminAudit.record as jest.Mock).mock.calls).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  describe('MFA denial — no duplicate privileged failure audit', () => {
    installMfaEnforcedEnvForSuite();

    it('records MFA denial only via recordMfaStepUp', async () => {
      const prospects = { create: jest.fn() };
      const moduleRef = await Test.createTestingModule({
        controllers: [ProspectsController],
        providers: [
          { provide: MasterAdminAuditService, useValue: masterAdminAudit },
          { provide: APP_FILTER, useClass: GlobalExceptionFilter },
          { provide: APP_INTERCEPTOR, useClass: MasterAdminPrivilegedAuditInterceptor },
          { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
          MasterAdminMfaGuard,
          {
            provide: PrismaService,
            useValue: { userMfaFactor: { findFirst: jest.fn().mockResolvedValue({ id: 'f' }) } },
          },
          { provide: IamMfaStepUpService, useValue: { validateGrant: jest.fn() } },
          { provide: ProspectsService, useValue: prospects },
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
      app.setGlobalPrefix('api/v1');
      await app.init();
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/admin/prospects')
          .set('Authorization', 'Bearer master-token')
          .send({ name: 'Acme' })
          .expect(403);
        expect(res.body.code).toBe(MFA_ERROR.STEP_UP_REQUIRED);
        expect(masterAdminAudit.recordMfaStepUp).toHaveBeenCalled();
        const denied = (masterAdminAudit.record as jest.Mock).mock.calls.filter(
          (c) => c[0].auditAction === MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED,
        );
        expect(denied).toHaveLength(0);
        expect(prospects.create).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it('records exactly one privileged failure audit when MFA enrollment is missing', async () => {
      const prospects = { create: jest.fn() };
      const moduleRef = await Test.createTestingModule({
        controllers: [ProspectsController],
        providers: [
          { provide: MasterAdminAuditService, useValue: masterAdminAudit },
          { provide: APP_FILTER, useClass: GlobalExceptionFilter },
          { provide: APP_INTERCEPTOR, useClass: MasterAdminPrivilegedAuditInterceptor },
          { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
          MasterAdminMfaGuard,
          {
            provide: PrismaService,
            useValue: { userMfaFactor: { findFirst: jest.fn().mockResolvedValue(null) } },
          },
          { provide: IamMfaStepUpService, useValue: { validateGrant: jest.fn() } },
          { provide: ProspectsService, useValue: prospects },
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
      app.setGlobalPrefix('api/v1');
      await app.init();
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/admin/prospects')
          .set('Authorization', 'Bearer master-token')
          .send({ name: 'Acme' })
          .expect(403);
        expect(res.body.code).toBe(MFA_ERROR.ENROLLMENT_REQUIRED);
        expect(masterAdminAudit.recordMfaStepUp).not.toHaveBeenCalled();
        expect(masterAdminAudit.record).toHaveBeenCalledTimes(1);
        expect(masterAdminAudit.record).toHaveBeenCalledWith(
          expect.objectContaining({
            auditAction: MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED,
            permissionGranted: true,
            metadata: expect.objectContaining({
              responseCode: MFA_ERROR.ENROLLMENT_REQUIRED,
            }),
          }),
        );
        expect(prospects.create).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });
  });

  it('records server-side failure without leaking exception message', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PrivilegedAuditProbeController],
      providers: [
        { provide: MasterAdminAuditService, useValue: masterAdminAudit },
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: MasterAdminPrivilegedAuditInterceptor },
        { provide: APP_GUARD, useValue: createMasterAdminAuthGuard() },
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
    app.setGlobalPrefix('api/v1');
    await app.init();
    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/test-privileged-audit/server-error')
        .set('Authorization', 'Bearer master-token')
        .expect(500);

      expect(masterAdminAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          auditAction: MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED,
          description: expect.not.stringContaining('probe failure'),
          metadata: expect.objectContaining({ failureCategory: 'SERVER_ERROR' }),
        }),
      );
    } finally {
      await app.close();
    }
  });
});