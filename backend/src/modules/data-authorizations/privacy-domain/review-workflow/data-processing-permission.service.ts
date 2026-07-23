import { ForbiddenException, Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { evaluateOperationalPermission } from '@shared/auth/operational-permission.util';
import {
  normalizeMembershipPermissions,
  type PermissionActor,
} from '@shared/auth/permission.util';
import type { DataProcessingPermissionAction } from './data-processing-permission.constants';

@Injectable()
export class DataProcessingPermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async assert(actor: PermissionActor, orgId: string, action: DataProcessingPermissionAction): Promise<void> {
    if (actor.platformRole === 'MASTER_ADMIN') return;
    if (!actor.id) {
      throw new ForbiddenException('Authentication required');
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: actor.id, organizationId: orgId, status: 'ACTIVE' },
      select: { role: true, permissions: true },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this organization');
    }

    if (membership.role === MembershipRole.ORG_ADMIN) return;

    const normalized = normalizeMembershipPermissions(membership.permissions);
    if (!evaluateOperationalPermission(normalized, action)) {
      throw new ForbiddenException(`Missing permission: ${action}`);
    }
  }

  async assertOrgMembership(actorUserId: string, orgId: string): Promise<void> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: actorUserId, organizationId: orgId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('Reviewer must belong to the organization');
    }
  }
}
