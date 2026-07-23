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
