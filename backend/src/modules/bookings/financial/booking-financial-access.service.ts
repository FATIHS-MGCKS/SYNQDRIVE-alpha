import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
  type PermissionActor,
} from '@shared/auth/permission.util';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class BookingFinancialAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async canReadFinancialData(actor: PermissionActor | undefined, orgId: string): Promise<boolean> {
    if (!actor) return false;
    if (actor.platformRole === 'MASTER_ADMIN') return true;

    if (!actor.id) return false;

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: actor.id,
        organizationId: orgId,
        status: 'ACTIVE',
      },
      select: {
        role: true,
        status: true,
        permissions: true,
        organizationRole: { select: { permissions: true, membershipRole: true } },
      },
    });
    if (!membership) return false;

    const permissions =
      normalizeMembershipPermissions(membership.permissions) ??
      normalizeMembershipPermissions(membership.organizationRole?.permissions);

    const invoicesRead = evaluateModulePermission(permissions, 'invoices', 'read', {
      membershipRole: membership.role,
      platformRole: actor.platformRole,
      membershipStatus: membership.status,
    });
    if (invoicesRead) return true;

    return evaluateModulePermission(permissions, 'payments', 'read', {
      membershipRole: membership.role,
      platformRole: actor.platformRole,
      membershipStatus: membership.status,
    });
  }

  async assertCanReadFinancialData(actor: PermissionActor | undefined, orgId: string): Promise<void> {
    const allowed = await this.canReadFinancialData(actor, orgId);
    if (!allowed) {
      throw new ForbiddenException({
        message: 'Keine Berechtigung für Finanzdaten dieser Buchung',
        code: 'BOOKING_FINANCIAL_DATA_FORBIDDEN',
      });
    }
  }
}
