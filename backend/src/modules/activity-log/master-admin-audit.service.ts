import { Injectable, Logger } from '@nestjs/common';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { AuditService } from './audit.service';
import {
  MASTER_ADMIN_AUDIT_DOMAIN,
  MasterAdminAuditAction,
  MasterAdminAuditActionCode,
  MasterAdminAuditRecordInput,
} from './master-admin-audit.contract';

@Injectable()
export class MasterAdminAuditService {
  private readonly logger = new Logger(MasterAdminAuditService.name);

  constructor(private readonly audit: AuditService) {}

  async record(input: MasterAdminAuditRecordInput): Promise<void> {
    const action = this.resolveActivityAction(input.auditAction);
    const level = input.level ?? this.defaultLevel(input.auditAction);

    await this.audit.record({
      actorUserId: input.actorUserId,
      actorOrganizationId: input.targetOrganizationId ?? undefined,
      action,
      entity: ActivityEntity.ADMIN_OPERATION,
      entityId: input.entityId ?? undefined,
      description: input.description,
      route: input.route,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      level,
      metaJson: {
        auditDomain: MASTER_ADMIN_AUDIT_DOMAIN,
        auditAction: input.auditAction,
        correlationId: input.correlationId,
        requestId: input.correlationId,
        actorUserId: input.actorUserId ?? null,
        actorPlatformRole: input.actorPlatformRole ?? null,
        actorPermissions: input.actorPermissions ?? [],
        targetOrganizationId: input.targetOrganizationId ?? null,
        reasonCode: input.reasonCode ?? null,
        mfaStepUpAction: input.mfaStepUpAction ?? null,
        mfaAssuranceLevel: input.mfaAssuranceLevel ?? null,
        mfaStepUpUsed: input.mfaStepUpUsed ?? false,
        permissionGranted: input.permissionGranted ?? true,
        httpMethod: input.httpMethod ?? null,
        httpStatus: input.httpStatus ?? null,
        recordedAt: new Date().toISOString(),
        ...(input.metadata ?? {}),
      },
    });
  }

  async recordMfaStepUp(input: {
    granted: boolean;
    actorUserId: string;
    stepUpAction: string;
    correlationId: string;
    route?: string;
    ipAddress?: string;
    userAgent?: string;
    reasonCode?: string | null;
  }): Promise<void> {
    await this.record({
      auditAction: input.granted
        ? MasterAdminAuditAction.MFA_STEP_UP_GRANTED
        : MasterAdminAuditAction.MFA_STEP_UP_DENIED,
      actorUserId: input.actorUserId,
      actorPlatformRole: 'MASTER_ADMIN',
      description: input.granted
        ? `Master admin MFA step-up granted for ${input.stepUpAction}`
        : `Master admin MFA step-up denied for ${input.stepUpAction}`,
      correlationId: input.correlationId,
      route: input.route,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      reasonCode: input.reasonCode ?? null,
      mfaStepUpAction: input.stepUpAction,
      mfaStepUpUsed: input.granted,
      level: input.granted ? 'INFO' : 'WARN',
    });
  }

  private resolveActivityAction(code: MasterAdminAuditActionCode): ActivityAction {
    switch (code) {
      case MasterAdminAuditAction.ORG_DELETED:
      case MasterAdminAuditAction.PLATFORM_USER_DELETED:
      case MasterAdminAuditAction.PLATFORM_PRUNE:
        return ActivityAction.DELETE;
      case MasterAdminAuditAction.ORG_CREATED:
      case MasterAdminAuditAction.ORG_ADMIN_CREATED:
      case MasterAdminAuditAction.PLATFORM_USER_CREATED:
        return ActivityAction.CREATE;
      case MasterAdminAuditAction.MFA_STEP_UP_DENIED:
        return ActivityAction.AUTH_FAIL;
      default:
        return ActivityAction.UPDATE;
    }
  }

  private defaultLevel(code: MasterAdminAuditActionCode): 'INFO' | 'WARN' | 'CRITICAL' {
    if (
      code === MasterAdminAuditAction.ORG_DELETED ||
      code === MasterAdminAuditAction.PLATFORM_USER_DELETED ||
      code === MasterAdminAuditAction.PLATFORM_PRUNE
    ) {
      return 'CRITICAL';
    }
    if (code === MasterAdminAuditAction.MFA_STEP_UP_DENIED) {
      return 'WARN';
    }
    return 'INFO';
  }
}
