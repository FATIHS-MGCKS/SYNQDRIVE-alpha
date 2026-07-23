import { Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  normalizeMembershipPermissions,
  type PermissionActor,
} from '@shared/auth/permission.util';
import {
  resolveBookingReadProjectionContext,
  type BookingReadProjectionContext,
} from './booking-read-projection.context';

@Injectable()
export class BookingReadContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    orgId: string,
    actor?: PermissionActor | null,
    options?: { customerScopeId?: string | null },
  ): Promise<BookingReadProjectionContext> {
    let permissions = null;
    let membershipRole = actor?.membershipRole as MembershipRole | undefined;

    if (actor?.id) {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          userId: actor.id,
          organizationId: orgId,
          status: 'ACTIVE',
        },
        select: { role: true, permissions: true },
      });
      if (membership) {
        membershipRole = membership.role;
        permissions = normalizeMembershipPermissions(membership.permissions);
      }
    }

    return resolveBookingReadProjectionContext({
      actor: { ...actor, membershipRole },
      permissions,
      customerScopeId: options?.customerScopeId ?? null,
    });
  }
}
