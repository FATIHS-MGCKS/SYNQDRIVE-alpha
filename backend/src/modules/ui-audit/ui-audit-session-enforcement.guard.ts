import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { resolveUiAuditJwtPermissions } from './ui-audit.context';
import { UI_AUDIT_JWT_VALUES } from './ui-audit.constants';

function isPublicApiPath(path: string): boolean {
  return (
    path === '/api/v1/health' ||
    path.startsWith('/api/v1/auth/login') ||
    path.startsWith('/api/v1/auth/refresh') ||
    path.startsWith('/api/v1/auth/logout')
  );
}

/**
 * Re-validates audit-bound sessions on every request:
 * active user, sessionVersion, live platform grants, no privileged-role escalation.
 */
@Injectable()
export class UiAuditSessionEnforcementGuard implements CanActivate {
  private readonly logger = new Logger(UiAuditSessionEnforcementGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformPermissions: PlatformPermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
  const path = String(request.url ?? request.path ?? '').split('?')[0] ?? '';

    if (!user?.id) return true;

    const jwtAudit = resolveUiAuditJwtPermissions(user);
    if (jwtAudit.length === 0) return true;

    if (user.platformRole === 'MASTER_ADMIN' || user.membershipRole === 'ORG_ADMIN') {
      this.logger.warn(`Audit JWT present with privileged role user=${user.id}`);
      throw new ForbiddenException('UI audit JWT incompatible with privileged role');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { status: true, platformRole: true, sessionVersion: true },
    });

    if (!dbUser || dbUser.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is inactive');
    }

    if (dbUser.platformRole === 'MASTER_ADMIN') {
      throw new ForbiddenException('UI audit JWT incompatible with MASTER_ADMIN account');
    }

    const jwtSessionVersion = Number(user.sessionVersion ?? 0);
    if (jwtSessionVersion < dbUser.sessionVersion) {
      if (!isPublicApiPath(path)) {
        throw new UnauthorizedException('Session version invalidated');
      }
    }

    const orgAdmin = await this.prisma.organizationMembership.findFirst({
      where: { userId: user.id, role: 'ORG_ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });
    if (orgAdmin) {
      throw new ForbiddenException('UI audit JWT incompatible with ORG_ADMIN membership');
    }

    const liveGrants = await this.platformPermissions.resolveJwtPermissions(user.id);
    const liveAudit = liveGrants.filter((g) => UI_AUDIT_JWT_VALUES.includes(g));
    if (liveAudit.length === 0) {
      throw new UnauthorizedException('UI audit grant revoked');
    }

    for (const grant of jwtAudit) {
      if (!liveAudit.includes(grant)) {
        throw new UnauthorizedException('Stale UI audit grant in access token');
      }
    }

    return true;
  }
}