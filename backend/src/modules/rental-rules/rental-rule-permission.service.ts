import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  assertMembershipPermission,
  type PermissionActor,
} from '@shared/auth/permission.util';
import {
  RENTAL_RULE_PERMISSION_REQUIREMENTS,
  type RentalRulePermissionAction,
  type RentalRulePermissionCode,
} from './rental-rules-permission.constants';

@Injectable()
export class RentalRulePermissionService {
  private readonly logger = new Logger(RentalRulePermissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assert(
    actor: PermissionActor | undefined,
    orgId: string,
    action: RentalRulePermissionAction,
  ): Promise<void> {
    if (!actor) return;

    const requirement = RENTAL_RULE_PERMISSION_REQUIREMENTS[action];
    await assertMembershipPermission(
      this.prisma,
      actor,
      orgId,
      requirement.module,
      requirement.level,
    );
    this.auditMasterAdminCrossTenant(actor, orgId, requirement.code);
  }

  async assertPublishIfActiveChange(
    actor: PermissionActor | undefined,
    orgId: string,
    isActive: boolean | undefined,
  ): Promise<void> {
    if (isActive === undefined) return;
    await this.assert(actor, orgId, 'rental_rules.publish');
  }

  private auditMasterAdminCrossTenant(
    actor: PermissionActor,
    orgId: string,
    code: RentalRulePermissionCode,
  ): void {
    if (actor.platformRole !== 'MASTER_ADMIN') return;
    if (actor.organizationId && actor.organizationId === orgId) return;
    this.logger.warn(
      `MASTER_ADMIN cross-tenant rental rule action: code=${code} orgId=${orgId} actorId=${actor.id}`,
    );
  }
}
