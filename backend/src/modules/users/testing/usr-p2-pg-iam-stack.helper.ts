/**
 * Real RefreshTokenService + IamSessionPolicyService wiring for disposable PostgreSQL IAM tests.
 */
import type { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamSessionNotificationService, IamSessionPolicyService } from '@modules/auth/iam-session-policy.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { UserAccessAuditService } from '@modules/users/user-access-audit.service';

export type UsrP2PgIamStack = {
  prisma: PrismaClient;
  refresh: RefreshTokenService;
  sessionPolicy: IamSessionPolicyService;
  authority: UserAccessAuthorityService;
  platformPermissions: PlatformPermissionService;
};

export function createUsrP2Config(jwtSecret: string): ConfigService {
  return {
    get: (key: string, fallback?: unknown) => {
      if (key === 'app.jwtSecret') return jwtSecret;
      if (key === 'app.jwtExpiresIn') return '15m';
      if (key === 'iam.enableOrgBoundRefreshSessions') return true;
      if (key === 'iam.enableLegacyUnscopedRefreshGrace') return false;
      return fallback;
    },
  } as ConfigService;
}

export function createUsrP2PgIamStack(prisma: PrismaClient, jwtSecret: string): UsrP2PgIamStack {
  const config = createUsrP2Config(jwtSecret);
  const platformPermissions = new PlatformPermissionService(prisma as never);
  const userAudit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as UserAccessAuditService;
  const notifications = new IamSessionNotificationService();
  const refresh = new RefreshTokenService(
    prisma as never,
    config,
    { recordAndExecute: jest.fn() } as never,
    platformPermissions,
  );
  const sessionPolicy = new IamSessionPolicyService(
    prisma as never,
    refresh,
    userAudit,
    notifications,
  );
  Object.assign(refresh, { sessionPolicy });
  const authority = new UserAccessAuthorityService(prisma as never, platformPermissions);
  return { prisma, refresh, sessionPolicy, authority, platformPermissions };
}