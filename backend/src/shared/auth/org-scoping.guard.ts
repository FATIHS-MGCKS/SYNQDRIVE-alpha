import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { IamMetricsService } from '@modules/iam-observability/iam-metrics.service';

/**
 * OrgScopingGuard — centralized multi-tenant enforcement for org-scoped routes.
 *
 * Rules (evaluated in order):
 *  1. If request has no authenticated user, defer (AuthGuard runs first globally).
 *  2. MASTER_ADMIN: pass-through — platform admin can access any org.
 *  3. All other users:
 *     a. :orgId must be present in route params.
 *     b. User must have an ACTIVE membership in that organization.
 *     c. The JWT organizationId claim must match :orgId — prevents token-mismatch attacks.
 *
 * Usage:
 *   @UseGuards(OrgScopingGuard)           — on controller class or individual handler
 *   or apply via module-level provider registration
 */
@Injectable()
export class OrgScopingGuard implements CanActivate {
  private readonly logger = new Logger(OrgScopingGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly iamMetrics?: IamMetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // No user context — auth guard handles this; let it pass here
    if (!user) return true;

    // MASTER_ADMIN has platform-wide access
    if (user.platformRole === 'MASTER_ADMIN') {
      // Still set tenantId for downstream services that consume it
      const orgId = request.params?.orgId;
      if (orgId) request.tenantId = orgId;
      return true;
    }

    const orgId: string | undefined = request.params?.orgId;

    // If the route does not have :orgId, this guard is a no-op
    if (!orgId) return true;

    // Fast-path: if the JWT claim already matches and we verified at login, skip DB query
    // (JWT is signed with org context at login time)
    if (user.organizationId && user.organizationId !== orgId) {
      this.logger.warn(
        `OrgScopingGuard: user ${user.id} tried to access org ${orgId} but JWT claims org ${user.organizationId}`,
      );
      this.iamMetrics?.recordCrossTenantDenial('org_scoping');
      throw new ForbiddenException('You do not have access to this organization');
    }

    // DB verification: confirm the membership is still ACTIVE (accounts for revocation after token issue)
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: user.id,
        organizationId: orgId,
        status: 'ACTIVE',
      },
      select: { id: true, role: true },
    });

    if (!membership) {
      this.logger.warn(
        `OrgScopingGuard: no active membership for user ${user.id} in org ${orgId}`,
      );
      this.iamMetrics?.recordCrossTenantDenial('membership');
      throw new ForbiddenException('You do not have access to this organization');
    }

    // Stamp tenantId onto request for downstream service use
    request.tenantId = orgId;

    return true;
  }
}
