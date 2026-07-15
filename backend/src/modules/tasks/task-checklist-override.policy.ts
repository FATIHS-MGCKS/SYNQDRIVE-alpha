import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
  type PermissionActor,
} from '@shared/auth/permission.util';
import type { OpenRequiredChecklistItem } from './task-checklist-completion.policy';

export const TASK_OVERRIDE_REASON_REQUIRED = 'TASK_OVERRIDE_REASON_REQUIRED';
export const TASK_CHECKLIST_OVERRIDE_FORBIDDEN = 'TASK_CHECKLIST_OVERRIDE_FORBIDDEN';

export const TASK_CHECKLIST_OVERRIDE_PERMISSION_MODULE = 'tasks' as const;
export const TASK_CHECKLIST_OVERRIDE_PERMISSION_LEVEL = 'manage' as const;

export interface ManualCompletionOverrideInput {
  overrideIncompleteChecklist?: boolean;
  overrideReason?: string;
}

export interface ResolvedManualCompletionChecklistGate {
  checklistOverridden: boolean;
  openRequiredItems: OpenRequiredChecklistItem[];
  overrideReason?: string;
}

export function canOverrideTaskChecklistCompletion(
  actor: PermissionActor | undefined,
  membership: { role: MembershipRole; permissions: unknown } | null,
): boolean {
  if (!actor?.id) return false;
  if (actor.platformRole === 'MASTER_ADMIN') return true;
  if (!membership) return false;
  if (membership.role === MembershipRole.ORG_ADMIN) return true;

  const normalized = normalizeMembershipPermissions(membership.permissions);
  return evaluateModulePermission(
    normalized,
    TASK_CHECKLIST_OVERRIDE_PERMISSION_MODULE,
    TASK_CHECKLIST_OVERRIDE_PERMISSION_LEVEL,
  );
}

export async function assertTaskChecklistCompletionOverrideAllowed(
  prisma: {
    organizationMembership: {
      findFirst: (args: unknown) => Promise<{ role: MembershipRole; permissions: unknown } | null>;
    };
  },
  actor: PermissionActor | undefined,
  orgId: string,
): Promise<void> {
  if (!actor?.id) {
    throw new ForbiddenException('Authentication required');
  }
  if (actor.platformRole === 'MASTER_ADMIN') return;

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId: actor.id,
      organizationId: orgId,
      status: 'ACTIVE',
    },
    select: { role: true, permissions: true },
  });

  if (!membership) {
    throw new ForbiddenException('You do not have access to this organization');
  }

  if (!canOverrideTaskChecklistCompletion(actor, membership)) {
    throw new ForbiddenException({
      statusCode: 403,
      code: TASK_CHECKLIST_OVERRIDE_FORBIDDEN,
      message: 'Keine Berechtigung für den Checklisten-Override beim Task-Abschluss.',
    });
  }
}

export function assertOverrideReasonProvided(overrideReason?: string): string {
  const reason = overrideReason?.trim();
  if (!reason) {
    throw new BadRequestException({
      statusCode: 400,
      code: TASK_OVERRIDE_REASON_REQUIRED,
      message: 'Eine Begründung ist für den Manager-Override erforderlich.',
    });
  }
  return reason;
}

export function resolveManualCompletionChecklistGate(
  openRequiredItems: OpenRequiredChecklistItem[],
  override?: ManualCompletionOverrideInput,
): ResolvedManualCompletionChecklistGate {
  if (openRequiredItems.length === 0) {
    return { checklistOverridden: false, openRequiredItems: [] };
  }

  if (!override?.overrideIncompleteChecklist) {
    return { checklistOverridden: false, openRequiredItems };
  }

  const overrideReason = assertOverrideReasonProvided(override.overrideReason);
  return { checklistOverridden: true, openRequiredItems, overrideReason };
}
