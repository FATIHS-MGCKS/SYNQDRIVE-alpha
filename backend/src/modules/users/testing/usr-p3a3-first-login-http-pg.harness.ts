import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { PrismaClient } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { AuthController } from '@modules/auth/auth.controller';
import { AuthMfaLoginService } from '@modules/auth/auth-mfa-login.service';
import { AuthSessionContextService } from '@modules/auth/auth-session-context.service';
import { OrganizationSwitchService } from '@modules/auth/organization-switch.service';
import { PasswordResetService } from '@modules/auth/password-reset.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamMfaChallengeService } from '@modules/iam-mfa/iam-mfa-challenge.service';
import { IamMfaEnrollmentService } from '@modules/iam-mfa/iam-mfa-enrollment.service';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { IamMetricsService } from '@modules/iam-observability/iam-metrics.service';
import { assertUsrP3a3HttpDisposableDb } from '@modules/platform-admin/testing/usr-p3a3-identity-http-pg.harness';
import { InviteAcceptService } from '@modules/users/invite-accept.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { PublicInvitesController } from '@modules/users/public-invites.controller';
import { PrismaService } from '@shared/database/prisma.service';
import { buildValidationFailedResponse } from '@shared/validation/validation-error.util';
import { createUsrP2Config, createUsrP2PgIamStack } from './usr-p2-pg-iam-stack.helper';
import { createUsrP3a3IdentityPgStack } from './usr-p3a3-identity-pg-stack.helper';

export const USR_P3A3_FIRST_LOGIN_HTTP_JWT_SECRET = 'usr-p3a3-first-login-http-secret';

export type UsrP3a3FirstLoginHttpCtx = {
  app: INestApplication;
  prisma: PrismaClient;
  p3: ReturnType<typeof createUsrP3a3IdentityPgStack>;
  p2: ReturnType<typeof createUsrP2PgIamStack>;
};

export function assertUsrP3a3FirstLoginHttpDb(optIn: string): void {
  assertUsrP3a3HttpDisposableDb(optIn);
}

export async function createUsrP3a3FirstLoginHttpApp(
  prisma: PrismaClient,
): Promise<UsrP3a3FirstLoginHttpCtx> {
  const p2 = createUsrP2PgIamStack(prisma, USR_P3A3_FIRST_LOGIN_HTTP_JWT_SECRET, {
    legacyUnscopedGrace: true,
    orgBoundRefreshSessions: false,
  });
  const p3 = createUsrP3a3IdentityPgStack(prisma, USR_P3A3_FIRST_LOGIN_HTTP_JWT_SECRET);
  const config = createUsrP2Config(USR_P3A3_FIRST_LOGIN_HTTP_JWT_SECRET);
  const audit = new AuditService(prisma as never);
  const sessionContext = new AuthSessionContextService(prisma as never);
  const organizationSwitch = new OrganizationSwitchService(
    prisma as never,
    p2.refresh,
    audit,
    p3.userAudit,
  );
  const stepUp = new IamMfaStepUpService(prisma as never);
  const enrollment = new IamMfaEnrollmentService(prisma as never, p2.platformPermissions);
  const challenge = new IamMfaChallengeService(prisma as never, p2.refresh, stepUp);
  const authMfaLogin = new AuthMfaLoginService(
    config as ConfigService,
    prisma as never,
    p2.refresh,
    enrollment,
    challenge,
    p2.platformPermissions,
  );
  const iamMetrics = {
    recordLoginFailure: jest.fn(),
    recordLoginSuccess: jest.fn(),
  } as unknown as IamMetricsService;

  const moduleRef = await Test.createTestingModule({
    controllers: [PublicInvitesController, AuthController],
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: ConfigService, useValue: config },
      { provide: RefreshTokenService, useValue: p2.refresh },
      { provide: PasswordResetService, useValue: p3.passwordReset },
      { provide: AuditService, useValue: audit },
      { provide: AuthSessionContextService, useValue: sessionContext },
      { provide: OrganizationSwitchService, useValue: organizationSwitch },
      { provide: IamMetricsService, useValue: iamMetrics },
      { provide: AuthMfaLoginService, useValue: authMfaLogin },
      { provide: PlatformPermissionService, useValue: p2.platformPermissions },
      { provide: InviteAcceptService, useValue: p3.inviteAccept },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException(buildValidationFailedResponse(errors)),
    }),
  );
  app.setGlobalPrefix('api/v1');
  await app.init();

  return { app, prisma, p3, p2 };
}

export function parseInviteTokenFromUrl(inviteUrl: string): string {
  const url = new URL(inviteUrl);
  const token = url.searchParams.get('token');
  if (!token) {
    throw new Error('invite URL missing token');
  }
  return token;
}