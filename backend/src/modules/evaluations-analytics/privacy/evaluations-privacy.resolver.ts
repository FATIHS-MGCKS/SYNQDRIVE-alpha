import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
} from '@shared/auth/permission.util';
import {
  resolveEvaluationsPiiTier,
  type EvaluationsPiiTier,
} from './evaluations-privacy.policy';

export interface EvaluationsPrivacyActor {
  readonly id?: string;
  readonly organizationId?: string | null;
  readonly platformRole?: string | null;
}

/**
 * Resolves the server-side PII tier for a person-level evaluations read. It
 * reuses the canonical membership-permission primitives (`permission.util`) — it
 * does NOT introduce a second authorization/scope authority — and fails closed
 * (tier `none`) when there is no active same-tenant membership.
 */
@Injectable()
export class EvaluationsPrivacyResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolvePiiTier(
    actor: EvaluationsPrivacyActor,
    organizationId: string,
  ): Promise<EvaluationsPiiTier> {
    if (actor.platformRole === 'MASTER_ADMIN') return 'full';

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: actor.id, organizationId, status: 'ACTIVE' },
      select: { role: true, permissions: true },
    });
    if (!membership) return 'none'; // fail closed

    const permissions = normalizeMembershipPermissions(membership.permissions);
    return resolveEvaluationsPiiTier({
      platformRole: actor.platformRole ?? null,
      membershipRole: membership.role ?? null,
      canReadInvoices: evaluateModulePermission(permissions, 'invoices', 'read'),
      canReadCustomers: evaluateModulePermission(permissions, 'customers', 'read'),
    });
  }
}
