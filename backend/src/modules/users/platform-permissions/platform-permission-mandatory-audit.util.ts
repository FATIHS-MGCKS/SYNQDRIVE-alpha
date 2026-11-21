import { ActivityAction, ActivityEntity, Prisma } from '@prisma/client';
import { buildAuditEnvelope } from '@modules/activity-log/audit-envelope.util';
import {
  MASTER_ADMIN_AUDIT_DOMAIN,
  MasterAdminAuditAction,
  type MasterAdminAuditRecordInput,
} from '@modules/activity-log/master-admin-audit.contract';

/**
 * Writes master-admin audit inside an open Prisma transaction so permission
 * mutations roll back when activityLog persistence fails (F2 audit integrity).
 */
export async function persistPlatformPermissionMandatoryAuditTx(
  tx: Prisma.TransactionClient,
  input: MasterAdminAuditRecordInput,
): Promise<void> {
  const action = resolveActivityAction(input.auditAction);
  const level = input.level ?? defaultLevel(input.auditAction);

  await tx.activityLog.create({
    data: {
      organizationId: input.targetOrganizationId ?? null,
      userId: input.actorUserId ?? null,
      action,
      entity: ActivityEntity.ADMIN_OPERATION,
      entityId: input.entityId ?? null,
      description: input.description,
      changeSummary: input.changeSummary ?? null,
      route: input.route ?? null,
      userAgent: input.userAgent ?? null,
      level,
      ipAddress: input.ipAddress ?? null,
      metaJson: buildAuditEnvelope({
        auditDomain: MASTER_ADMIN_AUDIT_DOMAIN,
        auditAction: input.auditAction,
        actorUserId: input.actorUserId,
        actorPlatformRole: input.actorPlatformRole,
        actorPermissions: input.actorPermissions,
        targetOrganizationId: input.targetOrganizationId,
        targetEntityType: 'ADMIN_OPERATION',
        targetEntityId: input.entityId,
        correlationId: input.correlationId,
        requestId: input.correlationId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        before: input.before,
        after: input.after,
        changeSummary: input.changeSummary,
        metadata: {
          reasonCode: input.reasonCode ?? null,
          mfaStepUpAction: input.mfaStepUpAction ?? null,
          mfaAssuranceLevel: input.mfaAssuranceLevel ?? null,
          mfaStepUpUsed: input.mfaStepUpUsed ?? false,
          permissionGranted: input.permissionGranted ?? true,
          httpMethod: input.httpMethod ?? null,
          httpStatus: input.httpStatus ?? null,
          ...(input.metadata ?? {}),
        },
      }) as object,
    },
  });
}

function resolveActivityAction(code: MasterAdminAuditRecordInput['auditAction']): ActivityAction {
  switch (code) {
    case MasterAdminAuditAction.ORG_DELETED:
    case MasterAdminAuditAction.PLATFORM_USER_DELETED:
    case MasterAdminAuditAction.PLATFORM_PRUNE:
      return ActivityAction.DELETE;
    case MasterAdminAuditAction.ORG_CREATED:
    case MasterAdminAuditAction.ORG_ADMIN_CREATED:
    case MasterAdminAuditAction.PLATFORM_USER_CREATED:
    case MasterAdminAuditAction.TEMP_MASTER_ADMIN_CREATED:
      return ActivityAction.CREATE;
    case MasterAdminAuditAction.MFA_STEP_UP_DENIED:
    case MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED:
      return ActivityAction.AUTH_FAIL;
    default:
      return ActivityAction.UPDATE;
  }
}

function defaultLevel(
  code: MasterAdminAuditRecordInput['auditAction'],
): 'INFO' | 'WARN' | 'CRITICAL' {
  if (
    code === MasterAdminAuditAction.ORG_DELETED ||
    code === MasterAdminAuditAction.PLATFORM_USER_DELETED ||
    code === MasterAdminAuditAction.PLATFORM_PRUNE
  ) {
    return 'CRITICAL';
  }
  if (
    code === MasterAdminAuditAction.MFA_STEP_UP_DENIED ||
    code === MasterAdminAuditAction.PRIVILEGED_MUTATION_DENIED
  ) {
    return 'WARN';
  }
  return 'INFO';
}