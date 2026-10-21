import { ActivityAction, ActivityEntity } from '@prisma/client';
import type { AuditService } from '@modules/activity-log/audit.service';
import type { PhysicalDeviceListItemDto } from './physical-device-inventory.types';
import { physicalDeviceLifecycleCommittedActivityAuditFailure } from './physical-device-inventory.errors';
import { toSafeOperatorResultSummary } from './pdi-p1b7-manual-intake-operator.lib';

export type PhysicalDeviceLifecycleActivityKind = 'UNINSTALL' | 'RETURN_TO_STOCK';

export async function recordPhysicalDeviceLifecycleActivityAudit(
  audit: AuditService,
  input: {
    lifecycleAction: PhysicalDeviceLifecycleActivityKind;
    actorUserId: string | null;
    result: PhysicalDeviceListItemDto;
    changeSummary: string;
    route?: string;
    metaJson?: Record<string, unknown>;
    requestContext?: ReturnType<typeof AuditService.contextFromRequest>;
  },
): Promise<string | null> {
  const description =
    input.lifecycleAction === 'UNINSTALL'
      ? `Physical device uninstalled ${input.result.internalInventoryNumber}`
      : `Physical device returned to stock ${input.result.internalInventoryNumber}`;

  const activityLogId = await audit.record({
    ...(input.requestContext ?? {}),
    actorUserId: input.actorUserId ?? undefined,
    action: ActivityAction.UPDATE,
    entity: ActivityEntity.ADMIN_OPERATION,
    description,
    changeSummary: input.changeSummary,
    route: input.route,
    metaJson: {
      lifecycleAction: input.lifecycleAction,
      physicalDeviceId: input.result.id,
      ...input.metaJson,
    },
  });

  return activityLogId;
}

/**
 * Awaits activity audit after a successful domain lifecycle write.
 * Throws when domain committed but activity audit failed (no silent void record).
 */
export async function assertPhysicalDeviceLifecycleActivityRecorded(
  audit: AuditService,
  input: {
    lifecycleAction: PhysicalDeviceLifecycleActivityKind;
    actorUserId: string | null;
    result: PhysicalDeviceListItemDto;
    changeSummary: string;
    route?: string;
    metaJson?: Record<string, unknown>;
    requestContext?: ReturnType<typeof AuditService.contextFromRequest>;
  },
): Promise<string> {
  const activityLogId = await recordPhysicalDeviceLifecycleActivityAudit(audit, input);
  if (!activityLogId) {
    throw physicalDeviceLifecycleCommittedActivityAuditFailure(
      input.lifecycleAction,
      toSafeOperatorResultSummary(input.result),
    );
  }
  return activityLogId;
}
