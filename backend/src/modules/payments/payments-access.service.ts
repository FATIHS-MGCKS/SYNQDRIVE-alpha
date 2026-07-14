import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
  type PermissionActor,
} from '@shared/auth/permission.util';
import { resolvePermissionOrgId } from '@shared/auth/permission.util';
import {
  PAYMENT_PERMISSION_REQUIREMENTS,
  type PaymentPermissionAction,
} from './payment-permission.constants';

export class PaymentsFeatureDisabledError extends ForbiddenException {
  constructor(organizationId: string) {
    super(`End-customer payments are not enabled for organization ${organizationId}`);
    this.name = 'PaymentsFeatureDisabledError';
  }
}

export interface PaymentOrgRequest {
  params?: { orgId?: string };
  query?: { orgId?: string | string[] };
}

@Injectable()
export class PaymentsAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async isPaymentsEnabled(organizationId: string): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { paymentsEnabled: true },
    });
    return org?.paymentsEnabled === true;
  }

  /**
   * Platform-admin rollout — never auto-enabled on org create.
   */
  async setPaymentsEnabled(organizationId: string, enabled: boolean): Promise<{ paymentsEnabled: boolean }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { paymentsEnabled: enabled },
      select: { paymentsEnabled: true },
    });
    return updated;
  }

  resolveOrgId(request: PaymentOrgRequest, actor: PermissionActor): string | undefined {
    return resolvePermissionOrgId(request, actor);
  }

  async assertPaymentsFeatureEnabled(
    organizationId: string,
    actor: PermissionActor,
  ): Promise<void> {
    if (actor.platformRole === 'MASTER_ADMIN') {
      return;
    }

    const enabled = await this.isPaymentsEnabled(organizationId);
    if (!enabled) {
      throw new PaymentsFeatureDisabledError(organizationId);
    }
  }

  evaluatePaymentPermission(
    permissions: ReturnType<typeof normalizeMembershipPermissions>,
    action: PaymentPermissionAction,
  ): boolean {
    const requirement = PAYMENT_PERMISSION_REQUIREMENTS[action];
    return evaluateModulePermission(permissions, requirement.module, requirement.level);
  }

  async assertPaymentPermission(
    organizationId: string,
    actor: PermissionActor,
    action: PaymentPermissionAction,
  ): Promise<void> {
    if (actor.platformRole === 'MASTER_ADMIN') {
      return;
    }

    if (!actor.id) {
      throw new ForbiddenException('Authentication required');
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: actor.id,
        organizationId,
        status: 'ACTIVE',
      },
      select: { role: true, permissions: true },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this organization');
    }

    if (membership.role === MembershipRole.ORG_ADMIN) {
      return;
    }

    const normalized = normalizeMembershipPermissions(membership.permissions);
    if (!this.evaluatePaymentPermission(normalized, action)) {
      throw new ForbiddenException(`Missing permission: ${action}`);
    }
  }

  async assertPaymentAccess(
    request: PaymentOrgRequest,
    actor: PermissionActor,
    action: PaymentPermissionAction,
  ): Promise<string> {
    const orgId = this.resolveOrgId(request, actor);
    if (!orgId) {
      throw new ForbiddenException('Organization context required');
    }

    if (actor.platformRole !== 'MASTER_ADMIN') {
      const jwtOrgId = actor.organizationId;
      const paramOrgId = request.params?.orgId;
      if (paramOrgId && jwtOrgId && paramOrgId !== jwtOrgId) {
        throw new ForbiddenException('You do not have access to this organization');
      }
    }

    await this.assertPaymentsFeatureEnabled(orgId, actor);
    await this.assertPaymentPermission(orgId, actor, action);
    return orgId;
  }
}
