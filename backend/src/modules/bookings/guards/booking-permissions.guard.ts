import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@shared/database/prisma.service';
import { IamMetricsService } from '@modules/iam-observability/iam-metrics.service';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
  resolvePermissionOrgId,
} from '@shared/auth/permission.util';
import {
  BOOKING_PERMISSION_KEY,
} from '../decorators/require-booking-permission.decorator';
import {
  BOOKING_PERMISSION_REQUIREMENTS,
  isBookingPermissionAction,
  type BookingPermissionAction,
} from '../booking-permission.constants';

/**
 * Booking-scoped permission guard — deny-by-default.
 *
 * Every handler on `BookingsController` MUST declare `@RequireBookingPermission(...)`.
 * Missing metadata → 403 (never pass-through).
 *
 * Must run after `OrgScopingGuard`.
 */
@Injectable()
export class BookingPermissionsGuard implements CanActivate {
  private readonly logger = new Logger(BookingPermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Optional() private readonly iamMetrics?: IamMetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<BookingPermissionAction>(
      BOOKING_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!action || !isBookingPermissionAction(action)) {
      throw new ForbiddenException(
        'Booking endpoint requires an explicit booking permission declaration',
      );
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.platformRole === 'MASTER_ADMIN') return true;

    const orgId = resolvePermissionOrgId(request, user);
    if (!orgId) {
      throw new ForbiddenException('Organization context required');
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: user.id, organizationId: orgId, status: 'ACTIVE' },
      select: { role: true, permissions: true },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this organization');
    }

    if (membership.role === 'ORG_ADMIN') return true;

    const permissions = normalizeMembershipPermissions(membership.permissions);
    const requirement = BOOKING_PERMISSION_REQUIREMENTS[action];
    const granted = evaluateModulePermission(
      permissions,
      requirement.module,
      requirement.level,
    );

    if (!granted) {
      this.logger.warn(
        `BookingPermissionsGuard: user ${user.id} missing ${requirement.module}.${requirement.level} for ${action} in org ${orgId}`,
      );
      this.iamMetrics?.recordEffectiveAccessDenied(requirement.module, requirement.level);
      throw new ForbiddenException(
        `Missing permission: ${requirement.module}.${requirement.level}`,
      );
    }

    request.bookingMembershipPermissions = permissions;
    request.bookingMembershipRole = membership.role;
    return true;
  }
}
