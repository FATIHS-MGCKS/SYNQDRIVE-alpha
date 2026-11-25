import { ActivityAction, ActivityEntity, Prisma } from '@prisma/client';
import { buildAuditEnvelope } from '@modules/activity-log/audit-envelope.util';
import {
  MASTER_ADMIN_AUDIT_DOMAIN,
  MasterAdminAuditAction,
  type MasterAdminAuditRecordInput,
} from '@modules/activity-log/master-admin-audit.contract';

/**
 * Writes master-admin audit inside an open Prisma transaction so platform product
 * metadata mutations roll back when activityLog persistence fails.
 */
export async function persistProductMetadataMandatoryAuditTx(
  tx: Prisma.TransactionClient,
  input: MasterAdminAuditRecordInput,
): Promise<void> {
  await tx.activityLog.create({
    data: {
      organizationId: input.targetOrganizationId ?? null,
      userId: input.actorUserId ?? null,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.ADMIN_OPERATION,
      entityId: input.entityId ?? null,
      description: input.description,
      changeSummary: input.changeSummary ?? null,
      route: input.route ?? null,
      userAgent: input.userAgent ?? null,
      level: input.level ?? 'INFO',
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

export function buildProductMetadataAuditInput(input: {
  actorUserId: string;
  productId: string;
  productSlug: string;
  correlationId: string;
  route?: string;
  ipAddress?: string;
  userAgent?: string;
  mfaStepUpAction?: string | null;
  before: { name: string; description: string | null };
  after: { name: string; description: string | null };
}): MasterAdminAuditRecordInput {
  return {
    auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
    actorUserId: input.actorUserId,
    actorPlatformRole: 'MASTER_ADMIN',
    entityId: input.productId,
    description: `Platform product catalog metadata updated (${input.productSlug})`,
    correlationId: input.correlationId,
    route: input.route,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    mfaStepUpAction: input.mfaStepUpAction ?? null,
    mfaStepUpUsed: true,
    httpMethod: 'PATCH',
    httpStatus: 200,
    changeSummary: 'product-metadata-patch',
    before: input.before,
    after: input.after,
    metadata: {
      domain: 'platform_product_catalog',
      action: 'metadata_patch',
      productSlug: input.productSlug,
    },
  };
}