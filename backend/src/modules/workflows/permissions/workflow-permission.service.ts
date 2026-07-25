import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  assertMembershipPermission,
  type PermissionActor,
} from '@shared/auth/permission.util';
import {
  WORKFLOW_PERMISSION_REQUIREMENTS,
  type WorkflowPermissionAction,
} from './workflow-permission.constants';

@Injectable()
export class WorkflowPermissionService {
  private readonly logger = new Logger(WorkflowPermissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assert(
    actor: PermissionActor | undefined,
    orgId: string,
    action: WorkflowPermissionAction,
  ): Promise<void> {
    if (!actor) return;

    const requirement = WORKFLOW_PERMISSION_REQUIREMENTS[action];
    await assertMembershipPermission(
      this.prisma,
      actor,
      orgId,
      requirement.module,
      requirement.level,
    );
    this.auditMasterAdminCrossTenant(actor, orgId, action);
  }

  async assertPublishIfActiveStatus(
    actor: PermissionActor | undefined,
    orgId: string,
    status: string | undefined,
  ): Promise<void> {
    if (status !== 'ACTIVE') return;
    await this.assert(actor, orgId, 'workflow.publish');
  }

  async assertToggle(
    actor: PermissionActor | undefined,
    orgId: string,
    currentStatus: string,
  ): Promise<void> {
    const action: WorkflowPermissionAction =
      currentStatus === 'ACTIVE' ? 'workflow.disable' : 'workflow.enable';
    await this.assert(actor, orgId, action);
  }

  private auditMasterAdminCrossTenant(
    actor: PermissionActor,
    orgId: string,
    action: WorkflowPermissionAction,
  ): void {
    if (actor.platformRole !== 'MASTER_ADMIN') return;
    if (actor.organizationId && actor.organizationId === orgId) return;
    this.logger.warn(
      `MASTER_ADMIN cross-tenant workflow action: action=${action} orgId=${orgId} actorId=${actor.id}`,
    );
  }
}
