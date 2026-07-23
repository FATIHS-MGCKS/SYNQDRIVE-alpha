import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  assertMembershipPermission,
  evaluateModulePermission,
  normalizeMembershipPermissions,
  type MembershipPermissionsMap,
  type PermissionActor,
} from '@shared/auth/permission.util';
import {
  BOOKING_PERMISSION_REQUIREMENTS,
  type BookingPermissionAction,
} from './booking-permission.constants';

@Injectable()
export class BookingPermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async assert(
    actor: PermissionActor,
    orgId: string,
    action: BookingPermissionAction,
  ): Promise<void> {
    const requirement = BOOKING_PERMISSION_REQUIREMENTS[action];
    await assertMembershipPermission(
      this.prisma,
      actor,
      orgId,
      requirement.module,
      requirement.level,
    );
  }

  async loadPermissions(
    actor: PermissionActor,
    orgId: string,
  ): Promise<MembershipPermissionsMap | null> {
    if (!actor?.id) return null;
    if (actor.platformRole === 'MASTER_ADMIN') return null;
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: actor.id, organizationId: orgId, status: 'ACTIVE' },
      select: { role: true, permissions: true },
    });
    if (!membership) return null;
    if (membership.role === 'ORG_ADMIN') return null;
    return normalizeMembershipPermissions(membership.permissions);
  }

  hasAction(
    permissions: MembershipPermissionsMap | null | undefined,
    action: BookingPermissionAction,
  ): boolean {
    const requirement = BOOKING_PERMISSION_REQUIREMENTS[action];
    return evaluateModulePermission(
      normalizeMembershipPermissions(permissions),
      requirement.module,
      requirement.level,
    );
  }
}
